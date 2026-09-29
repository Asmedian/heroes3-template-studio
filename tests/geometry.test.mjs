import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionGeometry,connectionBundles,parallelGeometry} from '../src/geometry.js';

const link=(a,b,value)=>({zone1:String(a),zone2:String(b),value:String(value)});
const rect={1:{x:100,y:100},2:{x:640,y:400}};
const rectangleOverlap=(a,b,w=62,h=36)=>Math.max(0,w-Math.abs(a.x-b.x))*Math.max(0,h-Math.abs(a.y-b.y));

test('each source connection row has a separate visible lane, label and selection index',()=>{
 const rows=[link(1,2,45000),link(2,1,90000),link(1,2,0),link(2,1,60000)];
 const rendered=connectionGeometry(rows,rect,{labelWidths:[76,76,0,76]});
 assert.equal(connectionBundles(rows).size,1);
 assert.equal(rendered.length,4);
 assert.deepEqual(rendered.map(x=>x.sourceIndex),[0,1,2,3]);
 assert.equal(new Set(rendered.map(x=>x.d)).size,4);
 assert.equal(new Set(rendered.map(x=>x.offset)).size,4);
 assert.ok(rendered.every(x=>x.start&&x.end&&x.start.x>100&&x.end.x<868));
 for(let i=0;i<rendered.length;i++)for(let j=i+1;j<rendered.length;j++){
  if(i===2||j===2)continue;
  assert.equal(rectangleOverlap(rendered[i],rendered[j],76,36),0,`Guard labels overlap for rows ${i} and ${j}.`);
 }
});

test('short two-lane diagonal bundles stagger labels when midpoint boxes overlap',()=>{
 const points={1:{x:10,y:10},2:{x:340,y:340}};
 const g=connectionGeometry([link(1,2,8500),link(1,2,9000)],points,{labelWidths:[65,65]});
 assert.equal(g[0].total,2);assert.equal(g[1].total,2);
 assert.equal(rectangleOverlap(g[0],g[1],65,36),0);
});

test('reverse input order does not reverse the shared axis or collapse links',()=>{
 const p={1:{x:120,y:110},2:{x:670,y:115}};
 const rows=[link(2,1,4500),link(1,2,8500),link(2,1,15000)];
 const paths=connectionGeometry(rows,p,{labelWidths:[60,60,60]});
 assert.equal(new Set(paths.map(x=>x.d)).size,3);
 assert.deepEqual(paths.map(x=>x.lane),[0,1,2]);
 assert.ok(paths.every(x=>x.x>120&&x.x<900));
});

test('self-connections have distinct curves and invalid endpoints remain unrendered',()=>{
 const g=connectionGeometry([link(1,1,42),link(1,1,55),link(1,888,9)],{1:{x:20,y:40}});
 assert.equal(g[0].kind,'loop');assert.equal(g[1].kind,'loop');
 assert.notEqual(g[0].d,g[1].d);
 assert.equal(g[2],null);
});

test('a single connection exits the two rectangular cards instead of crossing through them',()=>{
 const g=parallelGeometry({x:0,y:0},{x:550,y:0});
 assert.equal(g.kind,'parallel');
 assert.ok(Math.abs(g.start.x-228)<.01);
 assert.ok(Math.abs(g.end.x-550)<.01);
});
