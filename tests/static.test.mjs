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
  assert.ok(html.includes('rel="manifest"'));assert.ok(html.includes('src="./src/app.js"'));
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


test('every template symbol uses upstream SVG artwork, bundled for offline export',()=>{
 const html=file('index.html'),app=file('src/app.js');
 for(const glyph of ['chest','swords','wood','mercury','ore','sulfur','crystal','gems','gold','castle']){
  assert.ok(html.includes(`id="h3-${glyph}"`),`Missing upstream SVG symbol: ${glyph}`);
  assert.ok(fs.existsSync(path.join(root,`public/h3-icons/${glyph}.svg`)));
 }
 assert.ok(app.includes('upstream-glyph'));
 assert.ok(!app.includes('HOTA_GLYPHS'));
});
test('original-software layouts are available for all 59 catalog packages offline',()=>{
 const catalog=JSON.parse(file('samples/catalog.json'));
 const layouts=JSON.parse(file('samples/upstream-layouts.json'));
 assert.equal(Object.keys(layouts.templates).length,59);
 for(const item of catalog.templates)assert.ok(layouts.templates[item.id]?.length>=1,item.name);
 assert.ok(sw.includes("'./samples/upstream-layouts.json'"));
});
test('Git attributes preserve original bytes of catalog templates and regression fixtures',()=>{
  const attrs=file('.gitattributes').split(/\r?\n/).filter(line=>line && !line.startsWith('#'));
  for(const rule of ['samples/*.txt -text','tests/fixtures/*.txt -text','tests/fixtures/*.h3t -text']){
    assert.ok(attrs.includes(rule),`Missing byte-preservation rule: ${rule}`);
  }
});
