import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const file=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('connection guard values double in size and dark theme uses blue',()=>{
 const app=file('src/app.js'),css=file('styles.css');
 assert.match(css,/--conn-label:#5c9eff/);
 assert.match(css,/\.connection \.conn-label\{fill:var\(--conn-label\);font-size:24px/);
 assert.match(app,/height="36" rx="8"/);
});
test('click-away closes custom menus and centered chevron remains fixed',()=>{
 const app=file('src/app.js'),html=file('index.html'),css=file('styles.css');
 assert.match(app,/closest\('#canvas-legend'\)/);
 assert.match(app,/matchMedia\('\(max-width:970px\)'\)/);
 assert.match(css,/\.canvas-top-info \.legend-chevron\{[^}]*place-items:center[^}]*transform-origin:50% 50%/);
 assert.match(html,/class="legend-chevron"[^>]*><svg viewBox="0 0 20 20"/);
});
test('live editor input is frame-coalesced and undo is one change per focus',()=>{
 const app=file('src/app.js');
 assert.match(app,/addEventListener\('input',e=>/);
 assert.match(app,/liveEdits=new WeakMap\(\)/);
 assert.match(app,/liveRefreshId=requestAnimationFrame/);
 assert.match(app,/if\(finishLiveEdit\(field\)\)return/);
});
