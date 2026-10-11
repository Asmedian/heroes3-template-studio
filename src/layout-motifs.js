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
