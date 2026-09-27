import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('zone cards have no node-type-hint, including PNG export',()=>{
  assert.doesNotMatch(source,/node-type-hint/);
  assert.doesNotMatch(css,/node-type-hint/);
});
test('all rich neutral cards use the gold/silver gradients',()=>{
  assert.match(html,/id="zone-gold"/);
  assert.match(html,/id="zone-silver"/);
  assert.match(css,/data-richness="mid"\] \.node-border\{fill:url\(#zone-silver\)/);
});
test('swords maintain dark/light contrast in both themes',()=>{
  assert.match(css,/\.node \.h3-icon-swords\{color:#263344\}/);
  assert.match(css,/data-richness="low"\] \.h3-icon-swords\{color:#e5edf7\}/);
});
test('panning coalesces bursts and uses composited CSS transforms',()=>{
  assert.match(source,/requestAnimationFrame\(flushCanvasTransform\)/);
  assert.match(source,/translate3d\(/);
  assert.match(css,/#canvas-content,#drag-preview\{[^}]*will-change:transform/);
  assert.match(source,/dragRect=\$\('canvas'\)\.getBoundingClientRect\(\)/);
  assert.match(css,/#canvas\.canvas-panning \.node \.node-border\{filter:none\}/);
});
