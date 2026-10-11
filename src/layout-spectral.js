/**
 * Generic topology-only spectral candidates for graph drawing.
 *
 * The algorithm never relies on template names or numeric zone-id order. It uses
 * the graph Laplacian, then projects several low-frequency eigenvectors into 2D.
 * Multiple deterministic projections are returned because symmetric graphs can
 * collapse when only the second/third eigenvectors are used.
 */
const EPS = 1e-9;

function connected(graph) {
    if (!graph.ids.length)
        return false;
    const seen = new Set([graph.ids[0]]), queue = [graph.ids[0]];
    for (let i = 0; i < queue.length; i++) {
        for (const next of graph.adjacency.get(queue[i])) {
            if (!seen.has(next)) {
                seen.add(next);
                queue.push(next);
            }
        }
    }
    return seen.size === graph.ids.length;
}

function identity(n) {
    return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => row === col ? 1 : 0));
}

/** Cyclic Jacobi diagonalization for a small real symmetric matrix. */
function jacobiEigen(matrix) {
    const n = matrix.length;
    const a = matrix.map(row => row.slice()), vectors = identity(n);
    const maxSweeps = Math.max(14, Math.min(30, Math.ceil(Math.log2(Math.max(2, n))) * 4));
    for (let sweep = 0; sweep < maxSweeps; sweep++) {
        let largest = 0;
        for (let p = 0; p < n - 1; p++) {
            for (let q = p + 1; q < n; q++) {
                const apq = a[p][q];
                largest = Math.max(largest, Math.abs(apq));
                if (Math.abs(apq) < 1e-11)
                    continue;
                const tau = (a[q][q] - a[p][p]) / (2 * apq);
                const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
                const c = 1 / Math.sqrt(1 + t * t), s = t * c;
                const app = a[p][p], aqq = a[q][q];
                a[p][p] = app - t * apq;
                a[q][q] = aqq + t * apq;
                a[p][q] = 0;
                a[q][p] = 0;
                for (let k = 0; k < n; k++) {
                    if (k === p || k === q)
                        continue;
                    const akp = a[k][p], akq = a[k][q];
                    const np = c * akp - s * akq, nq = s * akp + c * akq;
                    a[k][p] = a[p][k] = np;
                    a[k][q] = a[q][k] = nq;
                }
                for (let k = 0; k < n; k++) {
                    const vkp = vectors[k][p], vkq = vectors[k][q];
                    vectors[k][p] = c * vkp - s * vkq;
                    vectors[k][q] = s * vkp + c * vkq;
                }
            }
        }
        if (largest < 1e-9)
            break;
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i][i] - a[j][j]);
    return {
        values: order.map(i => a[i][i]),
        vectors: order.map(i => vectors.map(row => row[i]))
    };
}

function graphHash(graph) {
    let h = 2166136261 >>> 0;
    const mix = value => {
        const text = String(value);
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
    };
    // Degree/edge structure dominates the seed; IDs are only a deterministic tie-break.
    for (const id of graph.ids) {
        mix(graph.adjacency.get(id).size);
        mix(id);
    }
    for (const [a, b] of graph.edges) {
        mix(a);
        mix(b);
    }
    return h || 0x9e3779b9;
}

