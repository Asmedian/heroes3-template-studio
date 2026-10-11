import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseBytes } from '../src/core.js';
import { topologyLayout, autoLayout, compactLayout, edgeCrossings, layoutMetrics, CARD_W, CARD_H } from '../src/layout.js';
const input = name => parseBytes(new Uint8Array(fs.readFileSync(new URL(name, import.meta.url))));
const noCollision = points => {
    const pts = Object.values(points);
    for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++)
            assert.ok(Math.abs(pts[i].x - pts[j].x) >= CARD_W || Math.abs(pts[i].y - pts[j].y) >= CARD_H, 'Zones overlap.');
};
test('4SM4e topology-aware layout places four starts around a symmetric zero-crossing diagram', () => {
    const map = input('../templates/11-original.txt').maps.find(m => m.name === '4SM4e');
    assert.ok(map);
    const points = topologyLayout(map);
    assert.equal(Object.keys(points).length, 12);
    assert.equal(edgeCrossings(map.connections.map(c => [c.zone1, c.zone2]), points), 0);
    noCollision(points);
    // Starting zones are on the perimeter, matching the designer's logical grouping.
    assert.ok(points['1'].x < points['3'].x && points['2'].x < points['4'].x);
    assert.ok(points['1'].y > points['2'].y && points['4'].y > points['3'].y);
    assert.ok(points['7'].x < points['10'].x);
    assert.ok(points['12'].y < points['5'].y);
});
test('hypercube detection produces two symmetric rings for the actual XXL Tesseract', () => {
    const map = input('./fixtures/tesseract.txt').maps[0];
    const points = topologyLayout(map);
    assert.equal(Object.keys(points).length, 16);
    noCollision(points);
    const avg = { x: Object.values(points).reduce((a, p) => a + p.x, 0) / 16, y: Object.values(points).reduce((a, p) => a + p.y, 0) / 16 };
    const radial = p => Math.hypot(p.x - avg.x, p.y - avg.y);
    const radii = Object.values(points).map(radial).sort((a, b) => a - b);
    const outer = radii.slice(8), inner = radii.slice(0, 8);
    assert.ok(Math.min(...outer) > Math.max(...inner) * 2);
    assert.ok(edgeCrossings(map.connections.map(c => [c.zone1, c.zone2]), points) < 30);
    assert.deepEqual(autoLayout(map), points);
});
const uniqueEdges = map => [...new Set(map.connections.filter(c => map.zones.some(z => z.id === c.zone1) && map.zones.some(z => z.id === c.zone2) && c.zone1 !== c.zone2).map(c => JSON.stringify([c.zone1, c.zone2].sort())))].map(s => JSON.parse(s));
test('generic hub motif centers Jebus Cross without overlapping its four outer player starts', () => {
    const map = input('../templates/44-jebus-cross.txt').maps[0], p = topologyLayout(map);
    assert.ok(p);
    assert.equal(Object.keys(p).length, 5);
    noCollision(p);
    assert.equal(edgeCrossings(uniqueEdges(map), p), 0);
    const hub = p['5'], others = ['1', '2', '3', '4'].map(id => p[id]);
    assert.ok(hub.x > Math.min(...others.map(p => p.x)) && hub.x < Math.max(...others.map(p => p.x)));
    assert.ok(hub.y > Math.min(...others.map(p => p.y)) && hub.y < Math.max(...others.map(p => p.y)));
});
test('generic terminal and circular motifs produce predictable arrangements for unseen names', () => {
    const make = (ids, edges, starts) => ({ name: 'Unknown map', zones: ids.map(id => ({ id: String(id), human_start: starts.includes(id) ? 'x' : '' })), connections: edges.map(([a, b]) => ({ zone1: String(a), zone2: String(b) })) });
    const ring = make([1, 2, 3, 4, 5, 6], [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1]], []);
    const rp = topologyLayout(ring);
    assert.ok(rp);
    noCollision(rp);
    assert.equal(edgeCrossings(uniqueEdges(ring), rp), 0);
    const corridor = make([1, 2, 3, 4, 5, 6], [[1, 2], [2, 3], [2, 4], [3, 5], [4, 5], [5, 6]], [1, 6]);
    const cp = topologyLayout(corridor);
    assert.ok(cp);
    noCollision(cp);
    assert.equal(edgeCrossings(uniqueEdges(corridor), cp), 0);
    assert.ok(cp['1'].x < cp['2'].x && cp['2'].x < cp['5'].x && cp['5'].x < cp['6'].x);
});
test('layout depends on topology rather than template name or connection multiplicity', () => {
    const map = input('../templates/44-jebus-cross.txt').maps[0], plain = topologyLayout(map);
    const renamed = structuredClone(map);
    renamed.name = 'Definitely not Jebus';
    renamed.connections = [...renamed.connections, ...renamed.connections.filter(c => c.zone1 === '1' && c.zone2 === '5')];
    assert.deepEqual(topologyLayout(renamed), plain);
});
test('layout compaction preserves topology while enforcing a practical base card gap', () => {
    const original = { a: { x: 0, y: 0 }, b: { x: 1300, y: 0 }, c: { x: 2600, y: 0 } };
    const compact = compactLayout(original, { gap: 68 });
    assert.ok(compact.b.x - compact.a.x >= CARD_W + 68);
    assert.ok(compact.c.x - compact.b.x >= CARD_W + 68);
    assert.ok(compact.c.x - compact.a.x < original.c.x - original.a.x);
});


