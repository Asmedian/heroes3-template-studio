import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseBytes} from '../src/core.js';
import {autoLayout,edgeCrossings,CARD_W,CARD_H} from '../src/layout.js';
import {connectionGeometry,connectionBundles} from '../src/geometry.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../templates/catalog.json',import.meta.url)));
test('all 59 supplied templates render collision-free and keep all multi-edge rows distinct',()=>{
 let maps=0,zones=0,connections=0,multiBundles=0,maxParallel=0,crossings=0;
 for(const item of catalog.templates){
  const path=new URL('../templates/'+item.file,import.meta.url);
  const pack=parseBytes(new Uint8Array(fs.readFileSync(path)));
  for(const map of pack.maps){
   maps++;zones+=map.zones.length;connections+=map.connections.length;
   if(!map.zones.length)continue;
   const original=JSON.stringify(map),layout=autoLayout(map,{preferStored:false});
   assert.equal(JSON.stringify(map),original,`Layout must not alter original data: ${map.name}`);
   assert.equal(Object.keys(layout).length,map.zones.length);
   const ids=Object.keys(layout);
   for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    const a=layout[ids[i]],b=layout[ids[j]];
    assert.ok(Math.abs(a.x-b.x)>=CARD_W||Math.abs(a.y-b.y)>=CARD_H,`Overlapping zones ${ids[i]}/${ids[j]} in ${map.name}`);
   }
   const render=connectionGeometry(map.connections,layout,{width:CARD_W,height:CARD_H});
   assert.equal(render.length,map.connections.length);
   for(const indexes of connectionBundles(map.connections).values())if(indexes.length>1){
    const paths=indexes.map(i=>render[i]).filter(Boolean);
    multiBundles+=paths.length?1:0;maxParallel=Math.max(maxParallel,paths.length);
    assert.equal(new Set(paths.map(path=>path.d)).size,paths.length,`Collapsed parallel connections: ${map.name}`);
   }
   const allIds=new Set(ids);
   const graphEdges=[...new Set(map.connections.filter(c=>c.zone1!==c.zone2&&allIds.has(c.zone1)&&allIds.has(c.zone2))
     .map(c=>JSON.stringify([c.zone1,c.zone2].sort())))].map(s=>JSON.parse(s));
   crossings+=edgeCrossings(graphEdges,layout);
  }
 }
 assert.equal(maps,238);assert.equal(zones,2996);assert.equal(connections,4285);
 assert.ok(multiBundles>=350&&maxParallel>=4);
 assert.ok(crossings<=2500,`Unexpected rise in total graph crossings: ${crossings}`);
});
