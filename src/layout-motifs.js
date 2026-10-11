/** Small, generic topology motifs inspired by the supplied template diagrams.
 * This module never matches a template name or changes the template fields.
 * All returned coordinates are top-left positions in browser canvas space.
 */
const cmp = (a, b) => Number.isFinite(+a) && Number.isFinite(+b) ? +a - +b : String(a).localeCompare(String(b));
const START = z => String(z.human_start ?? '').toLowerCase().trim() === 'x' || String(z.computer_start ?? '').toLowerCase().trim() === 'x';
const norm = (coords, width = 228, height = 220, pad = 82) => {
    const ids = Object.keys(coords);
    if (!ids.length)
        return null;
    let scale = 1;
    for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
            const a = coords[ids[i]], b = coords[ids[j]], gap = Math.max(Math.abs(a.x - b.x) / (width + pad), Math.abs(a.y - b.y) / (height + pad));
            if (gap < 1e-7)
                return null;
            scale = Math.max(scale, 1 / gap);
        }
    if (!Number.isFinite(scale) || scale > 5000)
        return null;
    const minX = Math.min(...ids.map(id => coords[id].x)), minY = Math.min(...ids.map(id => coords[id].y));
    return Object.fromEntries(ids.map(id => [id, { x: Math.round((coords[id].x - minX) * scale + 120), y: Math.round((coords[id].y - minY) * scale + 120) }]));
};
const connected = g => {
    if (!g.ids.length)
        return false;
    const seen = new Set([g.ids[0]]), queue = [g.ids[0]];
    for (let k = 0; k < queue.length; k++)
        for (const next of g.adjacency.get(queue[k]))
            if (!seen.has(next)) {
                seen.add(next);
                queue.push(next);
            }
    return seen.size === g.ids.length;
};
const bfs = (g, root) => {
    const distances = new Map([[root, 0]]), queue = [root];
    for (let k = 0; k < queue.length; k++)
        for (const next of g.adjacency.get(queue[k]))
            if (!distances.has(next)) {
                distances.set(next, distances.get(queue[k]) + 1);
                queue.push(next);
            }
    return distances;
};
/** Pure cycle: follow edges rather than sorting numeric IDs. */
export function cycleLayout(map, g) {
    if (g.ids.length < 5 || g.ids.length > 36 || g.edges.length !== g.ids.length || g.ids.some(id => g.adjacency.get(id).size !== 2) || !connected(g))
        return null;
    const first = g.ids.slice().sort(cmp)[0], neighbors = [...g.adjacency.get(first)].sort(cmp), order = [first];
    let previous = first, current = neighbors[0];
    while (current !== first && order.length <= g.ids.length) {
        order.push(current);
        const next = [...g.adjacency.get(current)].find(id => id !== previous);
        previous = current;
        current = next;
    }
    if (order.length !== g.ids.length || current !== first)
        return null;
    const coords = {}, r = Math.max(3.1, order.length / 2.3);
    order.forEach((id, i) => { let theta = 2 * Math.PI * i / order.length - Math.PI / 2; coords[id] = { x: r * Math.cos(theta), y: r * Math.sin(theta) }; });
    return norm(coords);
}
/** A center with one outer radial branch for each of its direct neighbors. */
export function radialHubLayout(map, g) {
    const n = g.ids.length;
    if (n < 4 || n > 28 || !connected(g))
        return null;
    const center = g.ids.find(id => g.adjacency.get(id).size === n - 1);
    if (!center)
        return null;
    // A dense complete graph is not a star; do not force a radial view on it.
    const rimEdges = g.edges.filter(([a, b]) => a !== center && b !== center);
    if (rimEdges.length > n / 2)
        return null;
    const byId = new Map(map.zones.map(z => [String(z.id), z]));
    const ring = g.ids.filter(id => id !== center).sort((a, b) => Number(START(byId.get(b))) - Number(START(byId.get(a))) || cmp(a, b));
    const coords = { [center]: { x: 0, y: 0 } }, r = Math.max(3.5, ring.length / 2.3);
    ring.forEach((id, i) => { const angle = -Math.PI / 2 + 2 * Math.PI * i / ring.length; coords[id] = { x: r * Math.cos(angle), y: r * Math.sin(angle) }; });
    return norm(coords);
}
/**
 * Core-and-shell layout for sparse templates with a small biconnected-like
 * center and several simple chains leading outward. Peeling the graph to its
 * 2-core makes this independent of source zone numbering and works especially
 * well for the common "central treasure area + outer starts" topology.
 */