test('reference templates use compact topology-driven layouts with minimal line obstruction', () => {
    const cases = [
        ['../templates/27-balance.txt', 'Balance', 1],
        ['../templates/29-blockbuster.txt', 'Blockbuster', 0],
        ['../templates/31-coldshadow-fantasy.txt', "Coldshadow's Fantasy", 0],
        ['../templates/37-fear.txt', 'Fear', 0]
    ];
    for (const [file, name, maxIntrusions] of cases) {
        const map = input(file).maps[0], points = autoLayout(map, { preferStored: false }), metrics = layoutMetrics(map, points);
        assert.ok(map.name.includes(name));
        noCollision(points);
        assert.equal(metrics.crossings, 0, `${name}: avoidable edge crossing`);
        assert.ok(metrics.intrusions <= maxIntrusions, `${name}: connection passes behind too many unrelated cards`);
    }
    const coldshadow = input('../templates/31-coldshadow-fantasy.txt').maps[0];
    const metrics = layoutMetrics(coldshadow, autoLayout(coldshadow, { preferStored: false }));
    assert.ok(metrics.width < 2400 && metrics.height < 2400, 'Coldshadow shell should stay compact.');
});

test('non-sequential zone IDs do not control topology placement quality', () => {
    const map = structuredClone(input('../templates/31-coldshadow-fantasy.txt').maps[0]);
    const replacements = ['401', '17', '950', '62', '333', '4', '711', '28', '806', '53', '290', '15', '640', '91', '502', '39', '870', '76', '444', '8', '999'];
    const remap = new Map(map.zones.map((zone, index) => [String(zone.id), replacements[index]]));
    for (const zone of map.zones)
        zone.id = remap.get(String(zone.id));
    for (const connection of map.connections) {
        connection.zone1 = remap.get(String(connection.zone1)) ?? connection.zone1;
        connection.zone2 = remap.get(String(connection.zone2)) ?? connection.zone2;
    }
    const points = autoLayout(map, { preferStored: false }), metrics = layoutMetrics(map, points);
    noCollision(points);
    assert.equal(metrics.crossings, 0);
    assert.equal(metrics.intrusions, 0);
});



