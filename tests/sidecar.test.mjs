import test from 'node:test';
import assert from 'node:assert/strict';
import {createSidecar,readSidecar} from '../src/sidecar.js';
const pack={maps:[
  {name:'A',zones:[{id:'1'},{id:'2'}],layout:{'1':{x:10.14,y:-25.58},'2':{x:200,y:300}}},
  {name:'B',zones:[{id:'9'}],layout:{'9':{x:15,y:85}}},
]};
test('upstream-compatible sidecar exports all maps with rounded positions',()=>{
  assert.deepEqual(createSidecar(pack),{version:1,maps:{A:{zones:{'1':{x:10.1,y:-25.6},'2':{x:200,y:300}}},B:{zones:{'9':{x:15,y:85}}}}});
});
test('multi-map sidecar restores positions by map name and rejects unknown zones',()=>{
  const payload=createSidecar(pack);payload.maps.A.zones['99']={x:3,y:4};
  const result=readSidecar(payload,pack);
  assert.deepEqual(result.get(0),{'1':{x:10.1,y:-25.6},'2':{x:200,y:300}});
  assert.deepEqual(result.get(1),{'9':{x:15,y:85}});
});
test('legacy single-map layout files are accepted',()=>{
  const result=readSidecar({map:'B',mapIndex:1,positions:{'9':{x:1,y:2}}},pack);
  assert.deepEqual(result.get(1),{'9':{x:1,y:2}});
});
test('invalid sidecar and mismatched zones fail visibly',()=>{
  assert.throws(()=>readSidecar({version:1,maps:{Nonexistent:{zones:{'1':{x:0,y:0}}}}},pack),/No matching/);
  assert.throws(()=>readSidecar(null,pack),/Invalid layout/);
});