export function coreShellLayout(map, g) {
    const n = g.ids.length;
    if (n < 9 || n > 42 || !connected(g))
        return null;
    const degree = new Map(g.ids.map(id => [id, g.adjacency.get(id).size]));
    const removed = new Set(), queue = g.ids.filter(id => degree.get(id) < 2).sort(cmp);
    for (let k = 0; k < queue.length; k++) {
        const id = queue[k];
        if (removed.has(id))
            continue;
        removed.add(id);
        for (const next of g.adjacency.get(id)) {
            if (removed.has(next))
                continue;
            degree.set(next, degree.get(next) - 1);
            if (degree.get(next) < 2)
                queue.push(next);
        }
    }
    const core = g.ids.filter(id => !removed.has(id));
    if (core.length < 4 || core.length > 11 || removed.size < 4 || core.length > Math.ceil(n * .62))
        return null;
    const coreSet = new Set(core), coreDegree = id => [...g.adjacency.get(id)].filter(x => coreSet.has(x)).length;
    const center = core.slice().sort((a, b) => coreDegree(b) - coreDegree(a) || cmp(a, b))[0];
    if (coreDegree(center) !== core.length - 1)
        return null;
    const rim = core.filter(id => id !== center), rimSet = new Set(rim);
    if (rim.some(id => [...g.adjacency.get(id)].filter(x => rimSet.has(x)).length > 2))
        return null;

    // External components must be unbranched paths attached to exactly one core
    // vertex. This conservative check prevents the motif from flattening an
    // unrelated topology merely because it happens to have a dense center.
    const outside = new Set(g.ids.filter(id => !coreSet.has(id))), seen = new Set(), branches = new Map(core.map(id => [id, []]));
    for (const seed of [...outside].sort(cmp)) {
        if (seen.has(seed))
            continue;
        const component = [], pending = [seed], attachments = new Set();
        seen.add(seed);
        for (let k = 0; k < pending.length; k++) {
            const id = pending[k];
            component.push(id);
            for (const next of g.adjacency.get(id)) {
                if (coreSet.has(next))
                    attachments.add(next);
                else if (outside.has(next) && !seen.has(next)) {
                    seen.add(next);
                    pending.push(next);
                }
            }
        }
        if (attachments.size !== 1 || component.some(id => [...g.adjacency.get(id)].filter(x => outside.has(x)).length > 2))
            return null;
        const anchor = [...attachments][0];
        // The center is kept visually clear; shells radiate from rim vertices.
        if (anchor === center)
            return null;
        const first = component.filter(id => g.adjacency.get(id).has(anchor));
        if (first.length !== 1)
            return null;
        const order = [], local = new Set(component);
        let previous = anchor, current = first[0];
        while (current) {
            order.push(current);
            const next = [...g.adjacency.get(current)].filter(id => local.has(id) && id !== previous);
            if (next.length > 1)
                return null;
            previous = current;
            current = next[0];
        }
        if (order.length !== component.length)
            return null;
        branches.get(anchor).push(order);
    }
    if ([...branches.values()].flat().reduce((sum, path) => sum + path.length, 0) !== removed.size)
        return null;

    // Keep edges between rim vertices local on the circle by walking each path
    // component consecutively. Components are then ordered deterministically by
    // topology-derived branch load, with IDs used only as a final tie breaker.
    const rimSeen = new Set(), rimGroups = [];
    for (const seed of rim.slice().sort(cmp)) {
        if (rimSeen.has(seed))
            continue;
        const component = [], pending = [seed];
        rimSeen.add(seed);
        for (let k = 0; k < pending.length; k++) {
            const id = pending[k];
            component.push(id);
            for (const next of g.adjacency.get(id))
                if (rimSet.has(next) && !rimSeen.has(next)) {
                    rimSeen.add(next);
                    pending.push(next);
                }
        }
        const endpoints = component.filter(id => [...g.adjacency.get(id)].filter(x => rimSet.has(x)).length <= 1).sort(cmp);
        let current = endpoints[0] ?? component.slice().sort(cmp)[0], previous = null;
        const order = [];
        while (current && !order.includes(current)) {
            order.push(current);
            const next = [...g.adjacency.get(current)].filter(id => rimSet.has(id) && id !== previous && component.includes(id)).sort(cmp);
            previous = current;
            current = next.find(id => !order.includes(id));
        }
        if (order.length !== component.length)
            return null;
        rimGroups.push(order);
    }
    const load = group => group.reduce((sum, id) => sum + branches.get(id).length, 0);
    rimGroups.sort((a, b) => load(b) - load(a) || b.length - a.length || cmp(a[0], b[0]));
    const ring = rimGroups.flat(), coords = { [center]: { x: 0, y: 0 } };
    const radius = Math.max(3.2, ring.length / 1.45);
    ring.forEach((id, i) => {
        const angle = -Math.PI / 2 + 2 * Math.PI * i / ring.length;
        coords[id] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
        const arms = branches.get(id).slice().sort((a, b) => b.length - a.length || cmp(a[0], b[0]));
        const fan = Math.min(.62, .24 + arms.length * .1);
        arms.forEach((path, j) => {
            const offset = arms.length === 1 ? 0 : (j - (arms.length - 1) / 2) * fan / Math.max(1, arms.length - 1);
            const theta = angle + offset;
            path.forEach((node, depth) => {
                const r = radius + (depth + 1) * 2.75;
                coords[node] = { x: r * Math.cos(theta), y: r * Math.sin(theta) };
            });
        });
    });
    return Object.keys(coords).length === n ? norm(coords) : null;
}

