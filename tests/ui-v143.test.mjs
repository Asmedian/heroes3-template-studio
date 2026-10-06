import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const file = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const css = ['styles.css', 'styles/base.css', 'styles/diagram.css', 'styles/controls.css', 'styles/template-picker.css'].map(file).join('\n');
const flat = value => value.replace(/\s+/g, '');

test('connection guard values double in size and dark theme uses blue', () => {
    const app = file('src/app.js');
    assert.ok(flat(css).includes('--conn-label:#5c9eff'));
    assert.match(css, /\.connection \.conn-label\s*\{[^}]*font-size:\s*24px/s);
    assert.ok(flat(app).includes('height="36"rx="8"'));
});

test('click-away closes custom menus and centered chevron remains fixed', () => {
    const app = file('src/app.js');
    const html = file('index.html');
    assert.ok(app.includes("closest('#canvas-legend')"));
    assert.ok(app.includes("matchMedia('(max-width:970px)')"));
    assert.match(css, /\.canvas-top-info \.legend-chevron\s*\{[^}]*place-items:\s*center[^}]*transform-origin:\s*50% 50%/s);
    assert.match(html, /class="legend-chevron"[^>]*>\s*<svg\s+viewBox="0 0 20 20"/s);
});

test('live editor input is frame-coalesced and undo is one change per focus', () => {
    const app = file('src/app.js');
    assert.match(app, /addEventListener\('input',\s*e\s*=>/);
    assert.match(app, /liveEdits\s*=\s*new WeakMap\(\)/);
    assert.match(app, /liveRefreshId\s*=\s*requestAnimationFrame/);
    assert.match(app, /if\s*\(finishLiveEdit\(field\)\)\s*return/);
});