function rng(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function gaussian(random) {
    const u = Math.max(EPS, random()), v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function normalize(points, ids) {
    let mx = 0, my = 0;
    for (const id of ids) {
        mx += points[id].x;
        my += points[id].y;
    }
    mx /= ids.length;
    my /= ids.length;
    let sx = 0, sy = 0;
    for (const id of ids) {
        const dx = points[id].x - mx, dy = points[id].y - my;
        sx += dx * dx;
        sy += dy * dy;
    }
    sx = Math.sqrt(sx / ids.length);
    sy = Math.sqrt(sy / ids.length);
    if (sx < 1e-8 || sy < 1e-8)
        return null;
    return Object.fromEntries(ids.map(id => [id, {
        x: (points[id].x - mx) / sx,
        y: (points[id].y - my) / sy
    }]));
}

/** Return normalized, deterministic 2D candidates for a connected graph. */
export function spectralCandidates(graph) {
    const n = graph.ids.length;
    if (n < 5 || n > 52 || !connected(graph))
        return [];
    const index = new Map(graph.ids.map((id, i) => [id, i]));
    const laplacian = Array.from({ length: n }, () => Array(n).fill(0));
    for (const id of graph.ids) {
        const i = index.get(id);
        laplacian[i][i] = graph.adjacency.get(id).size;
    }
    for (const [a, b] of graph.edges) {
        const i = index.get(a), j = index.get(b);
        laplacian[i][j] = -1;
        laplacian[j][i] = -1;
    }
    const eigen = jacobiEigen(laplacian);
    const usable = eigen.values.map((value, i) => ({ value, vector: eigen.vectors[i] }))
        .filter(item => item.value > 1e-7)
        .slice(0, Math.min(12, n - 1));
    if (usable.length < 2)
        return [];
    const candidates = [];
    const add = (xs, ys) => {
        const raw = {};
        graph.ids.forEach((id, i) => { raw[id] = { x: xs[i], y: ys[i] }; });
        const normalized = normalize(raw, graph.ids);
        if (normalized)
            candidates.push(normalized);
    };
    const pairLimit = Math.min(7, usable.length);
    for (let i = 0; i < pairLimit; i++)
        for (let j = i + 1; j < pairLimit && j < i + 4; j++)
            add(usable[i].vector, usable[j].vector);
    const random = rng(graphHash(graph));
    for (let sample = 0; sample < 18; sample++) {
        const alpha = .48 + random() * .34;
        const wx = usable.map(item => gaussian(random) / Math.pow(item.value, alpha));
        const wy = usable.map(item => gaussian(random) / Math.pow(item.value, alpha));
        const xs = Array(n).fill(0), ys = Array(n).fill(0);
        for (let k = 0; k < usable.length; k++) {
            const vector = usable[k].vector;
            for (let i = 0; i < n; i++) {
                xs[i] += vector[i] * wx[k];
                ys[i] += vector[i] * wy[k];
            }
        }
        add(xs, ys);
    }
    return candidates;
}


/**
 * Classical multidimensional-scaling candidates from all-pairs graph distances.
 *
 * Laplacian eigenvectors are excellent for separating many irregular graphs,
 * but symmetric ladders/grids are often represented more faithfully by their
 * shortest-path metric. Classical MDS converts that metric into Euclidean
 * coordinates without using template names, source IDs, or stored positions.
 * A single scale is deliberately preserved between axes so wide/tall authored
 * structures do not get forced into a square.
 */
export function distanceCandidates(graph) {
    const n = graph.ids.length;
    if (n < 5 || n > 52 || !connected(graph))
        return [];
    const index = new Map(graph.ids.map((id, i) => [id, i]));
    const distance = Array.from({ length: n }, () => Array(n).fill(Infinity));
    for (let i = 0; i < n; i++) {
        distance[i][i] = 0;
        const queue = [graph.ids[i]];
        for (let k = 0; k < queue.length; k++) {
            const current = queue[k], currentIndex = index.get(current);
            for (const next of graph.adjacency.get(current)) {
                const nextIndex = index.get(next);
                if (distance[i][nextIndex] !== Infinity)
                    continue;
                distance[i][nextIndex] = distance[i][currentIndex] + 1;
                queue.push(next);
            }
        }
        if (distance[i].some(value => !Number.isFinite(value)))
            return [];
    }

    const rowMean = Array(n).fill(0), totalMean = distance.flat().reduce((sum, value) => sum + value * value, 0) / (n * n);
    for (let i = 0; i < n; i++)
        rowMean[i] = distance[i].reduce((sum, value) => sum + value * value, 0) / n;
    const gram = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
        -.5 * (distance[i][j] ** 2 - rowMean[i] - rowMean[j] + totalMean)));
    const eigen = jacobiEigen(gram);
    const usable = eigen.values.map((value, i) => ({ value, vector: eigen.vectors[i] }))
        .filter(item => item.value > 1e-7)
        .sort((a, b) => b.value - a.value)
        .slice(0, Math.min(5, n - 1));
    if (usable.length < 2)
        return [];

    const candidates = [];
    const pairs = [[0, 1]];
    for (const [a, b] of pairs) {
        const sx = Math.sqrt(usable[a].value), sy = Math.sqrt(usable[b].value), raw = {};
        graph.ids.forEach((id, i) => {
            raw[id] = { x: usable[a].vector[i] * sx, y: usable[b].vector[i] * sy };
        });
        candidates.push(raw);
    }
    return candidates;
}