/**
 * Symmetric two-hub compositions: the template diagrams show common
 * left / right clusters linked via one or more connections. A pair is accepted
 * only when most other vertices are leaves or short paths attached to a hub.
 */
export function twinHubLayout(map, g) {
    const n = g.ids.length;
    if (n < 6 || n > 24 || !connected(g))
        return null;
    const hubs = [...g.ids].sort((a, b) => g.adjacency.get(b).size - g.adjacency.get(a).size || cmp(a, b)).slice(0, 2);
    const [left, right] = hubs;
    if (g.adjacency.get(left).size < 3 || g.adjacency.get(right).size < 3)
        return null;
    const extras = g.ids.filter(id => id !== left && id !== right);
    const leftSet = [], rightSet = [], shared = [], unattached = [];
    for (const id of extras) {
        const adj = g.adjacency.get(id), l = adj.has(left), r = adj.has(right);
        if (l && r)
            shared.push(id);
        else if (l)
            leftSet.push(id);
        else if (r)
            rightSet.push(id);
        else
            unattached.push(id);
    }
    if (unattached.length || leftSet.length < 1 || rightSet.length < 1 || shared.length > 4)
        return null;
    // No arbitrary inner mesh that would look misleading when flattened to two hubs.
    if (extras.some(id => g.adjacency.get(id).size > 3))
        return null;
    if (g.edges.some(([a, b]) => a !== left && a !== right && b !== left && b !== right))
        return null;
    const nodes = {};
    nodes[left] = { x: -3.2, y: 0 };
    nodes[right] = { x: 3.2, y: 0 };
    const put = (items, x, span = 2.5) => items.sort(cmp).forEach((id, i) => { nodes[id] = { x, y: (i - (items.length - 1) / 2) * Math.max(1.9, span / Math.sqrt(items.length)) }; });
    put(leftSet, -7.0);
    put(rightSet, 7.0);
    shared.sort(cmp).forEach((id, i) => { nodes[id] = { x: 0, y: (i - (shared.length - 1) / 2) * 3.0 }; });
    return norm(nodes);
}
/**
 * Two terminal starts define left and right. Other vertices are placed in BFS
 * layers; barycentric sweeps order each layer to reduce crossings independently
 * of source zone numbers. Suitable for symmetric corridor / diamond diagrams.
 */
export function terminalLayersLayout(map, g) {
    const n = g.ids.length;
    if (n < 5 || n > 27 || !connected(g))
        return null;
    const starts = map.zones.filter(START).map(z => String(z.id));
    if (starts.length !== 2)
        return null;
    if (starts.some(id => g.adjacency.get(id)?.size !== 1))
        return null;
    const roots = starts.slice().sort(cmp), forward = bfs(g, roots[0]), reverse = bfs(g, roots[1]);
    const endLevel = forward.get(roots[1]);
    if (endLevel < 3)
        return null;
    const maxLevel = Math.max(...forward.values());
    if (endLevel < maxLevel - 1)
        return null;
    // Only accept graphs with no long backwards branches unrelated to the spine.
    if (g.ids.some(id => forward.get(id) + reverse.get(id) > endLevel + 2))
        return null;
    const layers = Array.from({ length: maxLevel + 1 }, () => []);
    for (const id of g.ids)
        layers[forward.get(id)].push(id);
    if (layers.some(row => row.length > 7))
        return null;
    for (const row of layers)
        row.sort(cmp);
    const prevScore = (id, i, rows) => {
        const prev = rows[i - 1] ?? [], adj = prev.map((id, j) => [id, j]).filter(([neighbor]) => g.adjacency.get(id).has(neighbor));
        return adj.length ? adj.reduce((s, [, j]) => s + j, 0) / adj.length : Infinity;
    };
    for (let sweep = 0; sweep < 6; sweep++) {
        for (let i = 1; i < layers.length; i++)
            layers[i].sort((a, b) => prevScore(a, i, layers) - prevScore(b, i, layers) || cmp(a, b));
        for (let i = layers.length - 2; i >= 0; i--) {
            const next = layers[i + 1];
            const avg = id => { const found = next.map((neighbor, k) => g.adjacency.get(id).has(neighbor) ? k : null).filter(k => k !== null); return found.length ? found.reduce((a, b) => a + b, 0) / found.length : Infinity; };
            layers[i].sort((a, b) => avg(a) - avg(b) || cmp(a, b));
        }
    }
    const coords = {};
    layers.forEach((row, i) => row.forEach((id, j) => { coords[id] = { x: i * 3.15, y: (j - (row.length - 1) / 2) * 2.6 }; }));
    return norm(coords);
}


