import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(file('package.json'));
const manifest=JSON.parse(file('manifest.webmanifest'));
const sw=file('sw.js');
test('PWA version is synchronized across package, manifest, SW and UI',()=>{
  assert.match(pkg.version,/^\d+\.\d+\.\d+$/);assert.equal(manifest.version,pkg.version);
  assert.ok(sw.includes(`const VERSION='${pkg.version}';`));
  assert.ok(file('index.html').includes(`<span>v${pkg.version}</span>`));
});
test('PWA manifest paths are relative for GitHub Pages subdirectory',()=>{
  for(const key of ['id','start_url','scope'])assert.equal(manifest[key],'./');
  assert.equal(manifest.display,'standalone');
  for(const i of manifest.icons){assert.ok(i.src.startsWith('./'));assert.ok(fs.existsSync(path.join(root,i.src)));}
  assert.ok(manifest.icons.some(x=>x.sizes==='192x192'));
  assert.ok(manifest.icons.some(x=>x.sizes==='512x512'));
});
test('service worker offline cache contains every module and its own manifest',()=>{
  assert.ok(sw.includes("'./manifest.webmanifest'"));
  for(const name of ['app.js','core.js','layout.js','sidecar.js','schema-data.js']){
    assert.ok(sw.includes(`'./src/${name}'`));
    assert.ok(fs.existsSync(path.join(root,'src',name)));
  }
  const assets=sw.match(/const ASSETS=\[([\s\S]*?)\];/)[1];
  for(const match of assets.matchAll(/'\.\/([^']*)'/g)){
    const target=match[1]||'index.html';assert.ok(fs.existsSync(path.join(root,target)),`Offline asset missing: ${target}`);
  }
});
test('HTML contains named install, theme, upload, canvas, zoom and export controls',()=>{
  const html=file('index.html');
  for(const id of ['install-btn','theme-btn','file-input','canvas','zoom-in','zoom-out','zoom-fit','save-btn','convert-btn','export-format','drop-hint','layout-input'])
    assert.ok(html.includes(`id="${id}"`),`Missing control ${id}`);
  assert.ok(html.includes('rel="manifest"'));assert.match(html,/src="\.\/src\/app\.js(?:\?v=[^"]+)?"/);
  assert.ok(file('styles.css').includes('html[data-theme="dark"]'));
  assert.ok(file('styles.css').includes('html[data-theme="light"]'));
  assert.ok(!file('styles.css').includes('.file-actions #save-btn{display:none}')); // Save must remain on mobile.
});

