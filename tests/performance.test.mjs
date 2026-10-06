import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=['styles.css','styles/base.css','styles/diagram.css','styles/controls.css','styles/template-picker.css'].map(name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8')).join('\n');
const flat=value=>value.replace(/\s+/g,'');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('zone cards have no node-type-hint, including PNG export',()=>{
  assert.doesNotMatch(source,/node-type-hint/);
  assert.doesNotMatch(css,/node-type-hint/);
});
test('all rich neutral cards use the gold/silver gradients',()=>{
  assert.match(html,/id="zone-gold"/);
  assert.match(html,/id="zone-silver"/);
  assert.ok(flat(css).includes('data-richness="mid"] .node-border{fill:url(#zone-silver)'.replace(/\s+/g,'')));
});
test('swords maintain dark/light contrast in both themes',()=>{
  assert.match(flat(css),/\.node\.h3-icon-swords\{color:#263344;?\}/);
  assert.match(flat(css),/data-richness="low"\]\.h3-icon-swords\{color:#e5edf7;?\}/);
});
test('panning coalesces bursts and uses composited CSS transforms',()=>{
  assert.match(source,/requestAnimationFrame\(flushCanvasTransform\)/);
  assert.match(source,/translate3d\(/);
  assert.match(flat(css),/#canvas-content,#drag-preview\{[^}]*will-change:transform/);
  assert.ok(flat(source).includes("dragRect=$('canvas').getBoundingClientRect()"));
  assert.match(flat(css),/#canvas\.canvas-panning\.node\.node-border\{filter:none;?\}/);
});
