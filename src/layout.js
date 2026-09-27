/** Pure canvas layout and geometry. Positions are top-left browser-space points. */
export const CARD_W=228,CARD_H=220;
const isStart=z=>[z.human_start,z.computer_start].some(v=>String(v).trim().toLowerCase()==='x');
const isCenter=z=>['treasure','junction'].some(k=>String(z[k]).trim().toLowerCase()==='x');
const hash=s=>[...s].reduce((n,c)=>((n*31+c.charCodeAt(0))>>>0),7);
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
  return separate(positions,155);
 }
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
 return separate(positions,155);
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
 map.layout=separate(map.layout,110);return map.layout;
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
