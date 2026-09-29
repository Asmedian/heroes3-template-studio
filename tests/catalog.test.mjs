import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseBytes,serializePack,convertPack,validatePack,SCHEMA,freshZone} from '../src/core.js';
import {autoLayout,CARD_H,CARD_W} from '../src/layout.js';
import {compactExact,mineEntries,townEntries,zoneAppearance,treasureScore} from '../src/visuals.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'templates/catalog.json'),'utf8'));
const records=[];
const statistic={files:0,maps:0,zones:0,connections:0,mineIcons:0,expectedWarnings:0,emptyMaps:0};
for(const item of catalog.templates){
 const data=fs.readFileSync(path.join(root,'templates',item.file));
 const pack=parseBytes(data,{filename:item.name+'.txt'});
 const problems=validatePack(pack);
 statistic.files++; statistic.maps+=pack.maps.length;statistic.expectedWarnings+=problems.length;
 for(const map of pack.maps){
  statistic.zones+=map.zones.length;statistic.connections+=map.connections.length;
  if(!map.zones.length)statistic.emptyMaps++;
  for(const zone of map.zones){
   const mines=mineEntries(zone);statistic.mineIcons+=mines.length;
   for(const resource of SCHEMA.resources)if(Number(zone.min_mines[resource])>0){
    assert.ok(mines.some(e=>e.resource===resource),`${item.name}: zone ${zone.id} lost resource ${resource}`);
   }
   for(const t of townEntries(zone))assert.ok(t.kind==='town'||t.kind==='castle');
  }
 }
 records.push({item,data,pack});
}
test('all 59 uploaded Templates.zip items are accessible with original bytes and hashes',()=>{
 assert.equal(catalog.count,59);assert.equal(catalog.templates.length,59);
 assert.equal(new Set(catalog.templates.map(e=>e.file)).size,59);
 for(const {item,data,pack} of records){
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256,
    `${item.file}: original bytes differ from catalog (possible Git line-ending conversion); restore files from the release archive and commit with .gitattributes`);
  assert.equal(data.length,item.bytes);
  assert.equal(pack.format,'sod',item.name);
  assert.ok(pack.maps.length>=1);
  const raw=serializePack(pack).bytes;
  assert.deepEqual(Buffer.from(raw),data,`${item.name}: unmodified save must be byte-identical`);
  assert.equal(pack.warnings.length,0,`${item.name}: unexpected parser warnings`);
 }
});
test('59 templates contain 238 maps, 2996 zones, 4285 connections and known legacy anomalies',()=>{
 assert.equal(statistic.maps,238);
 assert.equal(statistic.zones,2996);
 assert.equal(statistic.connections,4285);
 assert.equal(statistic.emptyMaps,4);
 assert.ok(statistic.mineIcons>500);
});
test('every non-empty map has collision-free initial layout including widest packs',()=>{
 let count=0;
 for(const {pack,item} of records)for(const map of pack.maps){
  if(!map.zones.length)continue;
  const positions=autoLayout(map,{preferStored:false});
  assert.equal(Object.keys(positions).length,map.zones.length,`${item.name}: ${map.name}`);
  const entries=Object.values(positions);
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
   const a=entries[i],b=entries[j];
   assert.ok(Math.abs(a.x-b.x)>=CARD_W+65||Math.abs(a.y-b.y)>=CARD_H+65,
     `${item.name}/${map.name}: initial nodes overlap ${i},${j}`);
  }
  count++;
 }
 assert.equal(count,statistic.maps-statistic.emptyMaps);
});
test('resource icons, colors and numeric shortening never mutate exact template values',()=>{
 assert.equal(compactExact('8500'),'8.5k');assert.equal(compactExact('10000'),'10k');
 assert.equal(compactExact('8501'),'8501');assert.equal(compactExact('999999999'),'999999999');
 assert.equal(compactExact('1001'),'1001');assert.equal(compactExact('10500'),'10.5k');
 assert.equal(compactExact('1000000000'),'1b');
 for(let owner=1;owner<=8;owner++){
  const zone=freshZone('sod',String(owner));zone.human_start='x';zone.ownership=String(owner);
  assert.equal(zoneAppearance(zone).owner,String(owner));
 }
 for(const {pack} of records)for(const map of pack.maps)for(const zone of map.zones){
  const value=treasureScore(zone);
  assert.ok(Number.isFinite(value));
  for(const e of mineEntries(zone)){
   assert.equal(e.min,String(Number(e.min)),`Non-numeric minimum on ${zone.id}`);
   if(Number(e.min)>=1000){assert.equal(Number(e.text.replace(/[kmb]/g,match=>({k:'e3',m:'e6',b:'e9'}[match]))),Number(e.min));}
  }
 }
});
test('the built-in catalog contains only new files and precaches all 59 offline',()=>{
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.ok(sw.includes("'./templates/catalog.json'"));
 for(const entry of catalog.templates)assert.ok(sw.includes(`'./templates/${entry.file}'`));
 for(const removed of ['Duel.h3t','Jebus Outcast.h3t','tesseract.txt']){
  assert.ok(!fs.existsSync(path.join(root,'templates',removed)));
  assert.ok(!sw.includes(`'./templates/${removed}'`));
 }
});
test('SoD -> HotA 1.7/1.8 conversions retain map/zone/link cardinality for all 59 files',()=>{
 for(const {item,pack} of records)for(const format of ['hota17','hota18']){
  const converted=convertPack(pack,format,{packName:item.name});
  assert.equal(converted.maps.length,pack.maps.length,item.name);
  const {bytes}=serializePack(converted);
  const reloaded=parseBytes(bytes,{filename:item.name+'.h3t'});
  assert.equal(reloaded.format,format,item.name);
  assert.equal(reloaded.maps.length,pack.maps.length,item.name);
  for(let i=0;i<pack.maps.length;i++){
   assert.equal(reloaded.maps[i].zones.length,pack.maps[i].zones.length,`${item.name}: ${format} zones`);
   assert.equal(reloaded.maps[i].connections.length,pack.maps[i].connections.length,`${item.name}: ${format} links`);
  }
 }
});
console.log('CATALOG_STATS',JSON.stringify(statistic));
