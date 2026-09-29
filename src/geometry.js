/** Connection geometry. Parallel source rows remain separate, selectable SVG paths. */
export const DEFAULT_CARD_WIDTH = 228;
export const DEFAULT_CARD_HEIGHT = 220;
const canonicalPair = (a,b) => (a.localeCompare(b,undefined,{numeric:true})<=0 ? [a,b] : [b,a]);
const point = (p,w,h) => ({x:p.x+w/2,y:p.y+h/2});
const near = n => Math.round(n*100)/100;

/** Bundle rows by the unordered zone pair, without merging their original fields. */
export function connectionBundles(connections){
  const result = new Map();
  connections.forEach((connection,index)=>{
    const a=String(connection.zone1??'').trim(),b=String(connection.zone2??'').trim();
    if(!a||!b)return;
    const key=JSON.stringify(canonicalPair(a,b));
    if(!result.has(key))result.set(key,[]);
    result.get(key).push(index);
  });
  return result;
}

function cardExit(shift,direction,halfW,halfH){
  // Ray exits a rectangle from an offset inside it. The two parallel endpoints
  // are independently clipped to their own cards, not the shared centerline.
  let distance=Infinity;
  for(const [offset,unit,half] of [[shift.x,direction.x,halfW],[shift.y,direction.y,halfH]]){
    if(Math.abs(unit)<1e-9)continue;
    const t=((unit>0?half:-half)-offset)/unit;
    if(t>=0)distance=Math.min(distance,t);
  }
  return Number.isFinite(distance)?distance:0;
}

/**
 * Return one distinct parallel lane per source connection row. In particular,
 * two edges are positioned at -gap/2 and +gap/2, never one on the centreline.
 */
export function parallelGeometry(a,b,{lane=0,total=1,width=DEFAULT_CARD_WIDTH,height=DEFAULT_CARD_HEIGHT}={}){
  const source=point(a,width,height),target=point(b,width,height);
  const dx=target.x-source.x,dy=target.y-source.y,distance=Math.hypot(dx,dy);
  if(distance<1){
    const radius=width/2+32+lane*28;
    const sx=source.x+width/2-14,sy=source.y+6;
    const ex=source.x+width/2-14,ey=source.y+30;
    return {d:`M${near(sx)} ${near(sy)} C${near(sx+radius)} ${near(sy-radius)} ${near(ex+radius)} ${near(ey-radius)} ${near(ex)} ${near(ey)}`,
      x:near(sx+radius*.75),y:near(sy-radius*.72),offset:radius,kind:'loop'};
  }
  const unit={x:dx/distance,y:dy/distance},normal={x:-unit.y,y:unit.x};
  const offsetLimit=Math.min(
    Math.abs(normal.x)>1e-6?(width/2-21)/Math.abs(normal.x):Infinity,
    Math.abs(normal.y)>1e-6?(height/2-21)/Math.abs(normal.y):Infinity,
    112
  );
  const gap=total<2?0:Math.min(48,2*offsetLimit/(total-1));
  const offset=(lane-(total-1)/2)*gap;
  const shift={x:normal.x*offset,y:normal.y*offset};
  const startT=cardExit(shift,unit,width/2,height/2);
  const endT=cardExit(shift,{x:-unit.x,y:-unit.y},width/2,height/2);
  const start={x:source.x+shift.x+unit.x*startT,y:source.y+shift.y+unit.y*startT};
  const end={x:target.x+shift.x-unit.x*endT,y:target.y+shift.y-unit.y*endT};
  // The bundle-level placement pass later resolves label bounding-box collisions.
  const fraction=.5;
  const x=start.x+(end.x-start.x)*fraction,y=start.y+(end.y-start.y)*fraction;
  return {d:`M${near(start.x)} ${near(start.y)} L${near(end.x)} ${near(end.y)}`,
    x:near(x),y:near(y),offset:near(offset),kind:'parallel',start,end,gap};
}

/** Indexed by source row, preserving individual guard values, road types and clicks. */
export function connectionGeometry(connections,layout,options={}){
  const result=Array(connections.length).fill(null);
  for(const indexes of connectionBundles(connections).values()){
    const first=connections[indexes[0]];
    const [left,right]=canonicalPair(String(first.zone1).trim(),String(first.zone2).trim());
    if(!layout[left]||!layout[right])continue;
    indexes.forEach((index,lane)=>{
      result[index]={...parallelGeometry(layout[left],layout[right],{...options,lane,total:indexes.length}),
        lane,total:indexes.length,sourceIndex:index};
    });
    // Place each guard value on its own lane. Alternating along long bundles
    // is useful when labels have a wide bounding box or the line is diagonal.
    const labels=options.labelWidths??[];
    const placed=[];
    for(const index of indexes){
      const item=result[index];
      if(item.kind!=='parallel'||labels[index]===0)continue;
      const labelW=Math.max(44,Number(labels[index])||58),labelH=36;
      const candidates=[.5,.36,.64,.26,.74,.19,.81];
      let chosen=null,best=Infinity;
      for(const fraction of candidates){
        const x=item.start.x+(item.end.x-item.start.x)*fraction;
        const y=item.start.y+(item.end.y-item.start.y)*fraction;
        const box={x:x-labelW/2,y:y-labelH/2,w:labelW,h:labelH};
        const overlap=placed.reduce((area,other)=>{const dx=Math.max(0,Math.min(box.x+box.w,other.x+other.w)-Math.max(box.x,other.x));
          const dy=Math.max(0,Math.min(box.y+box.h,other.y+other.h)-Math.max(box.y,other.y));return area+dx*dy;},0);
        const score=overlap*500+Math.abs(fraction-.5)*25;
        if(score<best){best=score;chosen={x,y,box};}
        if(overlap===0&&fraction===.5)break;
      }
      if(chosen){item.x=near(chosen.x);item.y=near(chosen.y);placed.push(chosen.box);}
    }
  }
  return result;
}