test('raster install icons have declared exact PNG dimensions',()=>{
  for(const size of [192,512]){
    const buf=fs.readFileSync(path.join(root,`public/icons/icon-${size}.png`));
    assert.equal(buf.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(buf.readUInt32BE(16),size);assert.equal(buf.readUInt32BE(20),size);
  }
  const apple=fs.readFileSync(path.join(root,'public/icons/apple-touch-icon.png'));
  assert.equal(apple.readUInt32BE(16),180);assert.equal(apple.readUInt32BE(20),180);
});


test('all eight supplied icons are optimized and embedded for offline SVG/PNG export',()=>{
 const html=file('index.html');
 for(const glyph of ['chest','wood','mercury','ore','sulfur','crystal','gems','gold']){
  assert.ok(html.includes(`id="h3-${glyph}"`),glyph);
  const icon=fs.readFileSync(path.join(root,`public/template-icons/${glyph}.png`));
  assert.equal(icon.readUInt32BE(16),64,`${glyph} width`);
  assert.equal(icon.readUInt32BE(20),64,`${glyph} height`);
  assert.ok(icon.length<32000,`${glyph} is not downscaled`);
 }
 assert.ok(html.includes('id="h3-swords"'));
 assert.ok(html.includes('id="zone-gold"'));
 assert.ok(!fs.existsSync(path.join(root,'public/hota-icons')));
 assert.ok(!fs.existsSync(path.join(root,'public/h3-icons')));
});
test('all sixteen player-colored roof/flag/gate icons and neutral originals are embedded',()=>{
 const html=file('index.html');
 for(const building of ['fort','village']){
  assert.ok(fs.existsSync(path.join(root,`public/template-icons/${building}.svg`)));
  assert.ok(html.includes(`id="h3-${building}-neutral"`));
  for(let owner=1;owner<=8;owner++){
   const color=['#e64d4d','#7083e7','#c8ac84','#79c662','#e47f16','#a878b3','#55c0c3','#db98a7'][owner-1];
   assert.ok(html.includes(`id="h3-${building}-${owner}"`));
   const svg=file(`public/template-icons/${building}-${owner}.svg`);
   assert.ok(svg.includes(color),`${building}/${owner} missing requested color`);
   assert.ok(svg.includes('roof')&&svg.includes('flags')&&svg.includes('gate'),`${building}/${owner} missing editable groups`);
  }
 }
 const css=file('styles.css');for(const color of ['#e64d4d','#7083e7','#c8ac84','#79c662','#e47f16','#a878b3','#55c0c3','#db98a7'])assert.ok(css.includes(color));
});
test('map inspector is permanently available, phone name and dismiss logic are present',()=>{
 const html=file('index.html'),app=file('src/app.js'),css=file('styles.css');
 assert.ok(html.includes('id="inspector-context-tabs"'));
 assert.ok(html.includes('brand-short">H3 TS'));
 assert.ok(html.includes('id="i-menu"'));
 assert.ok(app.includes('inspectorSelection()'));
 assert.ok(app.includes("!event.target.closest('#sidebar,#sidebar-toggle')"));
 assert.ok(css.includes('grid-template-columns:minmax(0,1fr)'));
});
test('original-software layouts are available for all 59 catalog packages offline',()=>{
 const catalog=JSON.parse(file('templates/catalog.json'));
 const layouts=JSON.parse(file('templates/upstream-layouts.json'));
 assert.equal(Object.keys(layouts.templates).length,59);
 for(const item of catalog.templates)assert.ok(layouts.templates[item.id]?.length>=1,item.name);
 assert.ok(sw.includes("'./templates/upstream-layouts.json'"));
});
test('Git attributes preserve original bytes of catalog templates and regression fixtures',()=>{
  const attrs=file('.gitattributes').split(/\r?\n/).filter(line=>line && !line.startsWith('#'));
  for(const rule of ['templates/*.txt -text','tests/fixtures/*.txt -text','tests/fixtures/*.h3t -text']){
    assert.ok(attrs.includes(rule),`Missing byte-preservation rule: ${rule}`);
  }
});

test('native PWA install banner is not suppressed and both mobile app meta tags exist',()=>{
  const html=file('index.html'),app=file('src/app.js');
  assert.ok(html.includes('<meta name="mobile-web-app-capable" content="yes">'));
  assert.ok(html.includes('<meta name="apple-mobile-web-app-capable" content="yes">'));
  const handler=app.match(/window\.addEventListener\('beforeinstallprompt',event=>\{([^}]*)\}\);/);
  assert.ok(handler,'Missing native browser install handler');
  assert.ok(!handler[1].includes('preventDefault'),'Native browser install banner should not be blocked');
  assert.ok(app.includes('await prompt.prompt()'),'The visible Install button must invoke the browser prompt');
});

test('enlarged card artwork survives SVG/PNG export without a heavy legend rebuild on pan',()=>{
  const app=file('src/app.js'),css=file('styles.css');
  assert.ok(app.includes("svgIcon('chest',6,3,43)"));
  assert.ok(app.includes("svgIcon('swords',CARD_W-7-(j+1)*30,7,30)"));
  assert.ok(app.includes('svgIcon(symbol,x,y+slotIconDy(symbol),40)'));
  assert.ok(app.includes('const SLOT_ICON_DY={wood:-2.5,mercury:-1,ore:-3,sulfur:-4.5,crystal:-5.5,gems:-2.5,gold:0}'));
  assert.ok(css.includes('.node-treasure{font-size:32px'));
  assert.ok(css.includes('.node .h3-slot-count{font-size:14px'));
  assert.ok(app.includes('.node-treasure{font-size:32px;font-weight:850}'));
  assert.ok(app.includes('function renderAll(){renderSidebar();renderToolbar();renderCanvas();renderLegend();'));
  const renderCanvas=app.match(/function renderCanvas\(\)\{([\s\S]*?)\n\}/);
  assert.ok(renderCanvas&&!renderCanvas[1].includes('renderLegend()'),'Pan/zone drag must not rebuild the legend');
});