test('Anarchy v1.01 dense planar graph follows the layered diamond without line obstruction', () => {
    const map = input('../templates/25-anarchy-v1-01.txt').maps[4];
    assert.equal(map.zones.length, 17);
    assert.equal(map.connections.length, 36);
    const points = autoLayout(map, { preferStored: false }), metrics = layoutMetrics(map, points);
    noCollision(points);
    assert.equal(metrics.crossings, 0);
    assert.equal(metrics.intrusions, 0);
    assert.ok(points['10'].y < points['5'].y && points['10'].y < points['6'].y);
    assert.ok(points['9'].y > points['12'].y && points['9'].y > points['13'].y);
    assert.ok(points['8'].x < points['2'].x && points['2'].x < points['11'].x);
    assert.ok(points['11'].x < points['1'].x && points['1'].x < points['7'].x);
    assert.ok(points['5'].y < points['11'].y && points['12'].y > points['11'].y);

    // Numeric source IDs are only a deterministic tie-breaker; sparse or
    // shuffled IDs must not reduce the geometric quality of the result.
    const shuffled = structuredClone(map);
    const replacements = ['401', '17', '950', '62', '333', '4', '711', '28', '806', '53', '290', '15', '640', '91', '502', '39', '870'];
    const remap = new Map(shuffled.zones.map((zone, index) => [String(zone.id), replacements[index]]));
    for (const zone of shuffled.zones)
        zone.id = remap.get(String(zone.id));
    for (const connection of shuffled.connections) {
        connection.zone1 = remap.get(String(connection.zone1)) ?? connection.zone1;
        connection.zone2 = remap.get(String(connection.zone2)) ?? connection.zone2;
    }
    const shuffledMetrics = layoutMetrics(shuffled, autoLayout(shuffled, { preferStored: false }));
    assert.equal(shuffledMetrics.crossings, 0);
    assert.equal(shuffledMetrics.intrusions, 0);
});

test('complex Balance variant and planar Q3 cube avoid both crossings and card obstruction', () => {
    const balance = input('../templates/27-balance.txt').maps[2];
    const balancePoints = autoLayout(balance, { preferStored: false }), balanceMetrics = layoutMetrics(balance, balancePoints);
    noCollision(balancePoints);
    assert.equal(balanceMetrics.crossings, 0);
    assert.equal(balanceMetrics.intrusions, 0);
    assert.ok(balanceMetrics.width < 1500 && balanceMetrics.height < 1400, 'Symmetric Balance layout should stay compact.');

    const cube = input('../templates/32-cube.txt').maps[0];
    const cubePoints = autoLayout(cube, { preferStored: false }), cubeMetrics = layoutMetrics(cube, cubePoints);
    noCollision(cubePoints);
    assert.equal(cubeMetrics.crossings, 0);
    assert.equal(cubeMetrics.intrusions, 0);
});

test('disconnected template components are laid out separately instead of crossing each other', () => {
    const map = input('../templates/47-match-terrain.txt').maps.find(item => item.name === '8XM8');
    assert.ok(map);
    const points = autoLayout(map, { preferStored: false }), metrics = layoutMetrics(map, points);
    noCollision(points);
    assert.equal(metrics.crossings, 0);
    assert.ok(metrics.intrusions <= 1);
});

test('ideal-layout reference families keep the improved topology and regularity', () => {
    const sm4e = input('../templates/11-original.txt').maps.find(map => map.name === '4SM4e');
    const sm4eMetrics = layoutMetrics(sm4e, autoLayout(sm4e, { preferStored: false }));
    assert.equal(sm4eMetrics.crossings, 0);
    assert.equal(sm4eMetrics.intrusions, 0);
    assert.ok(sm4eMetrics.soft < 160000, '4SM4e ring should stay compact and balanced.');

    const lm10a = input('../templates/19-6lm10a.txt').maps[0];
    const lm10aMetrics = layoutMetrics(lm10a, autoLayout(lm10a, { preferStored: false }));
    assert.equal(lm10aMetrics.crossings, 0);
    assert.equal(lm10aMetrics.intrusions, 0, '6LM10a should not route a connection behind an unrelated zone.');

    const xm12a = input('../templates/24-8xm12a.txt').maps[0];
    const xm12aMetrics = layoutMetrics(xm12a, autoLayout(xm12a, { preferStored: false }));
    assert.equal(xm12aMetrics.crossings, 0);
    assert.equal(xm12aMetrics.intrusions, 0);
    assert.ok(xm12aMetrics.coefficient < 0.25, '8XM12a should retain its regular grid-like edge lengths.');
    assert.ok(xm12aMetrics.soft < 400000, '8XM12a should stay substantially cleaner than the 1.6.3 layout.');
});