/**
 * Candidate layouts derived from chordless four-cycles.
 *
 * Many RMG templates are built around a diamond-like planar skeleton. For a
 * four-cycle (top/right/bottom/left), differences of graph distances to
 * opposite corners provide stable, topology-only coordinates. Vertices that
 * land on the same grid point are spread along the local tangent according to
 * their neighbours, which preserves the natural symmetry without relying on
 * zone-number order.
 *
 * The caller still validates crossings/obstructions and compares this against
 * all other generic layouts, so a non-facial four-cycle cannot make a layout
 * worse merely because it exists in the graph.
 */
export function quadrilateralFaceLayouts(map, g) {
    const n = g.ids.length;
    if (n < 7 || n > 32 || !connected(g) || g.edges.length < n)
        return [];

    const ids = g.ids.slice().sort(cmp), rank = new Map(ids.map((id, i) => [id, i]));
    const keyOf = cycle => {
        const variants = [];
        for (const seq of [cycle, cycle.slice().reverse()])
            for (let i = 0; i < 4; i++) {
                const rotated = seq.slice(i).concat(seq.slice(0, i));
                variants.push(rotated);
            }
        variants.sort((a, b) => {
            for (let i = 0; i < 4; i++) {
                const d = rank.get(a[i]) - rank.get(b[i]);
                if (d)
                    return d;
            }
            return 0;
        });
        return variants[0].join('\u0001');
    };
    const connectedWithout = removed => {
        const left = ids.filter(id => !removed.has(id));
        if (left.length <= 1)
            return true;
        const seen = new Set([left[0]]), queue = [left[0]];
        for (let k = 0; k < queue.length; k++)
            for (const next of g.adjacency.get(queue[k]))
                if (!removed.has(next) && !seen.has(next)) {
                    seen.add(next);
                    queue.push(next);
                }
        return seen.size === left.length;
    };

    // In an induced quadrilateral, opposite vertices are non-adjacent and have
    // the other two cycle vertices as common neighbours.
    const found = new Map();
    for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
            const a = ids[i], c = ids[j];
            if (g.adjacency.get(a).has(c))
                continue;
            const common = [...g.adjacency.get(a)].filter(id => g.adjacency.get(c).has(id)).sort(cmp);
            for (let p = 0; p < common.length; p++)
                for (let q = p + 1; q < common.length; q++) {
                    const b = common[p], d = common[q];
                    if (g.adjacency.get(b).has(d))
                        continue; // chord b-d: not an induced four-cycle
                    const cycle = [a, b, c, d], key = keyOf(cycle);
                    if (!found.has(key))
                        found.set(key, { cycle, nonSeparating: connectedWithout(new Set(cycle)) });
                }
        }
    if (!found.size)
        return [];

    // Facial cycles in a 3-connected planar graph are non-separating. Try
    // those first, but retain the rest as validated fallbacks for graphs with
    // articulation points and other common RMG structures.
    const idSpan = cycle => {
        const values = cycle.map(Number);
        return values.every(Number.isFinite) ? Math.max(...values) - Math.min(...values) : Infinity;
    };
    const cycles = [...found.values()].sort((a, b) => Number(b.nonSeparating) - Number(a.nonSeparating)
        || b.cycle.reduce((s, id) => s + g.adjacency.get(id).size, 0) - a.cycle.reduce((s, id) => s + g.adjacency.get(id).size, 0)
        // IDs are intentionally only a final tie-break. When topology is truly
        // symmetric, a compact source-number run usually preserves the author's
        // visual grouping without making numbering part of the graph model.
        || idSpan(a.cycle) - idSpan(b.cycle)
        || cmp(a.cycle[0], b.cycle[0])).slice(0, 28);
    const candidates = [];
    for (const { cycle } of cycles) {
        const orientations = Array.from({ length: 4 }, (_, rotation) => cycle.slice(rotation).concat(cycle.slice(0, rotation)));
        const numeric = cycle.map(Number);
        if (numeric.every(Number.isFinite)) {
            const highest = Math.max(...numeric);
            orientations.sort((a, b) => {
                const topA = Number(a[0]) === highest ? 0 : 1, topB = Number(b[0]) === highest ? 0 : 1;
                if (topA !== topB)
                    return topA - topB;
                const sideA = Number(a[1]) <= Number(a[3]) ? 0 : 1, sideB = Number(b[1]) <= Number(b[3]) ? 0 : 1;
                return sideA - sideB;
            });
        }
        for (const ordered of orientations) {
            const [top, right, bottom, left] = ordered;
            const dt = bfs(g, top), dr = bfs(g, right), db = bfs(g, bottom), dl = bfs(g, left);
            if (ids.some(id => !dt.has(id) || !dr.has(id) || !db.has(id) || !dl.has(id)))
                continue;
            const coarse = {};
            for (const id of ids)
                coarse[id] = { x: dl.get(id) - dr.get(id), y: dt.get(id) - db.get(id) };

            // The cycle itself is the outside diamond. Distance coordinates can
            // coincide with inner vertices, so push only these four corners one
            // lattice step outward before spreading ties.
            const xs = ids.map(id => coarse[id].x), ys = ids.map(id => coarse[id].y);
            coarse[top] = { x: coarse[top].x, y: Math.min(...ys) - 1 };
            coarse[bottom] = { x: coarse[bottom].x, y: Math.max(...ys) + 1 };
            coarse[right] = { x: Math.max(...xs) + 1, y: coarse[right].y };
            coarse[left] = { x: Math.min(...xs) - 1, y: coarse[left].y };

            const groups = new Map();
            for (const id of ids) {
                if ([top, right, bottom, left].includes(id))
                    continue;
                // Group by the original distance lattice; cycle vertices were
                // deliberately moved outward above.
                const x = dl.get(id) - dr.get(id), y = dt.get(id) - db.get(id), key = `${x},${y}`;
                if (!groups.has(key))
                    groups.set(key, []);
                groups.get(key).push(id);
            }
            const baseX = 360, baseY = 450, tieGap = 300, coords = {};
            const zoneById = new Map(map.zones.map(zone => [String(zone.id), zone]));
            for (const id of ids)
                coords[id] = { x: coarse[id].x * baseX, y: coarse[id].y * baseY };

            for (const group of groups.values()) {
                if (group.length < 2)
                    continue;
                const sample = group[0], originalX = dl.get(sample) - dr.get(sample), originalY = dt.get(sample) - db.get(sample);
                const side = Math.abs(originalX) >= Math.abs(originalY) && originalX !== 0;
                const score = id => {
                    const neighbors = [...g.adjacency.get(id)];
                    if (!neighbors.length)
                        return 0;
                    const axis = side ? 'y' : 'x';
                    return neighbors.reduce((sum, other) => {
                        const x = dl.get(other) - dr.get(other), y = dt.get(other) - db.get(other);
                        return sum + (axis === 'y' ? y : x);
                    }, 0) / neighbors.length;
                };
                group.sort((a, b) => score(a) - score(b)
                    || g.adjacency.get(a).size - g.adjacency.get(b).size
                    || cmp(a, b));
                const hasStart = group.some(id => START(zoneById.get(id)));
                group.forEach((id, i) => {
                    const offset = (i - (group.length - 1) / 2) * tieGap;
                    if (side) {
                        coords[id].y += offset;
                        // In common mirrored start structures the player zone is
                        // the middle shell between the outer face and the two
                        // inner branches. Pull the non-start members slightly
                        // inward so these four edges do not form a bow-tie.
                        if (hasStart && !START(zoneById.get(id)))
                            coords[id].x -= Math.sign(originalX) * 120;
                    }
                    else {
                        coords[id].x += offset;
                        if (hasStart && !START(zoneById.get(id)))
                            coords[id].y -= Math.sign(originalY) * 120;
                    }
                });
            }
            const positioned = norm(coords, 228, 220, 68);

            // A zero-crossing quadrilateral also gives us a valid planar face.
            // A barycentric embedding places every inner vertex inside that
            // face using graph topology alone; light row quantization then
            // exposes the repeated layers common in symmetric RMG templates.
            const harmonic = {
                [top]: { x: 0, y: -1 },
                [right]: { x: 1, y: 0 },
                [bottom]: { x: 0, y: 1 },
                [left]: { x: -1, y: 0 }
            };
            const boundary = new Set([top, right, bottom, left]);
            for (const id of ids)
                if (!boundary.has(id))
                    harmonic[id] = { x: 0, y: 0 };
            for (let iter = 0; iter < 600; iter++) {
                let delta = 0;
                const next = {};
                for (const id of ids) {
                    if (boundary.has(id)) {
                        next[id] = harmonic[id];
                        continue;
                    }
                    const neighbors = [...g.adjacency.get(id)];
                    const x = neighbors.reduce((sum, other) => sum + harmonic[other].x, 0) / neighbors.length;
                    const y = neighbors.reduce((sum, other) => sum + harmonic[other].y, 0) / neighbors.length;
                    delta = Math.max(delta, Math.hypot(x - harmonic[id].x, y - harmonic[id].y));
                    next[id] = { x, y };
                }
                Object.assign(harmonic, next);
                if (delta < 1e-8)
                    break;
            }
            const levels = [];
            for (const id of ids) {
                const value = Math.abs(harmonic[id].y);
                if (value < 1e-5)
                    continue;
                if (!levels.some(level => Math.abs(level - value) < .018))
                    levels.push(value);
            }
            levels.sort((a, b) => a - b);
            const layered = levels.length <= Math.max(6, Math.ceil(n / 4));
            const harmonicCoords = {};
            for (const id of ids) {
                const point = harmonic[id];
                let ax = Math.abs(point.x);
                if (START(zoneById.get(id)) && ax > 1e-5 && ax < .995)
                    ax = Math.min(.96, ax + .15);
                let y = point.y;
                if (layered && Math.abs(y) >= 1e-5) {
                    let index = 0, bestDistance = Infinity;
                    for (let i = 0; i < levels.length; i++) {
                        const distance = Math.abs(levels[i] - Math.abs(y));
                        if (distance < bestDistance) {
                            bestDistance = distance;
                            index = i;
                        }
                    }
                    y = Math.sign(y) * (index + 1) / levels.length;
                }
                harmonicCoords[id] = {
                    x: Math.sign(point.x) * ax ** 2.2,
                    y
                };
            }
            const harmonicPositioned = norm(harmonicCoords, 228, 220, 68);
            // Prefer the harmonic form when it is valid: it preserves the same
            // planar face but tends to reveal the graph's natural rows.
            if (harmonicPositioned && straightCrossings(g, harmonicPositioned) === 0)
                candidates.push(harmonicPositioned);
            if (positioned && straightCrossings(g, positioned) === 0)
                candidates.push(positioned);
        }
    }
    return candidates;
}