test('current-map legend is collapsed by default and release documentation is consolidated',()=>{
  const html=file('index.html'),app=file('src/app.js'),ignore=file('.gitignore');
  assert.ok(html.includes('<details class="canvas-top-info" id="canvas-legend" hidden>'));
  assert.ok(html.includes('id="legend-summary"'));
  assert.ok(html.includes('id="legend-content"'));
  assert.ok(app.includes('const owners=[...new Set(looks.map(a=>a.owner).filter(Boolean))]'));
  assert.ok(app.includes('const present=new Set(zones.flatMap(mineEntries)'));
  assert.ok(app.includes('const appearance=links.map(connectionAppearance)'));
  assert.ok(app.includes("$('canvas-legend').open=false"));
  for(const name of ['PROJECT_CHANGES.md','PROJECT_TESTS.md'])assert.ok(ignore.split(/\r?\n/).includes(name),name);
  for(const name of ['CHANGELOG.md','CI_FIX_RU.md','CI_TEST_REPORT.md','GITHUB_ABOUT.txt','PATCH_NOTES_RU.md','TEST_REPORT.md'])
    assert.ok(!fs.existsSync(path.join(root,name)),`Obsolete release file: ${name}`);
});


test('v1.5.2 uses strict digit-only numeric controls and live sanitization',()=>{
 const app=file('src/app.js');
 assert.ok(app.includes('const isNumericField=path=>'));
 assert.ok(app.includes('data-numeric="1" inputmode="numeric" pattern="[0-9]*"'));
 assert.ok(app.includes("addEventListener('beforeinput'"));
 assert.ok(app.includes("replace(/[^0-9]/g,''"));
});

test('v1.5.2 PWA update path bypasses stale app-shell caches',()=>{
 const html=file('index.html'),app=file('src/app.js');
 assert.ok(html.includes('styles.css?v=1.5.2'));
 assert.ok(html.includes('src="./src/app.js?v=1.5.2"'));
 assert.ok(app.includes("register('./sw.js?v=1.5.2'"));
 assert.ok(app.includes("updateViaCache:'none'"));
 assert.ok(app.includes('await registration.update()'));
 assert.ok(sw.includes("const mutable=/\\.(?:html|css|js|webmanifest|json)$/i"));
 assert.ok(sw.includes("cache:'no-store'"));
 assert.ok(sw.includes("caches.match(request,{ignoreSearch:true})"));
});

test('opened files share canonical built-in layouts and do not reuse obsolete layout cache namespaces',()=>{
 const app=file('src/app.js');
 assert.ok(app.includes('function matchPackPresets(pack,layouts)'));
 assert.ok(app.includes('matchPackPresets(pack,await loadUpstreamLayouts())'));
 assert.ok(app.includes('h3tc-layout-v3-'));
 assert.ok(app.includes('topologyLayout(map)||autoLayout(map,{preferStored:false})'));
});

test('unified scrollbars and dropdown/legend chevrons are styled consistently',()=>{
 const css=file('styles.css');
 assert.ok(css.includes('*::-webkit-scrollbar-thumb'));
 assert.ok(css.includes('scrollbar-color:var(--scroll-thumb) var(--scroll-track)'));
 assert.ok(css.includes('select{\n appearance:none'));
 assert.ok(css.includes('.canvas-top-info .legend-chevron{width:25px'));
 assert.ok(css.includes('.canvas-top-info[open] .legend-chevron svg{transform:rotate(180deg)}'));
});


test('mobile pinch state is cleared after cancelled or lost touch contacts',()=>{
 const app=file('src/app.js');
 assert.ok(app.includes('if(e.isPrimary&&touchPoints.size)resetTouchGesture()'));
 assert.ok(app.includes("addEventListener('pointercancel',e=>{releaseCanvasPointer(e.pointerId);resetTouchGesture();})"));
 assert.ok(app.includes("addEventListener('lostpointercapture'"));
 assert.ok(app.includes("window.addEventListener('blur',resetTouchGesture)"));
});
