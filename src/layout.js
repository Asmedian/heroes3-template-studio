import { motifLayout, quadrilateralFaceLayouts, polygonFaceLayouts, coreRingLayouts } from './layout-motifs.js';
import { spectralCandidates, distanceCandidates } from './layout-spectral.js';
/** Pure canvas layout and geometry. Positions are top-left browser-space points. */
export const CARD_W = 228, CARD_H = 220;
const isStart = z => [z.human_start, z.computer_start].some(v => String(v).trim().toLowerCase() === 'x');
const isCenter = z => ['treasure', 'junction'].some(k => String(z[k]).trim().toLowerCase() === 'x');
const hash = s => [...s].reduce((n, c) => ((n * 31 + c.charCodeAt(0)) >>> 0), 7);
// A topology-aware arrangement is used only when the graph proves that it has a
// recognizable symmetric structure. Other maps retain the general-purpose layout.
const zoneIdOrder = (a, b) => Number.isFinite(+a) && Number.isFinite(+b) ? +a - +b : String(a).localeCompare(String(b));
function topologyGraph(map) {
    const ids = [...new Set(map.zones.map(z => String(z.id)))];
    if (ids.length !== map.zones.length)
        return null;
    const adjacency = new Map(ids.map(id => [id, new Set()]));
    for (const c of map.connections) {
        const a = String(c.zone1).trim(), b = String(c.zone2).trim();
        if (adjacency.has(a) && adjacency.has(b) && a !== b) {
            adjacency.get(a).add(b);
            adjacency.get(b).add(a);
        }
    }
    const edges = [];
    for (const a of ids)
        for (const b of adjacency.get(a))
            if (zoneIdOrder(a, b) < 0)
                edges.push([a, b]);
    return { ids, adjacency, edges };
}
export function edgeCrossings(edges, points) {
    let count = 0;
    const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    for (let i = 0; i < edges.length; i++)
        for (let j = i + 1; j < edges.length; j++) {
            const [a, b] = edges[i], [c, d] = edges[j];
            if (a === b || a === c || a === d || b === c || b === d || c === d)
                continue;
            const p = points[a], q = points[b], r = points[c], s = points[d];
            if (!p || !q || !r || !s)
                continue;
            const u = orient(p, q, r), v = orient(p, q, s), w = orient(r, s, p), x = orient(r, s, q);
            if (u * v < -1e-7 && w * x < -1e-7)
                count++;
        }
    return count;
}