/**
 * Generic planar candidates from short chordless cycles.
 *
 * Removing one edge and finding alternate shortest paths exposes many facial
 * cycles without requiring a full planarity implementation. Each cycle is
 * then used as the fixed convex boundary of a barycentric embedding. Invalid
 * faces simply produce crossings and are discarded by the final validation.
 */
export function polygonFaceLayouts(map, g) {
    const n = g.ids.length;
    if (n < 6 || n > 30 || !connected(g) || g.edges.length < n - 1 || g.edges.length > 54)
        return [];
    const ids = g.ids.slice().sort(cmp), zoneById = new Map(map.zones.map(zone => [String(zone.id), zone]));
    const edgeKey = (a, b) => cmp(a, b) < 0 ? `${a}\u0001${b}` : `${b}\u0001${a}`;
    const canonicalCycle = cycle => {
        const variants = [];
        for (const seq of [cycle, cycle.slice().reverse()])
            for (let i = 0; i < cycle.length; i++)
                variants.push(seq.slice(i).concat(seq.slice(0, i)));
        variants.sort((a, b) => {
            for (let i = 0; i < a.length; i++) {
                const d = cmp(a[i], b[i]);
                if (d)
                    return d;
            }
            return 0;
        });
        return variants[0].join('\u0001');
    };
    const chordless = cycle => {
        for (let i = 0; i < cycle.length; i++)
            for (let j = i + 1; j < cycle.length; j++) {
                const adjacent = j === i + 1 || (i === 0 && j === cycle.length - 1);
                if (!adjacent && g.adjacency.get(cycle[i]).has(cycle[j]))
                    return false;
            }
        return true;
    };
    const connectedWithout = removed => {
        const left = ids.filter(id => !removed.has(id));
        if (left.length <= 1)
            return true;
        const seen = new Set([left[0]]), queue = [left[0]];
        for (let k = 0; k < queue.length; k++)
            for (const next of g.adjacency.get(queue[k]))
                if (!removed.has(next) && !seen.has(next)) {
                    seen.add(next);
                    queue.push(next);
                }
        return seen.size === left.length;
    };
    const found = new Map();
    for (const [source, target] of g.edges) {
        const blocked = edgeKey(source, target), distance = new Map([[source, 0]]), queue = [source];
        for (let k = 0; k < queue.length; k++) {
            const current = queue[k], nextDistance = distance.get(current) + 1;
            if (nextDistance > 9)
                continue;
            for (const next of [...g.adjacency.get(current)].sort(cmp)) {
                if (edgeKey(current, next) === blocked || distance.has(next))
                    continue;
                distance.set(next, nextDistance);
                queue.push(next);
            }
        }
        const length = distance.get(target);
        if (!Number.isFinite(length) || length < 2 || length > 9)
            continue;
        const paths = [], reverse = [target];
        const collect = current => {
            if (paths.length >= 4)
                return;
            if (current === source) {
                paths.push(reverse.slice().reverse());
                return;
            }
            const previous = [...g.adjacency.get(current)].filter(next => distance.get(next) === distance.get(current) - 1 && edgeKey(current, next) !== blocked).sort(cmp);
            for (const next of previous) {
                reverse.push(next);
                collect(next);
                reverse.pop();
                if (paths.length >= 4)
                    break;
            }
        };
        collect(target);
        for (const cycle of paths) {
            if (cycle.length < 3 || cycle.length > 10 || !chordless(cycle))
                continue;
            const key = canonicalCycle(cycle);
            if (!found.has(key))
                found.set(key, {
                    cycle,
                    nonSeparating: connectedWithout(new Set(cycle)),
                    starts: cycle.filter(id => START(zoneById.get(id))).length
                });
        }
    }
    const cycles = [...found.values()].sort((a, b) => Number(b.nonSeparating) - Number(a.nonSeparating)
        || b.starts - a.starts
        || b.cycle.length - a.cycle.length
        || b.cycle.reduce((sum, id) => sum + g.adjacency.get(id).size, 0) - a.cycle.reduce((sum, id) => sum + g.adjacency.get(id).size, 0)
        || canonicalCycle(a.cycle).localeCompare(canonicalCycle(b.cycle))).slice(0, 36);
    const candidates = [];
    for (const { cycle } of cycles) {
        const boundary = new Set(cycle), points = {};
        cycle.forEach((id, i) => {
            const angle = -Math.PI / 2 + i * Math.PI * 2 / cycle.length;
            points[id] = { x: Math.cos(angle), y: Math.sin(angle) };
        });
        for (const id of ids)
            if (!boundary.has(id))
                points[id] = { x: 0, y: 0 };
        for (let iter = 0; iter < 700; iter++) {
            let delta = 0;
            const next = {};
            for (const id of ids) {
                if (boundary.has(id)) {
                    next[id] = points[id];
                    continue;
                }
                const neighbors = [...g.adjacency.get(id)];
                const x = neighbors.reduce((sum, other) => sum + points[other].x, 0) / neighbors.length;
                const y = neighbors.reduce((sum, other) => sum + points[other].y, 0) / neighbors.length;
                delta = Math.max(delta, Math.hypot(x - points[id].x, y - points[id].y));
                next[id] = { x, y };
            }
            Object.assign(points, next);
            if (delta < 1e-8)
                break;
        }
        const positioned = norm(points, 228, 220, 68);
        if (positioned && straightCrossings(g, positioned) === 0)
            candidates.push(positioned);
        if (candidates.length >= 12)
            break;
    }
    return candidates;
}


