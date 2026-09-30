import {motifLayout} from './layout-motifs.js';
/** Pure canvas layout and geometry. Positions are top-left browser-space points. */
export const CARD_W=228,CARD_H=220;
const isStart=z=>[z.human_start,z.computer_start].some(v=>String(v).trim().toLowerCase()==='x');
const isCenter=z=>['treasure','junction'].some(k=>String(z[k]).trim().toLowerCase()==='x');
const hash=s=>[...s].reduce((n,c)=>((n*31+c.charCodeAt(0))>>>0),7);
// A topology-aware arrangement is used only when the graph proves that it has a
// recognizable symmetric structure. Other maps retain the general-purpose layout.
const zoneIdOrder=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b)?+a-+b:String(a).localeCompare(String(b));
function topologyGraph(map){
 const ids=[...new Set(map.zones.map(z=>String(z.id)))];
 if(ids.length!==map.zones.length)return null;
 const adjacency=new Map(ids.map(id=>[id,new Set()]));
 for(const c of map.connections){const a=String(c.zone1).trim(),b=String(c.zone2).trim();
  if(adjacency.has(a)&&adjacency.has(b)&&a!==b){adjacency.get(a).add(b);adjacency.get(b).add(a);}}
 const edges=[];for(const a of ids)for(const b of adjacency.get(a))if(zoneIdOrder(a,b)<0)edges.push([a,b]);
 return {ids,adjacency,edges};
}
export function edgeCrossings(edges,points){
 let count=0;
 const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  const [a,b]=edges[i],[c,d]=edges[j];if(new Set([a,b,c,d]).size!==4)continue;
  const p=points[a],q=points[b],r=points[c],s=points[d];if(!p||!q||!r||!s)continue;
  const u=orient(p,q,r),v=orient(p,q,s),w=orient(r,s,p),x=orient(r,s,q);
  if(u*v< -1e-7&&w*x< -1e-7)count++;
 }
 return count;
}
function normalizeTopology(points,pad=78){
 const ids=Object.keys(points),res={};
 let factor=0;
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
  const a=points[ids[i]],b=points[ids[j]];
  const separation=Math.max(Math.abs(a.x-b.x)/(CARD_W+pad),Math.abs(a.y-b.y)/(CARD_H+pad));
  if(separation<1e-5)return null;
  factor=Math.max(factor,1/separation);
 }
 if(!Number.isFinite(factor)||factor>25000)return null;
 factor=Math.max(360,factor);
 const xmin=Math.min(...ids.map(id=>points[id].x)),ymin=Math.min(...ids.map(id=>points[id].y));
 for(const id of ids)res[id]={x:Math.round((points[id].x-xmin)*factor+120),y:Math.round((points[id].y-ymin)*factor+120)};
 return res;
}
function hypercubeLayout(map,graph){
 const n=graph.ids.length,k=Math.round(Math.log2(n));
 if(k<3||k>4||2**k!==n||graph.edges.length!==n*k/2)return null;
 if(graph.ids.some(id=>graph.adjacency.get(id).size!==k))return null;
 const startIds=map.zones.filter(isStart).map(z=>String(z.id));
 const root=(startIds.length?startIds:graph.ids).sort(zoneIdOrder)[0];
 const masks=new Map([[root,0]]),dist=new Map([[root,0]]);
 const neighbors=[...graph.adjacency.get(root)].sort(zoneIdOrder);
 neighbors.forEach((id,i)=>{masks.set(id,1<<i);dist.set(id,1);});
 for(let depth=2;depth<=k;depth++){
  const next=graph.ids.filter(id=>!dist.has(id)&&[...graph.adjacency.get(id)].some(other=>dist.get(other)===depth-1));
  for(const id of next){let mask=0;for(const neighbor of graph.adjacency.get(id))if(dist.get(neighbor)===depth-1)mask|=masks.get(neighbor);
   if(mask.toString(2).replace(/0/g,'').length!==depth)return null;
   masks.set(id,mask);dist.set(id,depth);
  }
 }
 if(masks.size!==n||new Set(masks.values()).size!==n)return null;
 for(const [a,b] of graph.edges){const xor=masks.get(a)^masks.get(b);if(!xor||(xor&(xor-1)))return null;}
 const positions={};
 if(k===4){
  const gray=[0,1,3,2,6,7,5,4],cycle=new Map(gray.map((v,i)=>[v,i]));
  for(const [id,mask] of masks){const inside=(mask&8)!==0,angle=-Math.PI/2+(cycle.get(mask&7)*Math.PI/4)-(inside?Math.PI/4:0);
   const radius=inside?1.85:5.0;
   positions[id]={x:radius*Math.cos(angle),y:radius*Math.sin(angle)};
  }
 }else{
  const gray=[0,1,3,2,6,7,5,4],cycle=new Map(gray.map((v,i)=>[v,i]));
  for(const [id,mask] of masks){const angle=-Math.PI/2+cycle.get(mask)*Math.PI/4;
   positions[id]={x:4.5*Math.cos(angle),y:4.5*Math.sin(angle)};
  }
 }
 return compactLayout(normalizeTopology(positions,72),{gap:68});
}
function symmetricFourStarts(map,graph){
 if(graph.ids.length<8||graph.ids.length>42)return null;
 const anchors=map.zones.filter(z=>isStart(z)&&graph.adjacency.get(String(z.id))?.size===1).map(z=>String(z.id)).sort(zoneIdOrder);
 if(anchors.length!==4||graph.ids.some(id=>graph.adjacency.get(id).size===0))return null;
 // Only use the perimeter-anchored model when all leaves are starting zones.
 if(graph.ids.filter(id=>graph.adjacency.get(id).size===1).length!==4)return null;
 const anchorRoot=anchors[0],others=anchors.slice(1);
 const orders=[[others[0],others[1],others[2]],[others[0],others[2],others[1]],
  [others[1],others[0],others[2]],[others[1],others[2],others[0]],
  [others[2],others[0],others[1]],[others[2],others[1],others[0]]];
 const base=[[ -3,3 ],[ -3,-3 ],[3,-3],[3,3]];
 const starts=new Set(anchors);
 let winner=null,best=Infinity;
 for(const order of orders){const boundary=[anchorRoot,...order],points={};
  boundary.forEach((id,i)=>{points[id]={x:base[i][0],y:base[i][1]};});
  for(const id of graph.ids)if(!starts.has(id))points[id]={x:0,y:0};
  // Harmonic (barycentric) embedding distributes internal vertices according to
  // topology, not numeric zone IDs. The four extremal starts remain symmetrical.
  for(let step=0;step<520;step++){
   let change=0;
   for(const id of graph.ids){if(starts.has(id))continue;
    const adjacent=[...graph.adjacency.get(id)],x=adjacent.reduce((s,k)=>s+points[k].x,0)/adjacent.length,y=adjacent.reduce((s,k)=>s+points[k].y,0)/adjacent.length;
    const dx=x-points[id].x,dy=y-points[id].y;
    points[id].x+=dx*.76;points[id].y+=dy*.76;change=Math.max(change,Math.abs(dx),Math.abs(dy));
   }
   if(change<1e-8)break;
  }
  const positioned=normalizeTopology(points,82);if(!positioned)continue;
  const crossing=edgeCrossings(graph.edges,positioned);
  if(crossing===0&&order===orders[0])return positioned;
  const edgeDistances=graph.edges.map(([a,b])=>Math.hypot(positioned[a].x-positioned[b].x,positioned[a].y-positioned[b].y));
  const avg=edgeDistances.reduce((a,b)=>a+b,0)/Math.max(1,edgeDistances.length);
  const variance=edgeDistances.reduce((a,b)=>a+(b-avg)**2,0)/Math.max(1,edgeDistances.length);
  const horizontal=Math.max(...Object.values(positioned).map(p=>p.x))-Math.min(...Object.values(positioned).map(p=>p.x));
  const vertical=Math.max(...Object.values(positioned).map(p=>p.y))-Math.min(...Object.values(positioned).map(p=>p.y));
  const score=crossing*1e8+Math.sqrt(variance)/avg*1000+Math.max(horizontal,vertical)/Math.max(1,Math.min(horizontal,vertical))*16;
  if(score<best){best=score;winner=positioned;}
 }
 // On non-planar graphs, do not claim the heuristic produces a crossing-free view.
 return winner&&edgeCrossings(graph.edges,winner)===0?winner:null;
}
export function topologyLayout(map){
 if(!map?.zones?.length)return null;
 const graph=topologyGraph(map);if(!graph)return null;
 const proposed=hypercubeLayout(map,graph)||symmetricFourStarts(map,graph)||motifLayout(map,graph);
 return proposed?compactLayout(proposed,{gap:68}):null;
}