function median(values) {
    if (!values.length)
        return 0;
    const sorted = values.slice().sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function segmentIntersectsRect(a, b, center, halfW, halfH) {
    const dx = b.x - a.x, dy = b.y - a.y;
    let low = 0, high = 1;
    let p = -dx, q = a.x - (center.x - halfW);
    if (Math.abs(p) < 1e-9) {
        if (q < 0)
            return false;
    }
    else {
        const r = q / p;
        if (p < 0) {
            if (r > high)
                return false;
            low = Math.max(low, r);
        }
        else {
            if (r < low)
                return false;
            high = Math.min(high, r);
        }
    }
    p = dx;
    q = center.x + halfW - a.x;
    if (Math.abs(p) < 1e-9) {
        if (q < 0)
            return false;
    }
    else {
        const r = q / p;
        if (p < 0) {
            if (r > high)
                return false;
            low = Math.max(low, r);
        }
        else {
            if (r < low)
                return false;
            high = Math.min(high, r);
        }
    }
    p = -dy;
    q = a.y - (center.y - halfH);
    if (Math.abs(p) < 1e-9) {
        if (q < 0)
            return false;
    }
    else {
        const r = q / p;
        if (p < 0) {
            if (r > high)
                return false;
            low = Math.max(low, r);
        }
        else {
            if (r < low)
                return false;
            high = Math.min(high, r);
        }
    }
    p = dy;
    q = center.y + halfH - a.y;
    if (Math.abs(p) < 1e-9) {
        if (q < 0)
            return false;
    }
    else {
        const r = q / p;
        if (p < 0) {
            if (r > high)
                return false;
            low = Math.max(low, r);
        }
        else {
            if (r < low)
                return false;
            high = Math.min(high, r);
        }
    }
    return low <= high;
}
export function layoutMetrics(map, positions) {
    const graph = topologyGraph(map);
    if (!graph)
        return { crossings: Infinity, intrusions: Infinity, soft: Infinity };
    const count = graph.ids.length, points = new Array(count), centers = new Array(count), indexById = new Map();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
        const id = graph.ids[i], point = positions?.[id];
        if (!point)
            return { crossings: Infinity, intrusions: Infinity, soft: Infinity };
        points[i] = point;
        centers[i] = { x: point.x + CARD_W / 2, y: point.y + CARD_H / 2 };
        indexById.set(id, i);
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
    }
    const edges = graph.edges.map(([a, b]) => [indexById.get(a), indexById.get(b)]);
    let crossings = 0;
    for (let i = 0; i < edges.length; i++) {
        const [a, b] = edges[i], p = points[a], q = points[b];
        for (let j = i + 1; j < edges.length; j++) {
            const [c, d] = edges[j];
            if (a === c || a === d || b === c || b === d)
                continue;
            const r = points[c], t = points[d];
            const u = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
            const v = (q.x - p.x) * (t.y - p.y) - (q.y - p.y) * (t.x - p.x);
            const w = (t.x - r.x) * (p.y - r.y) - (t.y - r.y) * (p.x - r.x);
            const x = (t.x - r.x) * (q.y - r.y) - (t.y - r.y) * (q.x - r.x);
            if (u * v < -1e-7 && w * x < -1e-7)
                crossings++;
        }
    }
    let intrusions = 0;
    for (const [a, b] of edges)
        for (let i = 0; i < count; i++) {
            if (i === a || i === b)
                continue;
            if (segmentIntersectsRect(centers[a], centers[b], centers[i], CARD_W / 2 + 9, CARD_H / 2 + 9))
                intrusions++;
        }
    const width = maxX - minX + CARD_W, height = maxY - minY + CARD_H;
    const aspect = Math.max(width / Math.max(1, height), height / Math.max(1, width));
    const lengths = edges.map(([a, b]) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y));
    const average = lengths.length ? lengths.reduce((sum, value) => sum + value, 0) / lengths.length : 0;
    const variance = lengths.length ? lengths.reduce((sum, value) => sum + (value - average) ** 2, 0) / lengths.length : 0;
    const coefficient = average > 1e-7 ? Math.sqrt(variance) / average : 0;
    const middle = median(lengths), longest = lengths.length ? Math.max(...lengths) : 0;
    const longRatio = middle > 1e-7 ? longest / middle : 1;
    const areaPerZone = width * height / Math.max(1, count);
    const soft = areaPerZone * (1 + .42 * (aspect - 1) ** 2 + .88 * coefficient + .18 * Math.max(0, longRatio - 1) ** 2);
    return { crossings, intrusions, soft, width, height, average, coefficient };
}
export function betterLayout(map, a, b) {
    if (!a)
        return b;
    if (!b)
        return a;
    const ma = layoutMetrics(map, a), mb = layoutMetrics(map, b);
    const ka = [ma.crossings, ma.intrusions, ma.soft], kb = [mb.crossings, mb.intrusions, mb.soft];
    for (let i = 0; i < ka.length; i++) {
        if (Math.abs(ka[i] - kb[i]) > 1e-7)
            return ka[i] < kb[i] ? a : b;
    }
    return a;
}
function refineObstructions(map, positions, { passes = 2 } = {}) {
    if (!positions || map.zones.length > 30)
        return positions;
    let best = structuredClone(positions), metrics = layoutMetrics(map, best);
    if (!metrics.intrusions)
        return best;
    const ids = map.zones.map(zone => String(zone.id));
    const directions = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4);
    for (let pass = 0; pass < passes && metrics.intrusions; pass++) {
        let changed = false;
        for (const id of ids) {
            let local = best, localMetrics = metrics;
            for (const step of [72, 132]) {
                for (const angle of directions) {
                    const trial = structuredClone(best);
                    trial[id].x += Math.cos(angle) * step;
                    trial[id].y += Math.sin(angle) * step;
                    const separated = separate(trial, 68), next = layoutMetrics(map, separated);
                    const currentKey = [localMetrics.crossings, localMetrics.intrusions, localMetrics.soft];
                    const nextKey = [next.crossings, next.intrusions, next.soft];
                    let wins = false;
                    for (let i = 0; i < currentKey.length; i++) {
                        if (Math.abs(currentKey[i] - nextKey[i]) < 1e-7)
                            continue;
                        wins = nextKey[i] < currentKey[i];
                        break;
                    }
                    if (wins) {
                        local = separated;
                        localMetrics = next;
                    }
                }
            }
            if (local !== best) {
                best = local;
                metrics = localMetrics;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return best;
}
function scaledCandidate(raw, graph, angle, target) {
    const cosine = Math.cos(angle), sine = Math.sin(angle), rotated = {};
    for (const id of graph.ids) {
        const point = raw[id];
        rotated[id] = { x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine };
    }
    const edgeLengths = graph.edges.map(([a, b]) => Math.hypot(rotated[a].x - rotated[b].x, rotated[a].y - rotated[b].y));
    const base = median(edgeLengths) || 1, scale = target / base;
    const placed = Object.fromEntries(graph.ids.map(id => [id, { x: rotated[id].x * scale, y: rotated[id].y * scale }]));
    return separate(placed, 68);
}
function disconnectedLayout(map, graph) {
    const unseen = new Set(graph.ids), components = [];
    while (unseen.size) {
        const first = [...unseen].sort(zoneIdOrder)[0], queue = [first], ids = new Set([first]);
        unseen.delete(first);
        for (let k = 0; k < queue.length; k++) {
            for (const next of graph.adjacency.get(queue[k])) {
                if (!ids.has(next)) {
                    ids.add(next);
                    unseen.delete(next);
                    queue.push(next);
                }
            }
        }
        components.push(ids);
    }
    if (components.length < 2)
        return null;
    const pieces = components.map(ids => {
        const sub = {
            ...map,
            zones: map.zones.filter(zone => ids.has(String(zone.id))),
            connections: map.connections.filter(connection => ids.has(String(connection.zone1).trim()) && ids.has(String(connection.zone2).trim()))
        };
        const positions = autoLayout(sub, { preferStored: false });
        const keys = Object.keys(positions), minX = Math.min(...keys.map(id => positions[id].x)), minY = Math.min(...keys.map(id => positions[id].y));
        const maxX = Math.max(...keys.map(id => positions[id].x + CARD_W)), maxY = Math.max(...keys.map(id => positions[id].y + CARD_H));
        for (const id of keys) {
            positions[id].x -= minX;
            positions[id].y -= minY;
        }
        return { ids, positions, width: maxX - minX, height: maxY - minY };
    });
    pieces.sort((a, b) => b.height * b.width - a.height * a.width || b.ids.size - a.ids.size || zoneIdOrder([...a.ids][0], [...b.ids][0]));
    const gap = 180, totalArea = pieces.reduce((sum, piece) => sum + (piece.width + gap) * (piece.height + gap), 0), targetWidth = Math.max(900, Math.sqrt(totalArea) * 1.18);
    let x = 110, y = 110, rowHeight = 0;
    const combined = {};
    for (const piece of pieces) {
        if (x > 110 && x + piece.width > targetWidth) {
            x = 110;
            y += rowHeight + gap;
            rowHeight = 0;
        }
        for (const [id, point] of Object.entries(piece.positions))
            combined[id] = { x: Math.round(point.x + x), y: Math.round(point.y + y) };
        x += piece.width + gap;
        rowHeight = Math.max(rowHeight, piece.height);
    }
    return combined;
}

function spectralLayout(map, graph) {
    const candidates = spectralCandidates(graph);
    if (!candidates.length)
        return null;
    let best = null;
    for (const raw of candidates) {
        for (const angle of [0, Math.PI / 6, Math.PI / 4]) {
            for (const target of [350, 430, 520]) {
                const placed = scaledCandidate(raw, graph, angle, target);
                best = betterLayout(map, best, placed);
            }
        }
    }
    best = refineCrossings(map, best, { passes: 3 });
    return refineObstructions(map, best, { passes: 2 });
}
function normalizeTopology(points, pad = 78) {
    const ids = Object.keys(points), res = {};
    let factor = 0;
    for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
            const a = points[ids[i]], b = points[ids[j]];
            const separation = Math.max(Math.abs(a.x - b.x) / (CARD_W + pad), Math.abs(a.y - b.y) / (CARD_H + pad));
            if (separation < 1e-5)
                return null;
            factor = Math.max(factor, 1 / separation);
        }
    if (!Number.isFinite(factor) || factor > 25000)
        return null;
    factor = Math.max(360, factor);
    const xmin = Math.min(...ids.map(id => points[id].x)), ymin = Math.min(...ids.map(id => points[id].y));
    for (const id of ids)
        res[id] = { x: Math.round((points[id].x - xmin) * factor + 120), y: Math.round((points[id].y - ymin) * factor + 120) };
    return res;
}
function hypercubeLayout(map, graph) {
    const n = graph.ids.length, k = Math.round(Math.log2(n));
    if (k < 3 || k > 4 || 2 ** k !== n || graph.edges.length !== n * k / 2)
        return null;
    if (graph.ids.some(id => graph.adjacency.get(id).size !== k))
        return null;
    const startIds = map.zones.filter(isStart).map(z => String(z.id));
    const root = (startIds.length ? startIds : graph.ids).sort(zoneIdOrder)[0];
    const masks = new Map([[root, 0]]), dist = new Map([[root, 0]]);
    const neighbors = [...graph.adjacency.get(root)].sort(zoneIdOrder);
    neighbors.forEach((id, i) => { masks.set(id, 1 << i); dist.set(id, 1); });
    for (let depth = 2; depth <= k; depth++) {
        const next = graph.ids.filter(id => !dist.has(id) && [...graph.adjacency.get(id)].some(other => dist.get(other) === depth - 1));
        for (const id of next) {
            let mask = 0;
            for (const neighbor of graph.adjacency.get(id))
                if (dist.get(neighbor) === depth - 1)
                    mask |= masks.get(neighbor);
            if (mask.toString(2).replace(/0/g, '').length !== depth)
                return null;
            masks.set(id, mask);
            dist.set(id, depth);
        }
    }
    if (masks.size !== n || new Set(masks.values()).size !== n)
        return null;
    for (const [a, b] of graph.edges) {
        const xor = masks.get(a) ^ masks.get(b);
        if (!xor || (xor & (xor - 1)))
            return null;
    }
    const positions = {};
    if (k === 4) {
        const gray = [0, 1, 3, 2, 6, 7, 5, 4], cycle = new Map(gray.map((v, i) => [v, i]));
        for (const [id, mask] of masks) {
            const inside = (mask & 8) !== 0, angle = -Math.PI / 2 + (cycle.get(mask & 7) * Math.PI / 4) - (inside ? Math.PI / 4 : 0);
            const radius = inside ? 1.85 : 5.0;
            positions[id] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
        }
    }
    else {
        // Q3 is planar: draw it as two nested squares instead of an octagon.
        // Corresponding corners are joined radially, so all twelve cube edges
        // remain visible without avoidable intersections.
        const square = new Map([[0, [-1, -1]], [1, [1, -1]], [3, [1, 1]], [2, [-1, 1]]]);
        for (const [id, mask] of masks) {
            const inside = (mask & 4) !== 0, [x, y] = square.get(mask & 3), radius = inside ? 1.75 : 4.4;
            positions[id] = { x: x * radius, y: y * radius };
        }
    }
    return compactLayout(normalizeTopology(positions, 72), { gap: 68 });
}

/**
 * Detect a topology reflection around a fixed path and build a compact,
 * mirror-symmetric candidate.  This covers a common template shape: two
 * equivalent player sides attached to a neutral/treasure spine.  Source zone
 * IDs are used only to make the search deterministic; the reflection itself
 * is proven from graph adjacency.
 */
function reflectionPathLayout(map, graph) {
    const n = graph?.ids.length ?? 0;
    if (n < 8 || n > 16)
        return null;
    const starts = map.zones.filter(isStart).map(z => String(z.id)).filter(id => graph.adjacency.has(id)).sort(zoneIdOrder);
    if (starts.length !== 2 || graph.adjacency.get(starts[0]).size !== graph.adjacency.get(starts[1]).size)
        return null;
    const [rootA, rootB] = starts;
    const distances = root => {
        const result = new Map([[root, 0]]), queue = [root];
        for (let i = 0; i < queue.length; i++) {
            const id = queue[i];
            for (const next of graph.adjacency.get(id))
                if (!result.has(next)) {
                    result.set(next, result.get(id) + 1);
                    queue.push(next);
                }
        }
        return result;
    };
    const da = distances(rootA), db = distances(rootB);
    if (da.size !== n || db.size !== n)
        return null;
    const startSet = new Set(starts);
    const compatible = (u, v) => graph.adjacency.get(u).size === graph.adjacency.get(v).size
        && da.get(u) === db.get(v) && db.get(u) === da.get(v)
        && startSet.has(u) === startSet.has(v);
    const candidates = new Map(graph.ids.map(id => [id, graph.ids.filter(other => compatible(id, other)).sort(zoneIdOrder)]));
    const mapping = new Map([[rootA, rootB], [rootB, rootA]]), used = new Set([rootA, rootB]);
    const consistentPair = (u, v) => {
        if (!compatible(u, v) || used.has(v) && mapping.get(u) !== v)
            return false;
        if (u !== v && (used.has(u) || used.has(v)))
            return mapping.get(u) === v && mapping.get(v) === u;
        for (const [x, mx] of mapping) {
            if (graph.adjacency.get(u).has(x) !== graph.adjacency.get(v).has(mx))
                return false;
            if (graph.adjacency.get(v).has(x) !== graph.adjacency.get(u).has(mx))
                return false;
        }
        return true;
    };
    const search = () => {
        if (mapping.size === n)
            return true;
        let id = null, options = null;
        for (const candidateId of graph.ids.filter(item => !mapping.has(item)).sort(zoneIdOrder)) {
            const possible = candidates.get(candidateId).filter(other => !used.has(other) && !mapping.has(other) && consistentPair(candidateId, other));
            if (!options || possible.length < options.length) {
                id = candidateId;
                options = possible;
            }
        }
        if (!id || !options?.length)
            return false;
        // Prefer fixed points when topology permits them; this exposes the
        // neutral spine instead of arbitrarily pairing every vertex.
        options.sort((a, b) => Number(b === id) - Number(a === id) || zoneIdOrder(a, b));
        for (const other of options) {
            if (!consistentPair(id, other))
                continue;
            const entries = other === id ? [[id, id]] : [[id, other], [other, id]];
            let valid = true;
            for (const [a, b] of entries)
                if (!compatible(a, b)) {
                    valid = false;
                    break;
                }
            if (!valid)
                continue;
            for (const [a, b] of entries) {
                mapping.set(a, b);
                used.add(a);
                used.add(b);
            }
            if (search())
                return true;
            for (const [a] of entries) {
                mapping.delete(a);
                used.delete(a);
            }
        }
        return false;
    };
    if (!search())
        return null;
    // Validate the completed map as an actual graph automorphism.
    for (const [a, b] of graph.edges)
        if (!graph.adjacency.get(mapping.get(a)).has(mapping.get(b)))
            return null;
    const fixed = graph.ids.filter(id => mapping.get(id) === id);
    if (fixed.length < 3 || fixed.length > 6)
        return null;
    const fixedSet = new Set(fixed), fixedDegree = id => [...graph.adjacency.get(id)].filter(next => fixedSet.has(next)).length;
    const fixedEdges = graph.edges.filter(([a, b]) => fixedSet.has(a) && fixedSet.has(b));
    if (fixedEdges.length !== fixed.length - 1 || fixed.some(id => fixedDegree(id) > 2))
        return null;
    const endpoints = fixed.filter(id => fixedDegree(id) === 1).sort(zoneIdOrder);
    if (endpoints.length !== 2)
        return null;
    const path = [endpoints[0]];
    while (path.length < fixed.length) {
        const previous = path.at(-2), current = path.at(-1);
        const next = [...graph.adjacency.get(current)].filter(id => fixedSet.has(id) && id !== previous && !path.includes(id)).sort(zoneIdOrder)[0];
        if (!next)
            return null;
        path.push(next);
    }
    const pairOrbits = [], orbitOf = new Map(path.map((id, i) => [id, `f${i}`]));
    for (const id of graph.ids.slice().sort(zoneIdOrder)) {
        const other = mapping.get(id);
        if (id === other || orbitOf.has(id))
            continue;
        const pair = [id, other].sort(zoneIdOrder);
        if (pair[0] !== id)
            continue;
        const key = `p${pairOrbits.length}`;
        pairOrbits.push({ key, pair });
        orbitOf.set(pair[0], key);
        orbitOf.set(pair[1], key);
    }
    if (pairOrbits.length < 2 || pairOrbits.length > path.length || fixed.length + pairOrbits.length * 2 !== n)
        return null;
    const quotientNeighbors = new Map([...path.map((id, i) => [`f${i}`, new Set()]), ...pairOrbits.map(o => [o.key, new Set()])]);
    for (const [a, b] of graph.edges) {
        const oa = orbitOf.get(a), ob = orbitOf.get(b);
        if (oa && ob && oa !== ob) {
            quotientNeighbors.get(oa).add(ob);
            quotientNeighbors.get(ob).add(oa);
        }
    }
    const rowAssignments = [];
    const chooseRows = (prefix, available) => {
        if (prefix.length === pairOrbits.length) {
            rowAssignments.push(prefix.slice());
            return;
        }
        for (const row of available)
            chooseRows([...prefix, row], available.filter(value => value !== row));
    };
    chooseRows([], path.map((_, i) => i));
    let best = null;
    for (const rows of rowAssignments) {
        const centers = {};
        path.forEach((id, row) => { centers[id] = { x: 0, y: row * 320 }; });
        for (let i = 0; i < pairOrbits.length; i++) {
            const { key, pair } = pairOrbits[i], row = rows[i], degree = quotientNeighbors.get(key).size;
            const endpointBonus = row === 0 || row === path.length - 1 ? 180 : 0;
            const x = 320 + Math.max(0, degree - 2) * 80 + endpointBonus;
            const y = row * 320 + (row > 0 && row < path.length - 1 && degree === 2 ? (row < (path.length - 1) / 2 ? 32 : -32) : 0);
            // Keep the member topologically closer to rootA on the left.  In
            // a perfect tie IDs only choose the orientation, never geometry.
            const [u, v] = pair;
            const left = da.get(u) < da.get(v) ? u : da.get(v) < da.get(u) ? v : (zoneIdOrder(u, v) <= 0 ? u : v);
            const right = left === u ? v : u;
            centers[left] = { x: -x, y };
            centers[right] = { x, y };
        }
        const minX = Math.min(...Object.values(centers).map(p => p.x)), minY = Math.min(...Object.values(centers).map(p => p.y));
        const candidate = Object.fromEntries(Object.entries(centers).map(([id, p]) => [id, { x: p.x - minX + 120, y: p.y - minY + 120 }]));
        best = betterLayout(map, best, candidate);
    }
    return best;
}

function symmetricFourStarts(map, graph) {
    if (graph.ids.length < 8 || graph.ids.length > 42)
        return null;
    const anchors = map.zones.filter(z => isStart(z) && graph.adjacency.get(String(z.id))?.size === 1).map(z => String(z.id)).sort(zoneIdOrder);
    if (anchors.length !== 4 || graph.ids.some(id => graph.adjacency.get(id).size === 0))
        return null;
    // Only use the perimeter-anchored model when all leaves are starting zones.
    if (graph.ids.filter(id => graph.adjacency.get(id).size === 1).length !== 4)
        return null;
    const anchorRoot = anchors[0], others = anchors.slice(1);
    const orders = [[others[0], others[1], others[2]], [others[0], others[2], others[1]],
    [others[1], others[0], others[2]], [others[1], others[2], others[0]],
    [others[2], others[0], others[1]], [others[2], others[1], others[0]]];
    const base = [[-3, 3], [-3, -3], [3, -3], [3, 3]];
    const starts = new Set(anchors);
    let winner = null, best = Infinity;
    for (const order of orders) {
        const boundary = [anchorRoot, ...order], points = {};
        boundary.forEach((id, i) => { points[id] = { x: base[i][0], y: base[i][1] }; });
        for (const id of graph.ids)
            if (!starts.has(id))
                points[id] = { x: 0, y: 0 };
        // Harmonic (barycentric) embedding distributes internal vertices according to
        // topology, not numeric zone IDs. The four extremal starts remain symmetrical.
        for (let step = 0; step < 520; step++) {
            let change = 0;
            for (const id of graph.ids) {
                if (starts.has(id))
                    continue;
                const adjacent = [...graph.adjacency.get(id)], x = adjacent.reduce((s, k) => s + points[k].x, 0) / adjacent.length, y = adjacent.reduce((s, k) => s + points[k].y, 0) / adjacent.length;
                const dx = x - points[id].x, dy = y - points[id].y;
                points[id].x += dx * .76;
                points[id].y += dy * .76;
                change = Math.max(change, Math.abs(dx), Math.abs(dy));
            }
            if (change < 1e-8)
                break;
        }
        const positioned = normalizeTopology(points, 82);
        if (!positioned)
            continue;
        const crossing = edgeCrossings(graph.edges, positioned);
        if (crossing === 0 && order === orders[0])
            return positioned;
        const edgeDistances = graph.edges.map(([a, b]) => Math.hypot(positioned[a].x - positioned[b].x, positioned[a].y - positioned[b].y));
        const avg = edgeDistances.reduce((a, b) => a + b, 0) / Math.max(1, edgeDistances.length);
        const variance = edgeDistances.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(1, edgeDistances.length);
        const horizontal = Math.max(...Object.values(positioned).map(p => p.x)) - Math.min(...Object.values(positioned).map(p => p.x));
        const vertical = Math.max(...Object.values(positioned).map(p => p.y)) - Math.min(...Object.values(positioned).map(p => p.y));
        const score = crossing * 1e8 + Math.sqrt(variance) / avg * 1000 + Math.max(horizontal, vertical) / Math.max(1, Math.min(horizontal, vertical)) * 16;
        if (score < best) {
            best = score;
            winner = positioned;
        }
    }
    // On non-planar graphs, do not claim the heuristic produces a crossing-free view.
    return winner && edgeCrossings(graph.edges, winner) === 0 ? winner : null;
}
export function topologyLayout(map) {
    if (!map?.zones?.length)
        return null;
    const graph = topologyGraph(map);
    if (!graph)
        return null;
    const proposed = hypercubeLayout(map, graph) || symmetricFourStarts(map, graph) || motifLayout(map, graph);
    return proposed ? compactLayout(proposed, { gap: 68 }) : null;
}
/** Uniformly compact a finished layout until the nearest pair reaches a small,
 * readable card gap. Uniform scaling preserves symmetry and edge crossings. */
export function compactLayout(positions, { gap = 68, minScale = .38 } = {}) {
    const ids = Object.keys(positions ?? {});
    if (ids.length < 2)
        return structuredClone(positions ?? {});
    const p = structuredClone(positions), cx = ids.reduce((n, id) => n + p[id].x, 0) / ids.length, cy = ids.reduce((n, id) => n + p[id].y, 0) / ids.length;
    let required = Math.max(0, minScale);
    for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
            const a = p[ids[i]], b = p[ids[j]], dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
            const sx = dx > 1e-7 ? (CARD_W + gap) / dx : Infinity, sy = dy > 1e-7 ? (CARD_H + gap) / dy : Infinity;
            required = Math.max(required, Math.min(sx, sy));
        }
    const scale = Math.min(1, required);
    if (scale < .995)
        for (const id of ids) {
            p[id].x = cx + (p[id].x - cx) * scale;
            p[id].y = cy + (p[id].y - cy) * scale;
        }
    return separate(p, gap);
}