/**
 * Recover a small outer-planar ring hidden behind degree-one/tree branches.
 * This targets authored layouts where a cyclic core forms the visible frame
 * and starts/support zones hang outside it. The perimeter is proven purely
 * from topology with a bounded Hamiltonian search.
 */
export function coreRingLayouts(map, g) {
    const n = g.ids.length;
    if (n < 8 || n > 30 || !connected(g))
        return [];
    const degree = new Map(g.ids.map(id => [id, g.adjacency.get(id).size]));
    const removed = new Set(), queue = g.ids.filter(id => degree.get(id) < 2).sort(cmp);
    for (let i = 0; i < queue.length; i++) {
        const id = queue[i];
        if (removed.has(id))
            continue;
        removed.add(id);
        for (const next of g.adjacency.get(id)) {
            if (removed.has(next))
                continue;
            degree.set(next, degree.get(next) - 1);
            if (degree.get(next) < 2)
                queue.push(next);
        }
    }
    const coreIds = g.ids.filter(id => !removed.has(id));
    if (coreIds.length < 6 || coreIds.length > 14 || coreIds.length === n)
        return [];
    const coreSet = new Set(coreIds), coreAdjacency = new Map(coreIds.map(id => [id, new Set()])), coreEdges = [];
    for (const [a, b] of g.edges) {
        if (!coreSet.has(a) || !coreSet.has(b))
            continue;
        coreAdjacency.get(a).add(b);
        coreAdjacency.get(b).add(a);
        coreEdges.push([a, b]);
    }
    const coreGraph = { ids: coreIds, adjacency: coreAdjacency, edges: coreEdges };
    if (!connected(coreGraph))
        return [];

    // Every peeled component must be a tree attached to exactly one core hub.
    const outside = new Set(g.ids.filter(id => removed.has(id))), seen = new Set(), branches = [];
    for (const seed of [...outside].sort(cmp)) {
        if (seen.has(seed))
            continue;
        const ids = [], pending = [seed], attachments = new Set();
        seen.add(seed);
        for (let i = 0; i < pending.length; i++) {
            const id = pending[i];
            ids.push(id);
            for (const next of g.adjacency.get(id)) {
                if (coreSet.has(next))
                    attachments.add(next);
                else if (outside.has(next) && !seen.has(next)) {
                    seen.add(next);
                    pending.push(next);
                }
            }
        }
        const local = new Set(ids), edgeCount = g.edges.filter(([a, b]) => local.has(a) && local.has(b)).length;
        if (attachments.size !== 1 || edgeCount !== ids.length - 1)
            return [];
        branches.push({ ids: ids.slice().sort(cmp), anchor: [...attachments][0] });
    }
    if (!branches.length)
        return [];

    // Bounded Hamiltonian perimeter search on the small 2-core.
    const start = coreIds.slice().sort((a, b) => coreAdjacency.get(a).size - coreAdjacency.get(b).size || cmp(a, b))[0];
    const path = [start], used = new Set([start]);
    let perimeter = null, visits = 0;
    const search = current => {
        if (perimeter || ++visits > 60000)
            return;
        if (path.length === coreIds.length) {
            if (coreAdjacency.get(current).has(start))
                perimeter = path.slice();
            return;
        }
        const next = [...coreAdjacency.get(current)].filter(id => !used.has(id)).sort((a, b) => {
            const free = id => [...coreAdjacency.get(id)].filter(other => !used.has(other) || other === start).length;
            return free(a) - free(b) || coreAdjacency.get(a).size - coreAdjacency.get(b).size || cmp(a, b);
        });
        for (const id of next) {
            used.add(id);
            path.push(id);
            search(id);
            path.pop();
            used.delete(id);
            if (perimeter)
                break;
        }
    };
    search(start);
    if (!perimeter)
        return [];

    const raw = {};
    perimeter.forEach((id, index) => {
        const angle = -Math.PI / 2 + index * 2 * Math.PI / perimeter.length;
        const d = coreAdjacency.get(id).size;
        const radius = d <= 2 ? 1.16 : d === 3 ? .88 : .76;
        raw[id] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
    let core = norm(raw, 228, 220, 68);
    if (!core || straightCrossings(coreGraph, core))
        return [];

    const cx = coreIds.reduce((sum, id) => sum + core[id].x, 0) / coreIds.length;
    const cy = coreIds.reduce((sum, id) => sum + core[id].y, 0) / coreIds.length;
    const coords = structuredClone(core), byAnchor = new Map();
    for (const branch of branches) {
        if (!byAnchor.has(branch.anchor))
            byAnchor.set(branch.anchor, []);
        byAnchor.get(branch.anchor).push(branch);
    }
    for (const [anchor, groups] of byAnchor) {
        const anchorPoint = core[anchor];
        let outward = Math.atan2(anchorPoint.y - cy, anchorPoint.x - cx);
        if (!Number.isFinite(outward))
            outward = 0;
        groups.sort((a, b) => b.ids.length - a.ids.length || cmp(a.ids[0], b.ids[0]));
        groups.forEach((branch, groupIndex) => {
            const local = new Set(branch.ids), parent = new Map(), children = new Map(branch.ids.map(id => [id, []]));
            const roots = branch.ids.filter(id => g.adjacency.get(id).has(anchor)).sort(cmp), pending = roots.slice();
            for (const root of roots)
                parent.set(root, anchor);
            for (let i = 0; i < pending.length; i++) {
                const id = pending[i];
                for (const next of [...g.adjacency.get(id)].filter(next => local.has(next) && next !== parent.get(id)).sort(cmp)) {
                    if (parent.has(next))
                        continue;
                    parent.set(next, id);
                    children.get(id).push(next);
                    pending.push(next);
                }
            }
            if (parent.size !== branch.ids.length)
                return;
            const groupOffset = (groupIndex - (groups.length - 1) / 2) * .42;
            const place = (id, angle, depth = 1) => {
                const par = parent.get(id), origin = par === anchor ? anchorPoint : coords[par];
                const step = 390;
                coords[id] = { x: origin.x + Math.cos(angle) * step, y: origin.y + Math.sin(angle) * step };
                const list = children.get(id);
                list.forEach((child, index) => place(child, angle + (index - (list.length - 1) / 2) * .34, depth + 1));
            };
            roots.forEach((root, index) => place(root, outward + groupOffset + (index - (roots.length - 1) / 2) * .38));
        });
    }
    const positioned = norm(coords, 228, 220, 68);
    return positioned && straightCrossings(g, positioned) === 0 ? [positioned] : [];
}

/** Return the first strongly identified generic motif, not a template-specific preset. */
function straightCrossings(g, points) {
    const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    let total = 0;
    for (let i = 0; i < g.edges.length; i++)
        for (let j = i + 1; j < g.edges.length; j++) {
            const [a, b] = g.edges[i], [c, d] = g.edges[j];
            if (new Set([a, b, c, d]).size !== 4)
                continue;
            const p = points[a], q = points[b], r = points[c], s = points[d];
            if (orient(p, q, r) * orient(p, q, s) < -1e-7 && orient(r, s, p) * orient(r, s, q) < -1e-7)
                total++;
        }
    return total;
}
export function motifLayout(map, g) {
    if (!connected(g))
        return null;
    // Reject an aesthetically tempting motif when it introduces intersections.
    // Dense/nonplanar templates keep the established general-purpose fallback.
    for (const strategy of [cycleLayout, radialHubLayout, coreShellLayout, twinHubLayout, terminalLayersLayout]) {
        const proposed = strategy(map, g);
        if (proposed && straightCrossings(g, proposed) === 0)
            return proposed;
    }
    return null;
}
