import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const layoutSource = fs.readFileSync(new URL('../src/layout.js', import.meta.url), 'utf8');
const css = ['styles.css', 'styles/base.css', 'styles/diagram.css', 'styles/controls.css', 'styles/template-picker.css'].map(name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8')).join('\n');
const flat = value => value.replace(/\s+/g, '');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
test('zone cards have no node-type-hint, including PNG export', () => {
    assert.doesNotMatch(source, /node-type-hint/);
    assert.doesNotMatch(css, /node-type-hint/);
});
test('all rich neutral cards use the gold/silver gradients', () => {
    assert.match(html, /id="zone-gold"/);
    assert.match(html, /id="zone-silver"/);
    assert.ok(flat(css).includes('data-richness="mid"] .node-border{fill:url(#zone-silver)'.replace(/\s+/g, '')));
});
test('swords maintain dark/light contrast in both themes', () => {
    assert.match(flat(css), /\.node\.h3-icon-swords\{color:#263344;?\}/);
    assert.match(flat(css), /data-richness="low"\]\.h3-icon-swords\{color:#e5edf7;?\}/);
});
test('panning coalesces bursts and uses composited CSS transforms', () => {
    assert.match(source, /requestAnimationFrame\(flushCanvasTransform\)/);
    assert.match(source, /translate3d\(/);
    assert.match(flat(css), /#canvas-content,#drag-preview\{[^}]*will-change:transform/);
    assert.ok(flat(source).includes("dragRect=$('canvas').getBoundingClientRect()"));
    assert.match(flat(css), /#canvas\.canvas-panning\.node\.node-border\{filter:none;?\}/);
});


test('template opening paints a blocking loader before expensive layout work', () => {
    assert.match(html, /id="template-loading-overlay"/);
    assert.match(source, /await showTemplateLoader\(token\)/);
    assert.match(source, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);
    assert.match(source, /setAttribute\('aria-busy', 'true'\)/);
    assert.match(flat(css), /\.template-loading-overlay\{[^}]*position:absolute;[^}]*inset:0;[^}]*z-index:30/);
    assert.match(flat(css), /\.template-loading-spinner\{[^}]*animation:template-loading-spin/);
});

test('restored complete layouts bypass automatic recomputation', () => {
    const restoreStart = source.indexOf('function restoreLayout(index)');
    const restoreEnd = source.indexOf('let upstreamLayoutsPromise', restoreStart);
    const restoreSource = source.slice(restoreStart, restoreEnd);
    const generated = restoreSource.indexOf('const generated = recommendedLayout(map, index)');
    const memoryReturn = restoreSource.indexOf('applyRestoredLayout(map, memoryLayout);');
    const storedReturn = restoreSource.indexOf('applyRestoredLayout(map, restored);');
    assert.ok(memoryReturn >= 0 && memoryReturn < generated, 'In-memory layout must bypass auto layout.');
    assert.ok(storedReturn >= 0 && storedReturn < generated, 'Persisted layout must bypass auto layout.');
});

test('layout scoring avoids hot-loop collection allocation without reducing search quality', () => {
    assert.match(layoutSource, /const count = graph\.ids\.length, points = new Array\(count\), centers = new Array\(count\), indexById = new Map\(\)/);
    assert.match(layoutSource, /const edges = graph\.edges\.map\(\(\[a, b\]\) => \[indexById\.get\(a\), indexById\.get\(b\)\]\)/);
    assert.doesNotMatch(layoutSource, /new Set\(\[a, b, c, d\]\)/);
    assert.doesNotMatch(layoutSource, /for \(const \[p, q\] of \[\[-dx/);
    assert.match(layoutSource, /refineCrossingGeometry\(map, winner, \{ passes: 6 \}\)/);
    assert.match(layoutSource, /targetedObstructionRescue\(map, winner, \{ passes: 4 \}\)/);
});