function crossedEdgeGroups(graph, positions) {
    const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const groups = [];
    for (let i = 0; i < graph.edges.length; i++)
        for (let j = i + 1; j < graph.edges.length; j++) {
            const [a, b] = graph.edges[i], [c, d] = graph.edges[j];
            if (a === b || a === c || a === d || b === c || b === d || c === d)
                continue;
            const p = positions[a], q = positions[b], r = positions[c], t = positions[d];
            if (!p || !q || !r || !t)
                continue;
            const u = orient(p, q, r), v = orient(p, q, t), w = orient(r, t, p), x = orient(r, t, q);
            if (u * v < -1e-7 && w * x < -1e-7)
                groups.push([a, b, c, d]);
        }
    return groups;
}
function refineCrossingGeometry(map, positions, { passes = 3 } = {}) {
    const graph = topologyGraph(map), n = map.zones.length;
    if (!graph || n < 5 || n > 34)
        return positions;
    let best = structuredClone(positions), metrics = layoutMetrics(map, best);
    if (!metrics.crossings)
        return best;
    const compare = (a, b) => a.crossings - b.crossings || a.intrusions - b.intrusions || a.soft - b.soft;
    const directions = Array.from({ length: 12 }, (_, i) => i * Math.PI / 6);
    for (let pass = 0; pass < passes && metrics.crossings; pass++) {
        const groups = crossedEdgeGroups(graph, best);
        const affected = [...new Set(groups.flat())];
        if (!affected.length)
            break;
        const cx = graph.ids.reduce((sum, id) => sum + best[id].x, 0) / graph.ids.length;
        const cy = graph.ids.reduce((sum, id) => sum + best[id].y, 0) / graph.ids.length;
        let changed = false;
        affected.sort((a, b) => graph.adjacency.get(b).size - graph.adjacency.get(a).size || zoneIdOrder(a, b));
        for (const id of affected) {
            let local = best, localMetrics = metrics;
            const radial = Math.atan2(best[id].y - cy, best[id].x - cx);
            const angles = [radial, radial + Math.PI, ...directions];
            for (const step of [58, 96, 148, 220])
                for (const angle of angles) {
                    const trial = structuredClone(best);
                    trial[id].x += Math.cos(angle) * step;
                    trial[id].y += Math.sin(angle) * step;
                    if (compactCardOverlaps(trial, id, 68))
                        continue;
                    const next = layoutMetrics(map, trial);
                    if (compare(next, localMetrics) < -1e-7) {
                        local = trial;
                        localMetrics = next;
                    }
                }
            if (local !== best) {
                best = local;
                metrics = localMetrics;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return normalizeLayoutOrigin(best);
}


/**
 * Wider deterministic rescue for the small minority of dense layouts where
 * local crossing moves get trapped in a geometric minimum. It only runs after
 * all normal motif/spectral/force candidates have been compared, and accepts
 * moves lexicographically by crossings, card obstructions, then compactness.
 */
function wideCrossingRescue(map, positions, { passes = 3 } = {}) {
    const graph = topologyGraph(map), n = map.zones.length;
    if (!graph || n < 6 || n > 28 || graph.edges.length > 50)
        return positions;
    let best = structuredClone(positions), metrics = layoutMetrics(map, best);
    if (!metrics.crossings)
        return best;
    const compare = (a, b) => a.crossings - b.crossings || a.intrusions - b.intrusions || a.soft - b.soft;
    for (let pass = 0; pass < passes && metrics.crossings; pass++) {
        const groups = crossedEdgeGroups(graph, best);
        const affected = [...new Set(groups.flat())]
            .sort((a, b) => graph.adjacency.get(b).size - graph.adjacency.get(a).size || zoneIdOrder(a, b));
        if (!affected.length)
            break;
        const xs = graph.ids.map(id => best[id].x), ys = graph.ids.map(id => best[id].y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        let changed = false;
        for (const id of affected) {
            const neighbors = [...graph.adjacency.get(id)];
            const nx = neighbors.reduce((sum, other) => sum + best[other].x, 0) / Math.max(1, neighbors.length);
            const ny = neighbors.reduce((sum, other) => sum + best[other].y, 0) / Math.max(1, neighbors.length);
            const candidates = [];
            for (const [bx, by] of [[nx, ny], [cx, cy]])
                for (const radius of [340, 560, 820])
                    for (let i = 0; i < 8; i++) {
                        const angle = i * Math.PI / 4;
                        candidates.push({ x: bx + Math.cos(angle) * radius, y: by + Math.sin(angle) * radius });
                    }
            for (let i = 0; i < 7; i++) {
                const t = i / 6;
                candidates.push(
                    { x: minX + (maxX - minX) * t, y: minY - 360 },
                    { x: minX + (maxX - minX) * t, y: maxY + 360 },
                    { x: minX - 360, y: minY + (maxY - minY) * t },
                    { x: maxX + 360, y: minY + (maxY - minY) * t }
                );
            }
            let localPoint = null, localMetrics = metrics;
            for (const point of candidates) {
                const trial = structuredClone(best);
                trial[id] = point;
                if (compactCardOverlaps(trial, id, 68))
                    continue;
                const next = layoutMetrics(map, trial);
                if (compare(next, localMetrics) < -1e-7) {
                    localPoint = point;
                    localMetrics = next;
                }
            }
            if (localPoint) {
                best[id] = localPoint;
                metrics = localMetrics;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return normalizeLayoutOrigin(best);
}

/** Final line/card cleanup without running global separation after every probe. */
function targetedObstructionRescue(map, positions, { passes = 4, steps = [52, 84, 128, 192, 280] } = {}) {
    const graph = topologyGraph(map), n = map.zones.length;
    if (!graph || n < 4 || n > 34)
        return positions;
    let best = structuredClone(positions), metrics = layoutMetrics(map, best);
    if (!metrics.intrusions)
        return best;
    const compare = (a, b) => a.crossings - b.crossings || a.intrusions - b.intrusions || a.soft - b.soft;
    const directions = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4);
    for (let pass = 0; pass < passes && metrics.intrusions; pass++) {
        const triples = compactObstructions(map, best, graph);
        const affected = [...new Set(triples.flatMap(([a, b, blocked]) => [blocked, a, b]))]
            .sort((a, b) => graph.adjacency.get(b).size - graph.adjacency.get(a).size || zoneIdOrder(a, b));
        if (!affected.length)
            break;
        const cx = graph.ids.reduce((sum, id) => sum + best[id].x, 0) / graph.ids.length;
        const cy = graph.ids.reduce((sum, id) => sum + best[id].y, 0) / graph.ids.length;
        let changed = false;
        for (const id of affected) {
            let localPoint = null, localMetrics = metrics;
            const angles = [Math.atan2(best[id].y - cy, best[id].x - cx), ...directions];
            for (const [a, b, blocked] of triples) {
                if (id !== a && id !== b && id !== blocked)
                    continue;
                const dx = best[b].x - best[a].x, dy = best[b].y - best[a].y;
                if (Math.abs(dx) + Math.abs(dy) > 1e-7) {
                    angles.push(Math.atan2(dx, -dy), Math.atan2(-dx, dy));
                }
            }
            for (const step of steps)
                for (const angle of angles) {
                    const point = { x: best[id].x + Math.cos(angle) * step, y: best[id].y + Math.sin(angle) * step };
                    const trial = structuredClone(best);
                    trial[id] = point;
                    if (compactCardOverlaps(trial, id, 68))
                        continue;
                    const next = layoutMetrics(map, trial);
                    if (compare(next, localMetrics) < -1e-7) {
                        localPoint = point;
                        localMetrics = next;
                    }
                }
            if (localPoint) {
                best[id] = localPoint;
                metrics = localMetrics;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return normalizeLayoutOrigin(best);
}



function groupedObstructionRescue(map, positions, { passes = 2 } = {}) {
    const graph = topologyGraph(map), n = map.zones.length;
    if (!graph || n < 6 || n > 40)
        return positions;
    let best = structuredClone(positions), metrics = layoutMetrics(map, best);
    const compare = (a, b) => a.crossings - b.crossings || a.intrusions - b.intrusions || a.soft - b.soft;
    const overlapsOutside = (trial, moved) => {
        const movedSet = new Set(moved);
        for (const id of moved)
            for (const [otherId, other] of Object.entries(trial)) {
                if (id === otherId || movedSet.has(otherId))
                    continue;
                const point = trial[id];
                if (Math.abs(point.x - other.x) < CARD_W + 68 && Math.abs(point.y - other.y) < CARD_H + 68)
                    return true;
            }
        return false;
    };
    for (let pass = 0; pass < passes && metrics.intrusions; pass++) {
        const grouped = new Map();
        for (const [a, b, blocked] of compactObstructions(map, best, graph)) {
            const key = zoneIdOrder(a, b) <= 0 ? `${a}\u0001${b}` : `${b}\u0001${a}`;
            if (!grouped.has(key))
                grouped.set(key, { a, b, blocked: new Set() });
            grouped.get(key).blocked.add(blocked);
        }
        const lanes = [...grouped.values()].filter(lane => lane.blocked.size >= 2)
            .sort((a, b) => b.blocked.size - a.blocked.size || zoneIdOrder(a.a, b.a));
        let changed = false;
        const cx = graph.ids.reduce((sum, id) => sum + best[id].x, 0) / graph.ids.length;
        const cy = graph.ids.reduce((sum, id) => sum + best[id].y, 0) / graph.ids.length;
        for (const lane of lanes) {
            const moved = [...lane.blocked], pa = best[lane.a], pb = best[lane.b];
            const dx = pb.x - pa.x, dy = pb.y - pa.y, length = Math.hypot(dx, dy);
            if (length < 1e-7)
                continue;
            const nx = -dy / length, ny = dx / length;
            const mx = moved.reduce((sum, id) => sum + best[id].x, 0) / moved.length;
            const my = moved.reduce((sum, id) => sum + best[id].y, 0) / moved.length;
            const towardCenter = (cx - mx) * nx + (cy - my) * ny >= 0 ? 1 : -1;
            const signs = [towardCenter, -towardCenter];
            let local = best, localMetrics = metrics;
            for (const step of [96, 148, 220, 310, 420, 560, 720])
                for (const sign of signs) {
                    const trial = structuredClone(best);
                    for (const id of moved) {
                        trial[id].x += nx * step * sign;
                        trial[id].y += ny * step * sign;
                    }
                    if (overlapsOutside(trial, moved))
                        continue;
                    const next = layoutMetrics(map, trial);
                    if (compare(next, localMetrics) < -1e-7) {
                        local = trial;
                        localMetrics = next;
                    }
                }
            if (local !== best) {
                best = local;
                metrics = localMetrics;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return normalizeLayoutOrigin(best);
}

function compactObstructions(map, positions, graph) {
    const centers = Object.fromEntries(graph.ids.map(id => [id, {
        x: positions[id].x + CARD_W / 2,
        y: positions[id].y + CARD_H / 2
    }]));
    const result = [];
    for (const [a, b] of graph.edges)
        for (const id of graph.ids) {
            if (id === a || id === b)
                continue;
            if (segmentIntersectsRect(centers[a], centers[b], centers[id], CARD_W / 2 + 9, CARD_H / 2 + 9))
                result.push([a, b, id]);
        }
    return result;
}
function compactCardOverlaps(positions, id, gap = 68) {
    const point = positions[id];
    for (const [otherId, other] of Object.entries(positions)) {
        if (otherId === id)
            continue;
        if (Math.abs(point.x - other.x) < CARD_W + gap && Math.abs(point.y - other.y) < CARD_H + gap)
            return true;
    }
    return false;
}
function normalizeLayoutOrigin(positions, pad = 110) {
    const ids = Object.keys(positions ?? {});
    if (!ids.length)
        return structuredClone(positions ?? {});
    const result = structuredClone(positions);
    const minX = Math.min(...ids.map(id => result[id].x)), minY = Math.min(...ids.map(id => result[id].y));
    for (const id of ids) {
        result[id].x -= minX - pad;
        result[id].y -= minY - pad;
    }
    return result;
}
function scaleLayoutAroundCenter(positions, factor) {
    const ids = Object.keys(positions ?? {}), result = structuredClone(positions ?? {});
    if (!ids.length)
        return result;
    const cx = ids.reduce((sum, id) => sum + result[id].x, 0) / ids.length;
    const cy = ids.reduce((sum, id) => sum + result[id].y, 0) / ids.length;
    for (const id of ids) {
        result[id].x = cx + (result[id].x - cx) * factor;
        result[id].y = cy + (result[id].y - cy) * factor;
    }
    return result;
}
function refineCompressedCandidate(map, positions, graph, { passes = 4 } = {}) {
    let best = structuredClone(positions), metrics = layoutMetrics(map, best);
    const compare = (a, b) => {
        const ka = [a.crossings, a.intrusions, a.soft], kb = [b.crossings, b.intrusions, b.soft];
        for (let i = 0; i < ka.length; i++) {
            if (Math.abs(ka[i] - kb[i]) > 1e-7)
                return ka[i] - kb[i];
        }
        return 0;
    };
    for (let pass = 0; pass < passes && metrics.intrusions; pass++) {
        const triples = compactObstructions(map, best, graph);
        const affected = [...new Set(triples.flatMap(([a, b, id]) => [id, a, b]))];
        if (!affected.length)
            break;
        const cx = graph.ids.reduce((sum, id) => sum + best[id].x, 0) / graph.ids.length;
        const cy = graph.ids.reduce((sum, id) => sum + best[id].y, 0) / graph.ids.length;
        let changed = false;
        for (const id of affected) {
            let local = best, localMetrics = metrics;
            const angles = [];
            for (const [a, b, blocked] of triples) {
                if (id !== a && id !== b && id !== blocked)
                    continue;
                const dx = best[b].x - best[a].x, dy = best[b].y - best[a].y;
                if (Math.abs(dx) + Math.abs(dy) > 1e-7) {
                    angles.push(Math.atan2(dx, -dy));
                    angles.push(Math.atan2(-dx, dy));
                }
            }
            angles.push(Math.atan2(best[id].y - cy, best[id].x - cx));
            for (let i = 0; i < 8; i++)
                angles.push(i * Math.PI / 4);
            for (const step of [44, 72, 108])
                for (const angle of angles) {
                    const trial = structuredClone(best);
                    trial[id].x += Math.cos(angle) * step;
                    trial[id].y += Math.sin(angle) * step;
                    if (compactCardOverlaps(trial, id, 68))
                        continue;
                    const next = layoutMetrics(map, trial);
                    if (compare(next, localMetrics) < 0) {
                        local = trial;
                        localMetrics = next;
                    }
                }
            if (local !== best) {
                best = local;
                metrics = localMetrics;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return normalizeLayoutOrigin(best);
}
function polishDenseClearLayout(map, positions, graph, { passes = 5 } = {}) {
    const n = graph?.ids.length ?? 0;
    // This second-stage polish is intentionally narrow. It targets compact,
    // connection-dense maps where a clear drawing already exists and therefore
    // must never trade readability for a marginally smaller footprint.
    if (!graph || n < 10 || n > 14 || graph.edges.length < n + 6)
        return positions;
    let best = structuredClone(positions), metrics = layoutMetrics(map, best);
    if (metrics.crossings || metrics.intrusions)
        return positions;
    const order = graph.ids.slice().sort((a, b) => graph.adjacency.get(b).size - graph.adjacency.get(a).size || zoneIdOrder(a, b));
    for (let pass = 0; pass < passes; pass++) {
        const cx = graph.ids.reduce((sum, id) => sum + best[id].x, 0) / n;
        const cy = graph.ids.reduce((sum, id) => sum + best[id].y, 0) / n;
        let changed = false;
        for (const id of order) {
            const point = best[id], neighbors = [...graph.adjacency.get(id)];
            const nx = neighbors.reduce((sum, other) => sum + best[other].x, 0) / Math.max(1, neighbors.length);
            const ny = neighbors.reduce((sum, other) => sum + best[other].y, 0) / Math.max(1, neighbors.length);
            const average = neighbors.reduce((sum, other) => sum + Math.hypot(best[other].x - point.x, best[other].y - point.y), 0) / Math.max(1, neighbors.length);
            const candidates = [];
            for (const [tx, ty] of [[nx, ny], [cx, cy]])
                for (const t of [.12, .22, .35, .5, .68])
                    candidates.push({ x: point.x + (tx - point.x) * t, y: point.y + (ty - point.y) * t });
            for (const step of [Math.min(900, average * .35), Math.min(600, average * .2), 180, 96, 52])
                for (let i = 0; i < 12; i++) {
                    const angle = i * Math.PI / 6;
                    candidates.push({ x: point.x + Math.cos(angle) * step, y: point.y + Math.sin(angle) * step });
                }
            let localPoint = null, localMetrics = metrics;
            for (const candidate of candidates) {
                const trial = structuredClone(best);
                trial[id] = candidate;
                if (compactCardOverlaps(trial, id, 68))
                    continue;
                const next = layoutMetrics(map, trial);
                if (!next.crossings && !next.intrusions && next.soft < localMetrics.soft - 1e-7) {
                    localPoint = candidate;
                    localMetrics = next;
                }
            }
            if (localPoint) {
                best[id] = localPoint;
                metrics = localMetrics;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return normalizeLayoutOrigin(best);
}


function polishClearLayoutRings(map, positions, graph, { passes = 4 } = {}) {
    const n = graph?.ids.length ?? 0;
    if (!graph || n < 10 || n > 14 || graph.edges.length < n + 6)
        return positions;
    let best = structuredClone(positions), metrics = layoutMetrics(map, best);
    if (metrics.crossings || metrics.intrusions)
        return positions;
    const order = graph.ids.slice().sort((a, b) => graph.adjacency.get(b).size - graph.adjacency.get(a).size || zoneIdOrder(a, b));
    for (let pass = 0; pass < passes; pass++) {
        let changed = false;
        for (const id of order) {
            const point = best[id], neighbors = [...graph.adjacency.get(id)];
            const nx = neighbors.reduce((sum, other) => sum + best[other].x, 0) / Math.max(1, neighbors.length);
            const ny = neighbors.reduce((sum, other) => sum + best[other].y, 0) / Math.max(1, neighbors.length);
            let localPoint = null, localMetrics = metrics;
            const candidates = [];
            for (const radius of [120, 200, 300])
                for (let i = 0; i < 16; i++) {
                    const angle = i * Math.PI / 8;
                    candidates.push({ x: nx + Math.cos(angle) * radius, y: ny + Math.sin(angle) * radius });
                }
            for (const step of [32, 52, 80, 120, 180])
                for (let i = 0; i < 16; i++) {
                    const angle = i * Math.PI / 8;
                    candidates.push({ x: point.x + Math.cos(angle) * step, y: point.y + Math.sin(angle) * step });
                }
            for (const candidate of candidates) {
                const trial = structuredClone(best);
                trial[id] = candidate;
                if (compactCardOverlaps(trial, id, 68))
                    continue;
                const next = layoutMetrics(map, trial);
                if (!next.crossings && !next.intrusions && next.soft < localMetrics.soft - 1e-7) {
                    localPoint = candidate;
                    localMetrics = next;
                }
            }
            if (localPoint) {
                best[id] = localPoint;
                metrics = localMetrics;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return normalizeLayoutOrigin(best);
}

function compactClearLayoutCandidate(map, positions) {
    const graph = topologyGraph(map), base = layoutMetrics(map, positions), n = map.zones.length;
    if (!graph || n < 5 || n > 20 || base.crossings || base.intrusions)
        return positions;
    // Small graphs can tolerate a stronger first compression because the
    // obstruction repair has few vertices to move. Larger layered drawings
    // (notably 15-20-zone planar templates) use a conservative contraction so
    // their established rows/faces remain intact.
    const factor = n <= 14 ? .82 : .94;
    const compressed = separate(scaleLayoutAroundCenter(positions, factor), 68);
    const refined = refineCompressedCandidate(map, compressed, graph, { passes: n <= 14 ? 4 : 3 });
    const metrics = layoutMetrics(map, refined);
    let winner = positions;
    const requiredGain = n <= 14 ? .82 : .96;
    if (!metrics.crossings && !metrics.intrusions && metrics.soft < base.soft * requiredGain)
        winner = refined;
    if (n > 14)
        return winner;
    const polished = polishDenseClearLayout(map, winner, graph);
    return polishClearLayoutRings(map, polished, graph);
}

/** Small deterministic crossing-reduction pass for layouts without a strong motif.
 * Swapping coordinates preserves the no-overlap guarantee and does not change
 * start-zone roles or any template data. Capped for large templates.
 */
export function refineCrossings(map, positions, { passes = 2 } = {}) {
    const graph = topologyGraph(map), n = map.zones.length;
    if (!graph || n < 5 || n > 25 || graph.edges.length < 3 || graph.edges.length > 52)
        return positions;
    const ids = graph.ids.slice().sort(zoneIdOrder), starts = new Set(map.zones.filter(isStart).map(z => String(z.id)));
    let crossing = edgeCrossings(graph.edges, positions);
    if (crossing === 0)
        return positions;
    const p = structuredClone(positions);
    const length = () => graph.edges.reduce((sum, [a, b]) => sum + (p[a].x - p[b].x) ** 2 + (p[a].y - p[b].y) ** 2, 0);
    let cost = length();
    for (let pass = 0; pass < passes; pass++) {
        let changed = false;
        for (let i = 0; i < ids.length; i++)
            for (let j = i + 1; j < ids.length; j++) {
                const a = ids[i], b = ids[j];
                if (starts.has(a) !== starts.has(b))
                    continue;
                [p[a], p[b]] = [p[b], p[a]];
                const next = edgeCrossings(graph.edges, p);
                if (next > crossing) {
                    [p[a], p[b]] = [p[b], p[a]];
                    continue;
                }
                const nextCost = next === crossing ? length() : 0;
                if (next < crossing || (next === crossing && nextCost < cost - 1e-6)) {
                    crossing = next;
                    cost = nextCost || length();
                    changed = true;
                }
                else
                    [p[a], p[b]] = [p[b], p[a]];
                if (crossing === 0)
                    break;
            }
        if (!changed || crossing === 0)
            break;
    }
    return p;
}

/**
 * Pull a valid drawing toward the graph-distance embedding without sacrificing
 * hard readability. The MDS target captures symmetric grids/ladders extremely
 * well, while the existing motif/rescue pipeline is better at guaranteeing a
 * crossing-free drawing. This late polish combines both: moves are accepted
 * only when crossings and card obstructions do not get worse.
 */
function distanceGuidedPolish(map, graph, positions, { passes = 3 } = {}) {
    const n = graph?.ids.length ?? 0;
    if (!positions || n < 8 || n > 40)
        return positions;
    const raw = distanceCandidates(graph)[0];
    if (!raw)
        return positions;
    const ids = graph.ids, baseMetrics = layoutMetrics(map, positions);
    if (!Number.isFinite(baseMetrics.soft) || baseMetrics.crossings > 1)
        return positions;

    const currentMean = {
        x: ids.reduce((sum, id) => sum + positions[id].x, 0) / n,
        y: ids.reduce((sum, id) => sum + positions[id].y, 0) / n
    };
    const rawMean = {
        x: ids.reduce((sum, id) => sum + raw[id].x, 0) / n,
        y: ids.reduce((sum, id) => sum + raw[id].y, 0) / n
    };
    const alignedTarget = reflect => {
        let dot = 0, cross = 0, denom = 0;
        for (const id of ids) {
            const rx = raw[id].x - rawMean.x;
            const ry = (raw[id].y - rawMean.y) * reflect;
            const px = positions[id].x - currentMean.x;
            const py = positions[id].y - currentMean.y;
            dot += rx * px + ry * py;
            cross += rx * py - ry * px;
            denom += rx * rx + ry * ry;
        }
        const magnitude = Math.hypot(dot, cross);
        if (magnitude < 1e-9 || denom < 1e-9)
            return null;
        const cosine = dot / magnitude, sine = cross / magnitude, scale = magnitude / denom;
        const target = {}, error = ids.reduce((sum, id) => {
            const rx = raw[id].x - rawMean.x;
            const ry = (raw[id].y - rawMean.y) * reflect;
            const x = currentMean.x + scale * (rx * cosine - ry * sine);
            const y = currentMean.y + scale * (rx * sine + ry * cosine);
            target[id] = { x, y };
            return sum + (x - positions[id].x) ** 2 + (y - positions[id].y) ** 2;
        }, 0);
        return { target, error };
    };
    const normal = alignedTarget(1), mirrored = alignedTarget(-1);
    const target = (!mirrored || normal?.error <= mirrored.error ? normal : mirrored)?.target;
    if (!target)
        return positions;

    const targetError = layout => ids.reduce((sum, id) => sum
        + (layout[id].x - target[id].x) ** 2 + (layout[id].y - target[id].y) ** 2, 0);
    const acceptable = (next, previous, previousError, nextError) => {
        if (next.crossings > previous.crossings || next.intrusions > previous.intrusions)
            return false;
        if (next.crossings < previous.crossings || next.intrusions < previous.intrusions)
            return true;
        if (nextError >= previousError - 1e-7)
            return false;
        // Do not buy a prettier topology silhouette with an excessive footprint.
        return next.soft <= previous.soft + 1e-7 && next.soft <= baseMetrics.soft + 1e-7;
    };

    let best = structuredClone(positions), metrics = layoutMetrics(map, best), error = targetError(best);
    // First try coherent interpolation. It preserves symmetry better than a
    // sequence of independent node moves when the planar drawing has room.
    for (const fraction of [.12, .2, .3, .42, .56, .7]) {
        const trial = structuredClone(best);
        for (const id of ids) {
            trial[id].x += (target[id].x - trial[id].x) * fraction;
            trial[id].y += (target[id].y - trial[id].y) * fraction;
        }
        const separated = separate(trial, 68), next = layoutMetrics(map, separated), nextError = targetError(separated);
        if (acceptable(next, metrics, error, nextError)) {
            best = separated;
            metrics = next;
            error = nextError;
        }
    }

    for (let pass = 0; pass < passes; pass++) {
        let changed = false;
        const order = ids.slice().sort((a, b) => {
            const da = (best[a].x - target[a].x) ** 2 + (best[a].y - target[a].y) ** 2;
            const db = (best[b].x - target[b].x) ** 2 + (best[b].y - target[b].y) ** 2;
            return db - da || graph.adjacency.get(a).size - graph.adjacency.get(b).size || zoneIdOrder(a, b);
        });
        for (const id of order) {
            let local = best, localMetrics = metrics, localError = error;
            for (const fraction of [.16, .28, .42, .58]) {
                const trial = structuredClone(best);
                trial[id].x += (target[id].x - trial[id].x) * fraction;
                trial[id].y += (target[id].y - trial[id].y) * fraction;
                if (compactCardOverlaps(trial, id, 68))
                    continue;
                const next = layoutMetrics(map, trial), nextError = targetError(trial);
                if (acceptable(next, localMetrics, localError, nextError)) {
                    local = trial;
                    localMetrics = next;
                    localError = nextError;
                }
            }
            if (local !== best) {
                best = local;
                metrics = localMetrics;
                error = localError;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return normalizeLayoutOrigin(best);
}

export function autoLayout(map, { preferStored = true } = {}) {
    const zones = map.zones, n = zones.length;
    if (!n)
        return {};
    const positions = {};
    let stored = [];
    if (preferStored)
        for (const z of zones) {
            const fields = String(z.zone_options?.image_settings ?? '').trim().split(/\s+/).map(Number);
            if (fields.length >= 2 && fields.slice(0, 2).every(Number.isFinite))
                stored.push({ id: z.id, x: fields[0], y: fields[1] });
        }
    if (stored.length >= n / 2) {
        const xs = stored.map(o => o.x), ys = stored.map(o => o.y);
        const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
        const spacing = Math.max(1400, Math.sqrt(n) * 330);
        const factor = spacing / Math.max(xmax - xmin, ymax - ymin, 1);
        for (const p of stored)
            positions[p.id] = { x: (p.x - xmin) * factor + 130, y: (p.y - ymin) * factor + 130 };
        for (const z of zones)
            if (!positions[z.id]) {
                const neighbor = [];
                for (const c of map.connections) {
                    let id = c.zone1 === z.id ? c.zone2 : c.zone2 === z.id ? c.zone1 : null;
                    if (id && positions[id])
                        neighbor.push(positions[id]);
                }
                const mean = (p, key) => p.reduce((a, v) => a + v[key], 0) / p.length;
                const points = neighbor.length ? neighbor : Object.values(positions);
                positions[z.id] = { x: mean(points, 'x') + ((hash(z.id) % 5) - 2) * 44, y: mean(points, 'y') + ((hash(z.id) % 7) - 3) * 34 };
            }
        return compactLayout(separate(positions, 82), { gap: 68 });
    }
    const graph = topologyGraph(map);
    const reflection = graph ? reflectionPathLayout(map, graph) : null;
    let coreRing = null;
    if (graph) {
        const candidates = coreRingLayouts(map, graph);
        for (const candidate of candidates) {
            const xs = Object.values(candidate).map(point => point.x), ys = Object.values(candidate).map(point => point.y);
            const span = Math.max(Math.max(...xs) - Math.min(...xs) + CARD_W, Math.max(...ys) - Math.min(...ys) + CARD_H);
            const target = Math.max(1500, Math.sqrt(n) * 520);
            const prepared = span > target * 1.18
                ? separate(scaleLayoutAroundCenter(candidate, target / span), 68)
                : candidate;
            if (layoutMetrics(map, prepared).crossings)
                continue;
            coreRing = betterLayout(map, coreRing, refineObstructions(map, prepared, { passes: 3 }));
        }
    }
    let topology = topologyLayout(map);
    if (topology) {
        // Keep the dedicated hypercube view intact. Q4 is inherently
        // non-planar, and its two-ring layout communicates the structure much
        // better than a slightly lower crossing count from an asymmetric
        // generic refinement.
        const k = graph ? Math.round(Math.log2(graph.ids.length)) : 0;
        const hypercube = graph && k >= 3 && k <= 4 && 2 ** k === graph.ids.length
            && graph.edges.length === graph.ids.length * k / 2
            && graph.ids.every(id => graph.adjacency.get(id).size === k);
        if (hypercube)
            return topology;
        let metrics = layoutMetrics(map, topology);
        if (metrics.crossings === 0 && metrics.intrusions === 0)
            return compactClearLayoutCandidate(map, betterLayout(map, coreRing, betterLayout(map, topology, reflection)));
        topology = refineObstructions(map, topology, { passes: 4 });
    }
    const disconnected = graph ? disconnectedLayout(map, graph) : null;
    if (disconnected)
        return disconnected;
    let quadrilateral = null;
    if (graph) {
        const candidates = quadrilateralFaceLayouts(map, graph);
        if (candidates.length) {
            const score = candidate => {
                const metrics = layoutMetrics(map, candidate);
                return [metrics.crossings, metrics.intrusions, metrics.soft];
            };
            const ranked = candidates.slice().sort((a, b) => {
                const aa = score(a), bb = score(b);
                for (let i = 0; i < aa.length; i++)
                    if (Math.abs(aa[i] - bb[i]) > 1e-7)
                        return aa[i] - bb[i];
                return 0;
            }).slice(0, 6);
            const preferred = candidates.slice(0, 2), shortlist = [...new Set([...preferred, ...ranked])];
            let preferredBest = null, globalBest = null;
            for (const candidate of shortlist) {
                const refined = refineObstructions(map, candidate, { passes: 4 });
                globalBest = betterLayout(map, globalBest, refined);
                if (preferred.includes(candidate))
                    preferredBest = betterLayout(map, preferredBest, refined);
            }
            if (preferredBest && globalBest) {
                const preferredMetrics = layoutMetrics(map, preferredBest), globalMetrics = layoutMetrics(map, globalBest);
                const bothClear = preferredMetrics.crossings === 0 && preferredMetrics.intrusions === 0
                    && globalMetrics.crossings === 0 && globalMetrics.intrusions === 0;
                quadrilateral = bothClear && preferredMetrics.soft <= globalMetrics.soft * 1.25 ? preferredBest : globalBest;
            }
            else
                quadrilateral = globalBest ?? preferredBest;
        }
    }
    let polygon = null;
    if (graph && (!quadrilateral || layoutMetrics(map, quadrilateral).crossings > 0 || layoutMetrics(map, quadrilateral).intrusions > 12)) {
        const candidates = polygonFaceLayouts(map, graph).sort((a, b) => {
            const aa = layoutMetrics(map, a), bb = layoutMetrics(map, b);
            return aa.intrusions - bb.intrusions || aa.soft - bb.soft;
        }).slice(0, 6);
        for (const candidate of candidates)
            polygon = betterLayout(map, polygon, refineObstructions(map, candidate, { passes: 4 }));
    }
    quadrilateral = betterLayout(map, quadrilateral, polygon);
    const spectral = graph ? spectralLayout(map, graph) : null;
    const outer = zones.filter(isStart), inner = zones.filter(z => !isStart(z));
    const centerOrder = [...inner].sort((a, b) => Number(isCenter(b)) - Number(isCenter(a)) || Number(a.id) - Number(b.id));
    let circleOuter = Math.max(670, (outer.length || n) * 164), circleInner = Math.max(270, inner.length * 95);
    outer.forEach((z, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / outer.length; positions[z.id] = { x: Math.cos(a) * circleOuter, y: Math.sin(a) * circleOuter }; });
    centerOrder.forEach((z, i) => { const a = (i * 2.39996) + Math.PI / 6, r = inner.length === 1 ? 0 : 195 + Math.sqrt(i) * circleInner / Math.sqrt(Math.max(1, inner.length)); positions[z.id] = { x: Math.cos(a) * r, y: Math.sin(a) * r }; });
    if (!outer.length) {
        zones.forEach((z, i) => { let a = (i / (n || 1)) * Math.PI * 2, r = Math.max(510, n * 63); positions[z.id] = { x: Math.cos(a) * r, y: Math.sin(a) * r }; });
    }
    const ids = new Set(zones.map(z => z.id));
    const edges = map.connections.filter(c => ids.has(c.zone1) && ids.has(c.zone2) && c.zone1 !== c.zone2 && !['teleport', 'monolith'].includes(String(c.conn_type ?? '').toLowerCase()));
    for (let iter = 0; iter < 160; iter++) {
        const delta = Object.fromEntries(zones.map(z => [z.id, { x: 0, y: 0 }]));
        for (let i = 0; i < n; i++)
            for (let j = i + 1; j < n; j++) {
                const a = zones[i].id, b = zones[j].id, pa = positions[a], pb = positions[b], dx = pa.x - pb.x, dy = pa.y - pb.y;
                const distance = Math.max(28, Math.hypot(dx, dy)), f = Math.min(26, 245000 / distance ** 2);
                delta[a].x += dx / distance * f;
                delta[a].y += dy / distance * f;
                delta[b].x -= dx / distance * f;
                delta[b].y -= dy / distance * f;
            }
        for (const e of edges) {
            let a = positions[e.zone1], b = positions[e.zone2], dx = b.x - a.x, dy = b.y - a.y, d = Math.max(1, Math.hypot(dx, dy));
            let ideal = isStart(zones.find(z => z.id === e.zone1)) && isStart(zones.find(z => z.id === e.zone2)) ? 900 : 575;
            let f = Math.max(-11, Math.min(11, (d - ideal) * 0.011));
            delta[e.zone1].x += dx / d * f;
            delta[e.zone1].y += dy / d * f;
            delta[e.zone2].x -= dx / d * f;
            delta[e.zone2].y -= dy / d * f;
        }
        let cool = Math.max(0.15, 1 - iter / 160);
        for (const z of zones) {
            const d = delta[z.id];
            positions[z.id].x += Math.max(-24, Math.min(24, d.x)) * cool;
            positions[z.id].y += Math.max(-24, Math.min(24, d.y)) * cool;
        }
    }
    const force = compactLayout(refineCrossings(map, separate(positions, 155)), { gap: 68 });
    const generic = betterLayout(map, spectral, force);
    if (quadrilateral) {
        const quadMetrics = layoutMetrics(map, quadrilateral), genericMetrics = layoutMetrics(map, generic);
        // A planar face candidate is useful only when it remains readable. A
        // zero-crossing drawing with dozens of lines running behind unrelated
        // cards is worse than a compact fallback with a couple of crossings.
        if (quadMetrics.intrusions > Math.max(12, genericMetrics.intrusions * 2 + 4)
            || quadMetrics.soft > genericMetrics.soft * 12)
            quadrilateral = null;
    }
    let winner = betterLayout(map, coreRing, betterLayout(map, reflection, betterLayout(map, topology, betterLayout(map, quadrilateral, generic))));
    winner = refineCrossingGeometry(map, winner, { passes: 6 });
    if (layoutMetrics(map, winner).crossings)
        winner = wideCrossingRescue(map, winner, { passes: 3 });
    winner = refineObstructions(map, winner, { passes: 3 });
    if (layoutMetrics(map, winner).intrusions)
        winner = targetedObstructionRescue(map, winner, { passes: 4 });
    if (layoutMetrics(map, winner).intrusions)
        winner = targetedObstructionRescue(map, winner, { passes: 2, steps: [390, 520] });
    if (layoutMetrics(map, winner).intrusions)
        winner = groupedObstructionRescue(map, winner, { passes: 2 });
    const compactWinner = compactClearLayoutCandidate(map, winner);
    if (!graph)
        return compactWinner;
    const polished = compactClearLayoutCandidate(map, distanceGuidedPolish(map, graph, winner, { passes: 3 }));
    return betterLayout(map, compactWinner, polished);
}
export function separate(positions, pad = 110) {
    let p = structuredClone(positions);
    const ids = Object.keys(p);
    for (let iter = 0; iter < 180; iter++) {
        let moved = false;
        for (let i = 0; i < ids.length; i++)
            for (let j = i + 1; j < ids.length; j++) {
                const a = p[ids[i]], b = p[ids[j]], dx = a.x - b.x, dy = a.y - b.y;
                let ox = CARD_W + pad - Math.abs(dx), oy = CARD_H + pad - Math.abs(dy);
                if (ox > 0 && oy > 0) {
                    moved = true;
                    const signX = dx === 0 ? (i % 2 ? -1 : 1) : Math.sign(dx), signY = dy === 0 ? (j % 2 ? -1 : 1) : Math.sign(dy);
                    if (ox < oy) {
                        const v = ox * .52;
                        a.x += signX * v;
                        b.x -= signX * v;
                    }
                    else {
                        const v = oy * .52;
                        a.y += signY * v;
                        b.y -= signY * v;
                    }
                }
            }
        if (!moved)
            break;
    }
    const minX = Math.min(...ids.map(id => p[id].x)), minY = Math.min(...ids.map(id => p[id].y));
    for (const pt of Object.values(p)) {
        pt.x = Math.round(pt.x - minX + 110);
        pt.y = Math.round(pt.y - minY + 110);
    }
    return p;
}
export function resizeLayout(map, factor) {
    if (!Object.keys(map.layout ?? {}).length)
        map.layout = autoLayout(map);
    const points = Object.values(map.layout), cx = points.reduce((n, p) => n + p.x, 0) / points.length, cy = points.reduce((n, p) => n + p.y, 0) / points.length;
    for (const p of points) {
        p.x = Math.round(cx + (p.x - cx) * factor);
        p.y = Math.round(cy + (p.y - cy) * factor);
    }
    map.layout = separate(map.layout, 68);
    return map.layout;
}
export function saveImagePositions(map) {
    const zones = map.zones.filter(z => map.layout?.[z.id]);
    if (!zones.length)
        return;
    const centers = zones.map(z => ({ z, x: map.layout[z.id].x + CARD_W / 2, y: map.layout[z.id].y + CARD_H / 2 }));
    // Fit the canvas into the existing HotA coordinate frame when possible.
    const previous = centers.map(p => { const a = String(p.z.zone_options?.image_settings ?? '').trim().split(/\s+/).map(Number); return a.length >= 2 && a.slice(0, 2).every(Number.isFinite) ? { ...p, ox: a[0], oy: a[1] } : null; }).filter(Boolean);
    let scale, offX, offY;
    if (previous.length >= 2) {
        const mean = (points, k) => points.reduce((a, p) => a + p[k], 0) / points.length;
        const cx = mean(previous, 'x'), cy = mean(previous, 'y'), ox = mean(previous, 'ox'), oy = mean(previous, 'oy');
        const d = previous.reduce((a, p) => a + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0), dot = previous.reduce((a, p) => a + (p.x - cx) * (p.ox - ox) + (p.y - cy) * (p.oy - oy), 0);
        scale = d > 1e-6 ? dot / d : 1;
        scale = Math.min(2, Math.max(.02, scale));
        offX = ox - cx * scale;
        offY = oy - cy * scale;
    }
    else {
        const xs = centers.map(p => p.x), ys = centers.map(p => p.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        let min = Infinity;
        for (let i = 0; i < centers.length; i++)
            for (let j = i + 1; j < centers.length; j++)
                min = Math.min(min, Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y));
        scale = min < Infinity && min > 0 ? 70 / min : 1;
        offX = -cx * scale;
        offY = -cy * scale;
    }
    for (const p of centers) {
        const existing = String(p.z.zone_options?.image_settings ?? '').trim().split(/\s+/);
        p.z.zone_options.image_settings = [String(Math.round(p.x * scale + offX)), String(Math.round(p.y * scale + offY)), ...existing.slice(2)].join(' ');
    }
}
