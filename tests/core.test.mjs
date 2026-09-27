import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  SCHEMA,readTSV,writeTSV,decodeBytes,encodeText,parseText,parseBytes,serializePack,
  freshPack,freshZone,freshConnection,convertPack,renumberMap,remapHintRefs,validatePack
} from '../src/core.js';
import {autoLayout,resizeLayout,saveImagePositions,separate,CARD_W,CARD_H} from '../src/layout.js';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const FIXTURES=[
  ['tesseract.txt','sod',1,16,32],
  ['Duel.h3t','hota17',30,270,420],
  ['Jebus Outcast.h3t','hota17',126,962,2216]
];
const fixture=name=>new Uint8Array(fs.readFileSync(path.join(ROOT,'fixtures',name)));
const counts=pack=>[pack.maps.length,pack.maps.reduce((sum,map)=>sum+map.zones.length,0),pack.maps.reduce((sum,map)=>sum+map.connections.length,0)];
const fields=pack=>({
  format:pack.format,metadata:pack.metadata,field_counts:pack.field_counts,
  maps:pack.maps.map(({name,min_size,max_size,options,zones,connections})=>({name,min_size,max_size,options,zones,connections}))
});

test('format schemas are synchronized with upstream column definitions',()=>{
  assert.equal(SCHEMA.formats.sod.columns.ACTIVE_COLS,85);
  assert.equal(SCHEMA.formats.hota17.columns.TOTAL,138);
  assert.equal(SCHEMA.formats.hota18.columns.TOTAL,140);
  assert.equal(SCHEMA.zoneOptionFields.length,18);
  assert.equal(SCHEMA.formats.hota18.towns.length,12);
});
test('TSV preserves quoted tabs, newlines, quotes and CRLF rows',()=>{
  const rows=[['Map','Name','description'],['map 1','A\tB','C\nD and "quote"'],['2','','']];
  assert.deepEqual(readTSV(writeTSV(rows)),rows);
  assert.throws(()=>readTSV('x\t"unfinished'),/Unclosed quoted cell/);
});
test('UTF-8 with BOM and Windows-1251 encoding round-trip',()=>{
  const text='Шаблон "Карта"';
  const bom=encodeText(text,'utf-8-sig');assert.deepEqual(decodeBytes(bom),{text,encoding:'utf-8-sig'});
  const cp=encodeText(text,'cp1251');assert.deepEqual(decodeBytes(cp),{text,encoding:'cp1251'});
  const warnings=[];assert.equal(new TextDecoder().decode(encodeText('🙂','cp1251',warnings)),'?');
  assert.equal(warnings.length,1);
});
for(const [name,format,maps,zones,connections] of FIXTURES){
  test(`${name}: parse/count/no-op save remains byte-identical`,()=>{
    const raw=fixture(name),p=parseBytes(raw,{filename:name});
    assert.equal(p.format,format);assert.deepEqual(counts(p),[maps,zones,connections]);
    assert.deepEqual(serializePack(p).bytes,raw);
    assert.deepEqual(counts(parseBytes(serializePack(p).bytes)),[maps,zones,connections]);
  });
  test(`${name}: modified save retains every field, zone and connection`,()=>{
    const p=parseBytes(fixture(name),{filename:name});
    p.maps[0].zones[0].base_size='117';p.dirty=true;
    const result=serializePack(p);const q=parseBytes(result.bytes);
    assert.equal(q.maps[0].zones[0].base_size,'117');
    assert.deepEqual(fields(q),fields(p));
  });
  for(const target of ['sod','hota17','hota18']){
    test(`${name}: conversion to ${target} retains map/zone/connection topology`,()=>{
      const p=parseBytes(fixture(name),{filename:name});
      const c=convertPack(p,target),out=parseBytes(serializePack(c).bytes);
      assert.equal(c.format,target);assert.equal(out.format,target);
      assert.deepEqual(counts(out),[maps,zones,connections]);
      assert.deepEqual(p.maps.map(m=>m.name),out.maps.map(m=>m.name));
      assert.deepEqual(p.maps.map(m=>m.connections.map(c=>[c.zone1,c.zone2])),out.maps.map(m=>m.connections.map(c=>[c.zone1,c.zone2])));
      assert.equal(out.maps[0].zones[0].id,p.maps[0].zones[0].id);
      if(target==='hota18')assert.equal(out.field_counts.town,'12');
      if(target==='hota17')assert.equal(out.field_counts.town,'11');
    });
  }
}
test('Duel truncation is reported without inventing connection endpoints',()=>{
  const p=parseBytes(fixture('Duel.h3t'));assert.equal(p.warnings.length,420);
  assert.equal(p.maps[0].connections[0].zone1,'');assert.equal(p.maps[0].connections[0].value,'+');
  assert.equal(validatePack(p).filter(x=>x.text.includes('dangling')).length,420);
});
test('new blank template can be built and exported in all 3 formats',()=>{
  for(const format of ['sod','hota17','hota18']){
    const p=freshPack(format),z1=freshZone(format,'1'),z2=freshZone(format,'2');
    p.maps.push({name:'New Map',min_size:'16',max_size:'98',options:{},zones:[z1,z2],connections:[freshConnection(format,'1','2')],layout:{}});
    const out=parseBytes(serializePack(p).bytes);
    assert.deepEqual(counts(out),[1,2,1]);assert.equal(out.maps[0].connections[0].value,'3000');
    assert.equal(out.format,format);
  }
});
test('SoD to HotA follows upstream defaults for optional fields and strength',()=>{
  const p=parseBytes(fixture('tesseract.txt'));
  p.maps[0].zones[0].monster_strength='average';
  const out=convertPack(p,'hota17',{packName:'Named'});
  assert.equal(out.metadata.name,'Named');
  assert.equal(out.maps[0].zones[0].monster_strength,'avg');
  assert.equal(out.maps[0].zones[0].zone_options.monsters_join_only_for_money,'x');
  assert.deepEqual(out.maps[0].connections[0].road,SCHEMA.sodToHotaDefaults.connection.road);
  assert.equal(out.maps[0].options.spell_research,'x');
});
test('HotA 1.8 downgrade reports Bulwark loss and removes its faction columns',()=>{
  const sod=parseBytes(fixture('tesseract.txt'));
  const p=convertPack(sod,'hota18');p.maps[0].zones[0].town_types.Bulwark='x';
  p.maps[0].zones[0].monster_factions.Bulwark='x';
  const lower=convertPack(p,'hota17');
  assert.match(lower.warnings.join(' '),/Bulwark/);
  assert.equal(lower.maps[0].zones[0].town_types.Bulwark,undefined);
});
test('HotA to SoD warns about deleted fields without altering input',()=>{
  const p=parseBytes(fixture('Jebus Outcast.h3t'));
  const oldName=p.metadata.name,oldOptions=p.maps[0].zones[0].zone_options;
  const converted=convertPack(p,'sod');
  assert.ok(converted.warnings.some(w=>w.includes('Conversion loss')));
  assert.equal(converted.metadata,null);assert.equal(p.metadata.name,oldName);
  assert.deepEqual(p.maps[0].zones[0].zone_options,oldOptions);
});
test('renumber preserves references, hints and layout positions',()=>{
  const p=convertPack(parseBytes(fixture('tesseract.txt')),'hota17'),m=p.maps[0];
  m.zones[0].zone_options.town_hint='s2_p 1st3';
  m.layout={'1':{x:10,y:20},'2':{x:200,y:40},'3':{x:400,y:50}};
  const oldEdges=m.connections.map(c=>[c.zone1,c.zone2]);
  const map=renumberMap(m,{sort:'players'});
  assert.equal(new Set(m.zones.map(z=>z.id)).size,m.zones.length);
  assert.deepEqual(m.connections.map(c=>[c.zone1,c.zone2]),oldEdges.map(([a,b])=>[map[a]??a,map[b]??b]));
  assert.equal(m.zones.find(z=>z.zone_options.town_hint)?.zone_options.town_hint,`s${map['2']}_p 1st${map['3']}`);
  assert.deepEqual(m.layout[map['1']],{x:10,y:20});
});
test('hint remapping leaves unrelated identifiers untouched',()=>{
  assert.equal(remapHintRefs('s1_p dt12_0 pd2_p',{'1':'9','12':'3','2':'7'}),'s9_p dt3_0 pd7_p');
  assert.equal(remapHintRefs('s1_p malformed!',{'1':'9'}),'s1_p malformed!');
});
test('validation detects duplicate IDs and dangling references',()=>{
  const p=convertPack(parseBytes(fixture('tesseract.txt')),'hota17');
  p.maps[0].zones[1].id=p.maps[0].zones[0].id;p.maps[0].connections.push(freshConnection('hota17','500','501'));
  const issues=validatePack(p);assert.ok(issues.some(x=>x.level==='error'&&x.text.includes('duplicate')));
  assert.ok(issues.some(x=>x.text.includes('dangling')));
});
test('automatic layout produces non-overlapping positions',()=>{
  const p=parseBytes(fixture('tesseract.txt')),m=p.maps[0],positions=autoLayout(m);
  assert.equal(Object.keys(positions).length,m.zones.length);
  for(const [i,a] of Object.values(positions).entries())for(const b of Object.values(positions).slice(i+1))
    assert.ok(Math.abs(a.x-b.x)>CARD_W||Math.abs(a.y-b.y)>CARD_H);
  m.layout=positions;resizeLayout(m,1.2);
  assert.equal(Object.keys(m.layout).length,m.zones.length);
});
test('HotA image coordinates retain optional mirror coordinates',()=>{
  const p=convertPack(parseBytes(fixture('tesseract.txt')),'hota17'),m=p.maps[0];
  m.layout=autoLayout(m);m.zones[0].zone_options.image_settings='10 20 30 40';
  saveImagePositions(m);
  assert.deepEqual(m.zones[0].zone_options.image_settings.split(' ').slice(2),['30','40']);
  assert.ok(m.zones.every(z=>/^[-\d]+ [-\d]+/.test(z.zone_options.image_settings)));
});
test('malformed input raises readable format error',()=>{
  assert.throws(()=>parseText('invalid\tfile\r\ncolumn\r\nheader\r\nmore'),/Unknown template format/);
  assert.throws(()=>parseText('x'),/three header rows/);
});