/** Uniformly compact a finished layout until the nearest pair reaches a small,
 * readable card gap. Uniform scaling preserves symmetry and edge crossings. */
export function compactLayout(positions,{gap=68,minScale=.38}={}){
 const ids=Object.keys(positions??{});if(ids.length<2)return structuredClone(positions??{});
 const p=structuredClone(positions),cx=ids.reduce((n,id)=>n+p[id].x,0)/ids.length,cy=ids.reduce((n,id)=>n+p[id].y,0)/ids.length;
 let required=Math.max(0,minScale);
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
  const a=p[ids[i]],b=p[ids[j]],dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
  const sx=dx>1e-7?(CARD_W+gap)/dx:Infinity,sy=dy>1e-7?(CARD_H+gap)/dy:Infinity;
  required=Math.max(required,Math.min(sx,sy));
 }
 const scale=Math.min(1,required);
 if(scale<.995)for(const id of ids){p[id].x=cx+(p[id].x-cx)*scale;p[id].y=cy+(p[id].y-cy)*scale;}
 return separate(p,gap);
}

/** Small deterministic crossing-reduction pass for layouts without a strong motif.
 * Swapping coordinates preserves the no-overlap guarantee and does not change
 * start-zone roles or any template data. Capped for large templates.
 */
export function refineCrossings(map,positions,{passes=2}={}){
 const graph=topologyGraph(map),n=map.zones.length;
 if(!graph||n<5||n>25||graph.edges.length<3||graph.edges.length>52)return positions;
 const ids=graph.ids.slice().sort(zoneIdOrder),starts=new Set(map.zones.filter(isStart).map(z=>String(z.id)));
 let crossing=edgeCrossings(graph.edges,positions);
 if(crossing===0)return positions;
 const p=structuredClone(positions);
 const length=()=>graph.edges.reduce((sum,[a,b])=>sum+(p[a].x-p[b].x)**2+(p[a].y-p[b].y)**2,0);
 let cost=length();
 for(let pass=0;pass<passes;pass++){
  let changed=false;
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
   const a=ids[i],b=ids[j];if(starts.has(a)!==starts.has(b))continue;
   [p[a],p[b]]=[p[b],p[a]];
   const next=edgeCrossings(graph.edges,p);
   if(next>crossing){[p[a],p[b]]=[p[b],p[a]];continue;}
   const nextCost=next===crossing?length():0;
   if(next<crossing||(next===crossing&&nextCost<cost-1e-6)){
    crossing=next;cost=nextCost||length();changed=true;
   }else[p[a],p[b]]=[p[b],p[a]];
   if(crossing===0)break;
  }
  if(!changed||crossing===0)break;
 }
 return p;
}

export function autoLayout(map,{preferStored=true}={}){
 const zones=map.zones,n=zones.length;if(!n)return{};
 const positions={};
 let stored=[];
 if(preferStored)for(const z of zones){
  const fields=String(z.zone_options?.image_settings??'').trim().split(/\s+/).map(Number);
  if(fields.length>=2&&fields.slice(0,2).every(Number.isFinite))stored.push({id:z.id,x:fields[0],y:fields[1]});
 }
 if(stored.length>=n/2){
  const xs=stored.map(o=>o.x),ys=stored.map(o=>o.y);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const spacing=Math.max(1400,Math.sqrt(n)*330);
  const factor=spacing/Math.max(xmax-xmin,ymax-ymin,1);
  for(const p of stored)positions[p.id]={x:(p.x-xmin)*factor+130,y:(p.y-ymin)*factor+130};
  for(const z of zones)if(!positions[z.id]){
   const neighbor=[];for(const c of map.connections){let id=c.zone1===z.id?c.zone2:c.zone2===z.id?c.zone1:null;if(id&&positions[id])neighbor.push(positions[id]);}
   const mean=(p,key)=>p.reduce((a,v)=>a+v[key],0)/p.length;
   const points=neighbor.length?neighbor:Object.values(positions);
   positions[z.id]={x:mean(points,'x')+((hash(z.id)%5)-2)*44,y:mean(points,'y')+((hash(z.id)%7)-3)*34};
  }
  return compactLayout(separate(positions,82),{gap:68});
 }
 const topology=topologyLayout(map);
 if(topology)return topology;
 const outer=zones.filter(isStart),inner=zones.filter(z=>!isStart(z));
 const centerOrder=[...inner].sort((a,b)=>Number(isCenter(b))-Number(isCenter(a))||Number(a.id)-Number(b.id));
 let circleOuter=Math.max(670,(outer.length||n)*164),circleInner=Math.max(270,inner.length*95);
 outer.forEach((z,i)=>{const a=-Math.PI/2+i*Math.PI*2/outer.length;positions[z.id]={x:Math.cos(a)*circleOuter,y:Math.sin(a)*circleOuter};});
 centerOrder.forEach((z,i)=>{const a=(i*2.39996)+Math.PI/6, r=inner.length===1?0:195+Math.sqrt(i)*circleInner/Math.sqrt(Math.max(1,inner.length));positions[z.id]={x:Math.cos(a)*r,y:Math.sin(a)*r};});
 if(!outer.length){zones.forEach((z,i)=>{let a=(i/(n||1))*Math.PI*2, r=Math.max(510,n*63);positions[z.id]={x:Math.cos(a)*r,y:Math.sin(a)*r};});}
 const ids=new Set(zones.map(z=>z.id));const edges=map.connections.filter(c=>ids.has(c.zone1)&&ids.has(c.zone2)&&c.zone1!==c.zone2&& !['teleport','monolith'].includes(String(c.conn_type??'').toLowerCase()));
 for(let iter=0;iter<160;iter++){
  const delta=Object.fromEntries(zones.map(z=>[z.id,{x:0,y:0}]));
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
   const a=zones[i].id,b=zones[j].id,pa=positions[a],pb=positions[b],dx=pa.x-pb.x,dy=pa.y-pb.y;
   const distance=Math.max(28,Math.hypot(dx,dy)),f=Math.min(26,245000/distance**2);
   delta[a].x+=dx/distance*f;delta[a].y+=dy/distance*f;delta[b].x-=dx/distance*f;delta[b].y-=dy/distance*f;
  }
  for(const e of edges){let a=positions[e.zone1],b=positions[e.zone2],dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy));
    let ideal=isStart(zones.find(z=>z.id===e.zone1))&&isStart(zones.find(z=>z.id===e.zone2))?900:575;
    let f=Math.max(-11,Math.min(11,(d-ideal)*0.011));delta[e.zone1].x+=dx/d*f;delta[e.zone1].y+=dy/d*f;delta[e.zone2].x-=dx/d*f;delta[e.zone2].y-=dy/d*f;
  }
  let cool=Math.max(0.15,1-iter/160);
  for(const z of zones){const d=delta[z.id];positions[z.id].x+=Math.max(-24,Math.min(24,d.x))*cool;positions[z.id].y+=Math.max(-24,Math.min(24,d.y))*cool;}
 }
 return compactLayout(refineCrossings(map,separate(positions,155)),{gap:68});
}
export function separate(positions,pad=110){
 let p=structuredClone(positions);const ids=Object.keys(p);
 for(let iter=0;iter<180;iter++){
  let moved=false;
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
   const a=p[ids[i]],b=p[ids[j]],dx=a.x-b.x,dy=a.y-b.y;
   let ox=CARD_W+pad-Math.abs(dx),oy=CARD_H+pad-Math.abs(dy);
   if(ox>0&&oy>0){moved=true;const signX=dx===0?(i%2?-1:1):Math.sign(dx),signY=dy===0?(j%2?-1:1):Math.sign(dy);
    if(ox<oy){const v=ox*.52;a.x+=signX*v;b.x-=signX*v;}else{const v=oy*.52;a.y+=signY*v;b.y-=signY*v;}
   }
  }if(!moved)break;
 }
 const minX=Math.min(...ids.map(id=>p[id].x)),minY=Math.min(...ids.map(id=>p[id].y));
 for(const pt of Object.values(p)){pt.x=Math.round(pt.x-minX+110);pt.y=Math.round(pt.y-minY+110);}
 return p;
}
export function resizeLayout(map,factor){
 if(!Object.keys(map.layout??{}).length)map.layout=autoLayout(map);
 const points=Object.values(map.layout),cx=points.reduce((n,p)=>n+p.x,0)/points.length,cy=points.reduce((n,p)=>n+p.y,0)/points.length;
 for(const p of points){p.x=Math.round(cx+(p.x-cx)*factor);p.y=Math.round(cy+(p.y-cy)*factor);}
 map.layout=separate(map.layout,68);return map.layout;
}
export function saveImagePositions(map){
 const zones=map.zones.filter(z=>map.layout?.[z.id]);if(!zones.length)return;
 const centers=zones.map(z=>({z,x:map.layout[z.id].x+CARD_W/2,y:map.layout[z.id].y+CARD_H/2}));
 // Fit the canvas into the existing HotA coordinate frame when possible.
 const previous=centers.map(p=>{const a=String(p.z.zone_options?.image_settings??'').trim().split(/\s+/).map(Number);return a.length>=2&&a.slice(0,2).every(Number.isFinite)?{...p,ox:a[0],oy:a[1]}:null;}).filter(Boolean);
 let scale,offX,offY;
 if(previous.length>=2){
  const mean=(points,k)=>points.reduce((a,p)=>a+p[k],0)/points.length;
  const cx=mean(previous,'x'),cy=mean(previous,'y'),ox=mean(previous,'ox'),oy=mean(previous,'oy');
  const d=previous.reduce((a,p)=>a+(p.x-cx)**2+(p.y-cy)**2,0),dot=previous.reduce((a,p)=>a+(p.x-cx)*(p.ox-ox)+(p.y-cy)*(p.oy-oy),0);
  scale=d>1e-6?dot/d:1;scale=Math.min(2,Math.max(.02,scale));offX=ox-cx*scale;offY=oy-cy*scale;
 }else{
  const xs=centers.map(p=>p.x),ys=centers.map(p=>p.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  let min=Infinity;for(let i=0;i<centers.length;i++)for(let j=i+1;j<centers.length;j++)min=Math.min(min,Math.hypot(centers[i].x-centers[j].x,centers[i].y-centers[j].y));
  scale=min<Infinity&&min>0?70/min:1;offX=-cx*scale;offY=-cy*scale;
 }
 for(const p of centers){const existing=String(p.z.zone_options?.image_settings??'').trim().split(/\s+/);
   p.z.zone_options.image_settings=[String(Math.round(p.x*scale+offX)),String(Math.round(p.y*scale+offY)),...existing.slice(2)].join(' ');
 }
}
