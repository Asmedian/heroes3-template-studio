import {SCHEMA,FORMATS,parseBytes,parseText,serializePack,convertPack,freshPack,freshZone,freshConnection,validatePack,renumberMap,remapHintRefsDetailed} from './core.js';
import {autoLayout,resizeLayout,saveImagePositions,CARD_W,CARD_H} from './layout.js';
import {createSidecar,readSidecar} from './sidecar.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const upper=s=>s==='sod'?'SoD':s==='hota17'?'HotA 1.7':'HotA 1.8';
const flag=s=>String(s??'').trim().toLowerCase()==='x';
const icon=(name,size=16)=>`<svg width="${size}" height="${size}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const store={pack:null,mapIndex:0,selected:{kind:'map',index:0},tab:'general',scale:1,tx:0,ty:0,
  viewport:{w:700,h:600},drag:null,connectMode:false,connectFrom:null,undo:[],redo:[],installPrompt:null,toastTimer:0,
  fileKey:'',loaded:false,initialLoad:true,loadToken:0};
const current=()=>store.pack?.maps[store.mapIndex];
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(store.toastTimer);store.toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function status(s){$('status-text').textContent=s;}
function modal(title,body,actions=[{label:'Закрыть'}]){
 $('modal-title').textContent=title;$('modal-content').innerHTML=body;
 const foot=$('modal-buttons');foot.innerHTML='';for(const entry of actions){
  const b=document.createElement('button');b.className=`btn ${entry.primary?'btn-primary':'btn-subtle'} ${entry.danger?'danger':''}`;b.textContent=entry.label;
  b.addEventListener('click',()=>{if(entry.handler?.()===false)return;$('modal').close();});foot.append(b);
 }$('modal').showModal();
}
$('modal-close').onclick=()=>$('modal').close();
function confirmAction(title,detail,callback){modal(title,`<p>${detail}</p>`,[{label:'Отмена'},{label:'Подтвердить',primary:true,handler:callback}]);}
function fileSignature(bytes,filename){let h=2166136261>>>0;for(let i=0;i<Math.min(bytes.length,32000);i++){h^=bytes[i];h=Math.imul(h,16777619)>>>0;}return `${filename}-${bytes.length}-${h}`;}
function capture(){return JSON.stringify({maps:store.pack.maps,metadata:store.pack.metadata,field_counts:store.pack.field_counts});}
function commit(label,fn){
 if(!store.pack)return;let before=capture();let previousSelection={...store.selected},oldTab=store.tab;
 try{fn();}catch(e){toast(e.message);return;}
 if(before===capture())return;
 store.undo.push({snapshot:before,selection:previousSelection,tab:oldTab,label});
 if(store.undo.length>(store.pack.maps.length>90?18:50))store.undo.shift();store.redo=[];
 store.pack.dirty=true;persistLayout();renderAll();status(label);
}
function restore(data){const snap=JSON.parse(data.snapshot);store.pack.maps=snap.maps;store.pack.metadata=snap.metadata;store.pack.field_counts=snap.field_counts;
 store.selected=data.selection;store.tab=data.tab;store.mapIndex=Math.min(store.mapIndex,store.pack.maps.length-1);
 store.pack.dirty=true;persistLayout();renderAll();}
function undo(){if(!store.undo.length)return;const change=store.undo.pop();store.redo.push({snapshot:capture(),selection:{...store.selected},tab:store.tab,label:change.label});restore(change);status('Отменено: '+change.label);}
function redo(){if(!store.redo.length)return;const change=store.redo.pop();store.undo.push({snapshot:capture(),selection:{...store.selected},tab:store.tab,label:change.label});restore(change);status('Повторено: '+change.label);}
function persistLayout(){const map=current();if(!map||!store.fileKey)return;
 try{localStorage.setItem('h3tc-layout-'+store.fileKey+'-'+store.mapIndex,JSON.stringify(map.layout));}catch{ /* Storage can be disabled or full. */ }
}
function restoreLayout(index){const map=store.pack.maps[index];if(!map)return;
 let restored={...map.layout};
 try{const json=localStorage.getItem('h3tc-layout-'+store.fileKey+'-'+index);
  if(json){const parsed=JSON.parse(json);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))restored={...restored,...parsed};}
 }catch{}
 const ids=new Set(map.zones.map(z=>z.id));
 restored=Object.fromEntries(Object.entries(restored).filter(([id,p])=>ids.has(id)&&Number.isFinite(p?.x)&&Number.isFinite(p?.y)));
 map.layout=Object.keys(restored).length===ids.size?restored:{...autoLayout(map),...restored};
}
async function openFile(file){
 if(!file)return;
 const token=++store.loadToken;
 try{const bytes=new Uint8Array(await file.arrayBuffer());const pack=parseBytes(bytes,{filename:file.name});if(token!==store.loadToken)return;setPack(pack,bytes);
  const total=pack.maps.reduce((s,m)=>s+m.zones.length,0);
  toast(`Открыт ${file.name} · ${pack.maps.length} карт · ${total} зон`);
 }catch(e){modal('Ошибка открытия',`<p>${esc(e?.message||e)}</p><p>Поддерживаются текстовые шаблоны SoD, HotA 1.7.x и HotA 1.8.x.</p>`);}
}
function setPack(pack,bytes=null){
 store.pack=pack;store.mapIndex=0;store.selected={kind:'map',index:0};store.tab='general';store.undo=[];store.redo=[];
 store.connectMode=false;store.connectFrom=null;store.fileKey=fileSignature(bytes??new TextEncoder().encode(pack.filename),pack.filename);
 restoreLayout(0);store.loaded=true;
 $('export-format').value=pack.format;
 renderAll();requestAnimationFrame(fitView);
 status(`Загружен: ${pack.filename} (${upper(pack.format)})`);
}
async function loadSample(name){const token=++store.loadToken;try{
 const url=new URL('../samples/'+encodeURIComponent(name),import.meta.url);
 const response=await fetch(url);if(!response.ok)throw new Error(`HTTP ${response.status}`);
 const bytes=new Uint8Array(await response.arrayBuffer());if(token!==store.loadToken)return;const pack=parseBytes(bytes,{filename:name});setPack(pack,bytes);
 }catch(e){if(token!==store.loadToken)return;if(store.initialLoad){setPack(freshPack('hota18'));commit('Создана первая карта',()=>store.pack.maps.push({name:'New Map',min_size:'36',max_size:'144',options:{},zones:[freshZone('hota18','1')],connections:[],layout:{}}));}else toast('Не удалось загрузить пример: '+e.message);}finally{store.initialLoad=false;}}
function selectMap(index){if(!store.pack?.maps[index])return;
 persistLayout();store.mapIndex=index;restoreLayout(index);store.selected={kind:'map',index};store.tab='general';store.connectMode=false;store.connectFrom=null;
 $('sidebar').classList.remove('open');renderAll();requestAnimationFrame(fitView);
}
function renderAll(){renderSidebar();renderToolbar();renderCanvas();renderInspector();renderStatus();}
function renderSidebar(){const pack=store.pack;
 $('package-name').textContent=pack?.metadata?.name||pack?.filename||'Новый пакет';
 $('current-format').textContent=pack?upper(pack.format):'—';$('map-count').textContent=pack?`${pack.maps.length} карт`:'0 карт';
 const filter=$('map-search').value.toLocaleLowerCase();
 $('map-list').innerHTML=pack?.maps.map((m,i)=>m.name.toLocaleLowerCase().includes(filter)?`<button type="button" class="map-item ${i===store.mapIndex?'active':''}" data-map-index="${i}" title="${esc(m.name)}"><span class="map-number">${i+1}</span><span class="map-text"><strong>${esc(m.name||'Без названия')}</strong><small>${m.zones.length} зон · ${m.connections.length} связей</small></span></button>`:'').join('')||'<div class="field-note" style="padding:10px">Карты не найдены.</div>';
}
$('map-list').addEventListener('click',e=>{const btn=e.target.closest('[data-map-index]');if(btn)selectMap(+btn.dataset.mapIndex);});
$('map-search').addEventListener('input',renderSidebar);
function renderToolbar(){const map=current();$('toolbar-format').textContent=store.pack?upper(store.pack.format):'—';
 $('map-title').textContent=map?.name||'Нет выбранной карты';$('map-stats').textContent=map?`${map.zones.length} зон · ${map.connections.length} связей`:'';
 for(const id of ['add-zone-btn','add-conn-btn','undo-btn','redo-btn','save-btn','convert-btn'])$(id).disabled=!store.pack||(id==='undo-btn'&&!store.undo.length)||(id==='redo-btn'&&!store.redo.length)||(id==='add-zone-btn'&&!map)||(id==='add-conn-btn'&&!map);
 $('add-conn-btn').style.background=store.connectMode?'var(--accent-bg)':'';
}
function renderStatus(){const map=current();$('status-zones').textContent=`${map?.zones.length||0} зон`;$('status-conns').textContent=`${map?.connections.length||0} связей`;
 $('dirty-indicator').textContent=store.pack?.dirty?'● Изменено':'✓ Сохранено';$('dirty-indicator').style.color=store.pack?.dirty?'var(--treasure)':'var(--soft)';
 $('zoom-value').textContent=Math.round(store.scale*100)+'%';
}
function bounds(map=current()){const p=Object.values(map?.layout??{});if(!p.length)return{x:0,y:0,w:620,h:430};
 const minX=Math.min(...p.map(v=>v.x)),minY=Math.min(...p.map(v=>v.y)),maxX=Math.max(...p.map(v=>v.x+CARD_W)),maxY=Math.max(...p.map(v=>v.y+CARD_H));
 return{x:minX,y:minY,w:Math.max(1,maxX-minX),h:Math.max(1,maxY-minY)};
}
function fitView(){const m=current();if(!m||!m.zones.length)return;
 const box=$('canvas').getBoundingClientRect();store.viewport={w:box.width||700,h:box.height||500};let b=bounds(m);
 store.scale=Math.max(.1,Math.min(2.3,Math.min((store.viewport.w-90)/b.w,(store.viewport.h-130)/b.h)));
 store.tx=(store.viewport.w-b.w*store.scale)/2-b.x*store.scale;
 store.ty=(store.viewport.h-b.h*store.scale)/2-b.y*store.scale;
 transformCanvas();
}
function transformCanvas(){const g=$('canvas-content');g.setAttribute('transform',`translate(${store.tx} ${store.ty}) scale(${store.scale})`);$('drag-preview').setAttribute('transform',`translate(${store.tx} ${store.ty}) scale(${store.scale})`);renderStatus();}
function zoomAt(factor,x=store.viewport.w/2,y=store.viewport.h/2){const old=store.scale,ne=Math.max(.14,Math.min(3.5,old*factor));
 store.tx=x-(x-store.tx)*ne/old;store.ty=y-(y-store.ty)*ne/old;store.scale=ne;transformCanvas();}
const world=({x,y})=>({x:(x-store.tx)/store.scale,y:(y-store.ty)/store.scale});
const mousePos=e=>{const b=$('canvas').getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};};
const touchPoints=new Map();
let pinch=null;
const pinchGeometry=()=>{const [a,b]=[...touchPoints.values()];return{distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
const zoneType=z=>flag(z.human_start)||flag(z.computer_start)?'start':flag(z.treasure)||flag(z.junction)?'treasure':'neutral';
const zoneLabel=z=>flag(z.human_start)?'Игрок':flag(z.computer_start)?'Компьютер':flag(z.treasure)?'Сокровища':flag(z.junction)?'Перекрёсток':'Нейтральная';
function treasureScore(z){return z.treasure_tiers.reduce((sum,t)=>sum+((+t.low||0)+(+t.high||0))/2*(+t.density||0)/1000,0);}
function getConnectorPath(a,b,offset=0){
 const ax=a.x+CARD_W/2,ay=a.y+CARD_H/2,bx=b.x+CARD_W/2,by=b.y+CARD_H/2,dx=bx-ax,dy=by-ay;
 if(Math.hypot(dx,dy)<2)return{d:`M${ax-10} ${ay-15} C${ax-80} ${ay-110} ${ax+90} ${ay-110} ${ax+35} ${ay-14}`,x:ax+14,y:ay-83};
 const angle=Math.atan2(dy,dx),startDist=Math.min(CARD_W/2/Math.max(.0001,Math.abs(Math.cos(angle))),CARD_H/2/Math.max(.0001,Math.abs(Math.sin(angle)))),endDist=startDist;
 const x1=ax+Math.cos(angle)*startDist,y1=ay+Math.sin(angle)*startDist,x2=bx-Math.cos(angle)*endDist,y2=by-Math.sin(angle)*endDist;
 const mx=(x1+x2)/2-Math.sin(angle)*offset,my=(y1+y2)/2+Math.cos(angle)*offset;
 const d=Math.abs(offset)>1?`M${x1} ${y1} Q${2*mx-(x1+x2)/2} ${2*my-(y1+y2)/2} ${x2} ${y2}`:`M${x1} ${y1} L${x2} ${y2}`;
 return{d,x:mx,y:my};
}
function canvasMarkup(map){
 const nodesById=new Map(map.zones.map(z=>[z.id.trim(),z]));
 const connectionCount=new Map(),edges=map.connections.map((c,i)=>{
  const a=map.layout[c.zone1.trim()],b=map.layout[c.zone2.trim()],ok=!!(a&&b);
  if(!a&&!b)return '';
  let path;let className=`connection ${store.selected.kind==='connection'&&store.selected.index===i?'selected':''} ${flag(c.wide)?'conn-wide':''} ${ok?'':'dangling'}`;
  if(ok){const key=[c.zone1.trim(),c.zone2.trim()].sort().join(':'),offsetIndex=connectionCount.get(key)||0;connectionCount.set(key,offsetIndex+1);path=getConnectorPath(a,b,offsetIndex?20*Math.ceil(offsetIndex/2)*(offsetIndex%2?-1:1):0);}
  else{const pt=a??b,x=pt.x+CARD_W/2,y=pt.y+CARD_H/2;path={d:`M${x} ${y} l${a?85:-85} 0`,x:x+(a?45:-45),y:y};}
  let label=strVal(c.value)||'—';if(flag(c.border_guard))label+=' ⛨';
  return `<g class="${className}" data-conn-index="${i}"><path class="conn-line" d="${path.d}"/><path class="conn-hit" d="${path.d}"/><rect class="conn-label-bg" x="${path.x-24}" y="${path.y-10}" width="48" height="20" rx="7"/><text class="conn-label" x="${path.x}" y="${path.y}">${esc(label.length>11?label.slice(0,10)+'…':label)}</text></g>`;
 }).join('');
 const zones=map.zones.map((z,i)=>{
  const p=map.layout[z.id]??{x:110+i*200,y:120};const type=zoneType(z),selected=store.selected.kind==='zone'&&store.selected.index===i;
  const tier=Math.round(treasureScore(z)).toLocaleString('en-US');const minT=Number(z.player_towns.min_castles||0)+Number(z.neutral_towns.min_castles||0);
  return `<g class="node node-${type} ${selected?'selected':''}" data-zone-index="${i}" transform="translate(${p.x} ${p.y})" role="button" tabindex="0" aria-label="Зона ${esc(z.id)}: ${esc(zoneLabel(z))}">
    <rect class="node-border" width="${CARD_W}" height="${CARD_H}" rx="11"/><path class="node-accent" d="M11 1h158a10 10 0 0 1 10 10v3H1v-3A10 10 0 0 1 11 1Z"/>
    <rect class="node-id-pill" x="12" y="25" width="31" height="28" rx="7"/><text class="node-id-label" x="27.5" y="44" text-anchor="middle">${esc(z.id.length>4?z.id.slice(0,3)+'…':z.id)}</text>
    <text class="node-title" x="51" y="36">${esc(zoneLabel(z))}</text><text class="node-meta" x="51" y="52">Размер ${esc(z.base_size||'—')} · ${esc(z.monster_strength||'без охраны')}</text>
    <path class="node-separator" d="M11 65 H169"/>
    <rect class="node-badge" x="11" y="75" width="89" height="26" rx="6"/><text class="node-badge-label" x="19" y="92">◆ ${tier.length>9?tier.slice(0,9):tier}</text>
    <rect class="node-badge" x="107" y="75" width="62" height="26" rx="6"/><text class="node-badge-label" x="115" y="92">♜ ${minT}</text>
    <text class="node-grab" x="163" y="33" text-anchor="middle">⠿</text></g>`;
 }).join('');return edges+zones;
}
const strVal=v=>String(v??'');
function renderCanvas(){const map=current();$('canvas-content').innerHTML=map?canvasMarkup(map):'';
 $('empty-hint').classList.toggle('hidden',!!map?.zones.length);
 transformCanvas();
}
function select(kind,index){store.selected={kind,index};store.tab='general';store.connectMode=false;
 $('inspector').classList.add('open');renderAll();}
function handleCanvasDown(e){if(e.button!==0&&e.button!==1)return;
 const btn=e.target.closest('[data-zone-index]'),conn=e.target.closest('[data-conn-index]'),p=mousePos(e);
 if(e.pointerType==='touch'){
  touchPoints.set(e.pointerId,p);
  if(touchPoints.size===2){
   const g=pinchGeometry();pinch={startDistance:Math.max(1,g.distance),startScale:store.scale,anchor:world(g)};
   store.drag=null;$('drag-preview').innerHTML='';
   e.preventDefault();$('canvas').setPointerCapture(e.pointerId);return;
  }
  if(touchPoints.size>2){e.preventDefault();return;}
 }
 if(conn&&!btn){select('connection',+conn.dataset.connIndex);return;}
 if(btn){const i=+btn.dataset.zoneIndex,z=current()?.zones[i];if(!z)return;
  if(store.connectMode){if(!store.connectFrom){store.connectFrom=z.id;toast('Выберите вторую зону');}else{
    let from=store.connectFrom;store.connectFrom=null;store.connectMode=false;
    commit('Добавлена связь',()=>{current().connections.push(freshConnection(store.pack.format,from,z.id));store.selected={kind:'connection',index:current().connections.length-1};});
  }return;}
  store.drag={type:e.altKey?'connect':'zone',index:i,from:z.id,initial:current().layout[z.id]?{...current().layout[z.id]}:{x:0,y:0},moved:false,at:p,snapshot:capture()};
  if(!e.altKey)store.selected={kind:'zone',index:i};
  if(e.pointerType!=='touch')$('inspector').classList.add('open');renderInspector();renderCanvas();
 }else{
  if(store.connectMode){store.connectMode=false;store.connectFrom=null;toast('Добавление связи отменено.');renderToolbar();}
  store.drag={type:'pan',at:p,initial:{x:store.tx,y:store.ty}};
 }
 e.preventDefault();$('canvas').setPointerCapture(e.pointerId);
}
function handleCanvasMove(e){
 if(e.pointerType==='touch'&&touchPoints.has(e.pointerId))touchPoints.set(e.pointerId,mousePos(e));
 if(pinch&&touchPoints.size>=2){
  const g=pinchGeometry();store.scale=Math.max(.14,Math.min(3.5,pinch.startScale*g.distance/pinch.startDistance));
  store.tx=g.x-pinch.anchor.x*store.scale;store.ty=g.y-pinch.anchor.y*store.scale;
  transformCanvas();e.preventDefault();return;
 }
 const d=store.drag;if(!d)return;const p=mousePos(e),dx=p.x-d.at.x,dy=p.y-d.at.y;
 if(Math.abs(dx)>2||Math.abs(dy)>2)d.moved=true;
 if(d.type==='pan'){store.tx=d.initial.x+dx;store.ty=d.initial.y+dy;transformCanvas();}
 else if(d.type==='zone'){
  const z=current()?.zones[d.index];if(!z)return;
  current().layout[z.id]={x:Math.round(d.initial.x+dx/store.scale),y:Math.round(d.initial.y+dy/store.scale)};
  renderCanvas();
 }else if(d.type==='connect'){
  const from=world(d.at),to=world(p);$('drag-preview').innerHTML=`<path stroke="var(--accent)" stroke-dasharray="7 5" stroke-width="2" fill="none" d="M${from.x} ${from.y}L${to.x} ${to.y}"/>`;
 }
}
function handleCanvasUp(e){
 if(e.pointerType==='touch')touchPoints.delete(e.pointerId);
 if(pinch){if(touchPoints.size<2)pinch=null;store.drag=null;return;}
 const d=store.drag;if(!d)return;store.drag=null;$('drag-preview').innerHTML='';
 if(d.type==='zone'&&!d.moved&&e.pointerType==='touch'){$('inspector').classList.add('open');renderInspector();}
 try{$('canvas').releasePointerCapture(e.pointerId);}catch{}
 if(d.type==='zone'&&d.moved){
   const m=current();if(store.undo.at(-1)?.snapshot!==d.snapshot){store.undo.push({snapshot:d.snapshot,selection:{kind:'zone',index:d.index},tab:store.tab,label:'Перемещена зона'});}
   if(store.undo.length>50)store.undo.shift();store.redo=[];m.layoutDirty=true;store.pack.dirty=true;
   persistLayout();renderAll();status('Положение зоны изменено');
 }else if(d.type==='connect'&&d.moved){
   const elements=document.elementsFromPoint(e.clientX,e.clientY),target=elements.map(el=>el.closest?.('[data-zone-index]')).find(Boolean);
   if(target&&+target.dataset.zoneIndex!==d.index){const z2=current()?.zones[+target.dataset.zoneIndex];commit('Создана связь',()=>{
     current().connections.push(freshConnection(store.pack.format,d.from,z2.id));store.selected={kind:'connection',index:current().connections.length-1};
   });}else toast('Перетащите на другую зону для создания связи.');
 }
}
$('canvas').addEventListener('pointerdown',handleCanvasDown);
$('canvas').addEventListener('pointermove',handleCanvasMove);
$('canvas').addEventListener('pointerup',handleCanvasUp);
$('canvas').addEventListener('pointercancel',e=>{touchPoints.delete(e.pointerId);pinch=null;store.drag=null;$('drag-preview').innerHTML='';});
$('canvas').addEventListener('wheel',e=>{e.preventDefault();let p=mousePos(e);zoomAt(Math.exp(-e.deltaY*.00125),p.x,p.y);},{passive:false});
$('zoom-in').onclick=()=>zoomAt(1.25);$('zoom-out').onclick=()=>zoomAt(.8);$('zoom-fit').onclick=fitView;
$('canvas').addEventListener('keydown',e=>{const n=e.target.closest?.('[data-zone-index]');if(n&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select('zone',+n.dataset.zoneIndex);}});
try{new ResizeObserver(()=>{let b=$('canvas').getBoundingClientRect();store.viewport={w:b.width||700,h:b.height||500};}).observe($('canvas'));}catch{}

// Every form field is schema-backed and updated without implicit conversions.
const f=(path,label,value,{hint='',multiline=false,select=null,placeholder=''}={})=>{
 const attr=`data-path="${esc(path)}"`,v=strVal(value);
 let elem;
 if(select){const opts=[...select];if(!opts.some(x=>x[1]===v))opts.push([v,v||'(empty)']);elem=`<select ${attr}>${opts.map(([name,val])=>`<option value="${esc(val)}" ${val===v?'selected':''}>${esc(name)}</option>`).join('')}</select>`;}
 else if(multiline)elem=`<textarea ${attr} rows="3">${esc(v)}</textarea>`;
 else elem=`<input type="text" ${attr} value="${esc(v)}" placeholder="${esc(placeholder)}" spellcheck="false">`;
 return `<div class="field"><label>${esc(label)}</label>${elem}${hint?`<small class="field-note">${esc(hint)}</small>`:''}</div>`;
};
const check=(path,label,value)=>`<div class="field row-field"><label for="${esc(path)}">${esc(label)}</label><input id="${esc(path)}" type="checkbox" data-path="${esc(path)}" ${flag(value)?'checked':''}></div>`;
const group=(title,body)=>`<section class="prop-group"><h3>${esc(title)}</h3>${body}</section>`;
const pair=(arr)=>`<div class="form-grid">${arr.join('')}</div>`;
const kv=(prefix,obj,entries)=>entries.map(([field,label])=>f(`${prefix}.${field}`,label,obj?.[field]));
const posLabels=[['min_human','Минимум игроков'],['max_human','Максимум игроков'],['min_total','Минимум позиций'],['max_total','Максимум позиций']];
const factions=schema=>schema.towns.map(s=>s==='Elemental'?'Conflux':s);
function selectedModel(){const pack=store.pack,map=current(),s=store.selected;
 return s.kind==='zone'?map?.zones[s.index]:s.kind==='connection'?map?.connections[s.index]:s.kind==='pack'?pack:map;
}
function tabsFor(kind){return kind==='zone'?['Основное','Города','Содержимое','Ландшафт','Монстры',...(store.pack.format!=='sod'?['HotA']:[])]:kind==='connection'?['Основное',...(store.pack.format!=='sod'?['HotA']:[])]:kind==='pack'?['Пакет']:['Карта',...(store.pack.format!=='sod'?['HotA']:[])];}
function zoneProps(z,t){const sch=SCHEMA.formats[store.pack.format];
 if(t==='Основное')return group('Тип зоны',check('human_start','Начальная зона игрока',z.human_start)+check('computer_start','Стартовая зона компьютера',z.computer_start)+check('treasure','Зона сокровищ',z.treasure)+check('junction','Перекрёсток',z.junction))+
   group('Идентификатор и размер',pair([f('id','ID зоны',z.id),f('base_size','Базовый размер',z.base_size)]))+
   group('Ограничения на размещение',pair(kv('positions',z.positions,posLabels)))+
   group('Принадлежность',f('ownership','Игрок / владелец',z.ownership));
 if(t==='Города')return group('Города игрока',pair(kv('player_towns',z.player_towns,[['min_towns','Мин. городов'],['min_castles','Мин. замков'],['town_density','Плотность городов'],['castle_density','Плотность замков']])))+
    group('Нейтральные города',pair(kv('neutral_towns',z.neutral_towns,[['min_towns','Мин. городов'],['min_castles','Мин. замков'],['town_density','Плотность городов'],['castle_density','Плотность замков']])))+
    group('Разрешённые фракции',check('towns_same_type','Города одного типа',z.towns_same_type)+`<div class="flag-grid">${factions(sch).map(name=>check(`town_types.${name}`,name,z.town_types[name])).join('')}</div>`);
 if(t==='Содержимое')return group('Сокровища',z.treasure_tiers.map((tier,i)=>`<div class="eyebrow" style="margin:10px 0">УРОВЕНЬ ${i+1}</div>`+`<div class="form-grid">${['low','high','density'].map(k=>f(`treasure_tiers.${i}.${k}`,k==='low'?'Минимум':k==='high'?'Максимум':'Плотность',tier[k])).join('')}</div>`).join(''))+
    group('Минимум шахт',pair(SCHEMA.resources.map(k=>f(`min_mines.${k}`,k,z.min_mines[k]))))+
    group('Плотность шахт',pair(SCHEMA.resources.map(k=>f(`mine_density.${k}`,k,z.mine_density[k]))));
 if(t==='Ландшафт')return group('Ландшафты',check('terrain_match','Как у города',z.terrain_match)+`<div class="flag-grid">${sch.terrains.map(k=>check(`terrains.${k}`,k,z.terrains[k])).join('')}</div>`);
 if(t==='Монстры')return group('Охрана',f('monster_strength','Сила',z.monster_strength,{select:[['Пусто',''],['Без монстров','none'],['Слабые','weak'],['Средние (avg)','avg'],['Средние (average)','average'],['Сильные','strong'],['Legacy: normal','normal']]})+check('monster_match','Как у города',z.monster_match))+
   group('Разрешённые фракции',`<div class="flag-grid">${sch.monsters.map(k=>check(`monster_factions.${k}`,k,z.monster_factions[k])).join('')}</div>`);
 if(t==='HotA')return group('Дополнительные настройки HotA',SCHEMA.zoneOptionFields.map(name=>f(`zone_options.${name}`,name.replace(/_/g,' '),z.zone_options[name],{hint:name==='image_settings'?'Координаты для редактора HotA. Перемещение по схеме будет записано при сохранении.':''})).join(''));
 return '';
}
function connectionProps(c,t){return t==='HotA'?group('Дополнительные поля HotA',[
 ['road','Дорога'],['conn_type','Тип'],['fictive','Фиктивная'],['portal_repulsion','Отталкивание портала']
 ].map(([key,label])=>f(key,label,c[key])).join('')):
 group('Между зонами',pair([f('zone1','Зона 1',c.zone1),f('zone2','Зона 2',c.zone2),f('value','Ценность прохода',c.value)]))+
 group('Параметры',check('wide','Широкая',c.wide)+check('border_guard','Пограничная охрана',c.border_guard))+
 group('Ограничения',pair(kv('positions',c.positions,posLabels)));
}
function mapProps(m,t){const isHota=store.pack.format!=='sod';return t==='HotA'?group('Дополнительные параметры карты',[
 ['artifacts','Артефакты'],['combo_arts','Сборные артефакты'],['spells','Заклинания'],['secondary_skills','Вторичные навыки'],['objects','Объекты'],['rock_blocks','Горные преграды'],['zone_sparseness','Разреженность зон'],['special_weeks_disabled','Отключить особые недели'],['spell_research','Исследование заклинаний'],['anarchy','Анархия']
 ].map(([k,l])=>f(`options.${k}`,l,m.options[k])).join('')):group('Карта',f('name','Название',m.name)+pair([f('min_size','Минимальный размер',m.min_size),f('max_size','Максимальный размер',m.max_size)]))+
 group('Статистика',`<div class="alert-info">${m.zones.length} зон · ${m.connections.length} связей<br>${isHota?'Поддерживается запись координат в image_settings.':'Позиции схемы сохраняются в браузере и доступны для экспорта в JSON.'}</div>`);
}
function packProps(p){if(p.format==='sod')return group('Пакет SoD',`<div class="alert-info">У SoD нет метаданных пакета. Здесь можно редактировать настройки каждой карты или конвертировать пакет в HotA.</div>`);
 return group('Метаданные пакета',[
 ['name','Название'],['description','Описание'],['town_selection','Выбор городов'],['heroes','Герои'],['mirror','Зеркальность'],['tags','Теги'],['max_battle_rounds','Макс. раундов боя'],['forbid_hiring_heroes','Запрет найма героев']
 ].map(([name,label])=>f(`metadata.${name}`,label,p.metadata[name],{multiline:name==='description'})).join(''))+
 group('Счётчики полей',pair([['town','Города'],['terrain','Ландшафты'],['zone_type','Типы зон'],['pack_new','Поля пакета'],['map_new','Поля карты'],['zone_new','Поля зоны'],['connection_new','Поля связей']].map(([name,label])=>f(`field_counts.${name}`,label,p.field_counts[name]))));
}
function renderInspector(){const p=store.pack,m=current(),s=store.selected;
 if(!p){$('inspector-body').innerHTML='<div class="inspector-empty">Откройте шаблон для начала работы.</div>';return;}
 let obj=selectedModel();if(!obj){store.selected={kind:'map',index:store.mapIndex};return renderInspector();}
 const kind=s.kind;const label=kind==='zone'?`Зона #${obj.id}`:kind==='connection'?`Связь ${obj.zone1} ↔ ${obj.zone2}`:kind==='pack'?'Параметры пакета':'Параметры карты';
 $('inspector-title').textContent=label;
 $('inspector-subtitle').textContent=kind==='zone'?'Свойства выбранной зоны':kind==='connection'?'Свойства соединения':kind==='pack'?p.filename:m.name;
 const tabs=tabsFor(kind);if(!tabs.includes(store.tab))store.tab=tabs[0];
 $('inspector-tabs').innerHTML=tabs.map(t=>`<button type="button" data-tab="${esc(t)}" class="${t===store.tab?'active':''}">${esc(t)}</button>`).join('');
 $('inspector-body').innerHTML=kind==='zone'?zoneProps(obj,store.tab):kind==='connection'?connectionProps(obj,store.tab):kind==='pack'?packProps(p):mapProps(obj,store.tab);
 $('inspector-footer').innerHTML=kind==='zone'?`<button class="btn btn-subtle" data-inspector-action="duplicate">${icon('copy',15)} Дублировать</button><button class="btn btn-subtle danger" data-inspector-action="delete">${icon('trash',15)} Удалить</button>`:
 kind==='connection'?`<button class="btn btn-subtle danger" data-inspector-action="delete">${icon('trash',15)} Удалить связь</button>`:
 kind==='map'?`<button class="btn btn-subtle" data-inspector-action="duplicate">${icon('copy',15)} Дублировать</button><button class="btn btn-subtle danger" data-inspector-action="delete">${icon('trash',15)} Удалить карту</button>`:'';
}
$('inspector-tabs').addEventListener('click',e=>{const el=e.target.closest('[data-tab]');if(el){store.tab=el.dataset.tab;renderInspector();}});
$('inspector-body').addEventListener('change',e=>{
 const field=e.target.closest('[data-path]');if(!field)return;
 const path=field.dataset.path.split('.'),selected=selectedModel();if(!selected)return;
 const value=field.type==='checkbox'?(field.checked?'x':''):field.value;
 let obj=selected;for(let i=0;i<path.length-1;i++){if(obj[path[i]]==null)obj[path[i]]={};obj=obj[path[i]];}
 const key=path.at(-1),before=obj[key];if(before===value)return;
 if(store.selected.kind==='zone'&&path.length===1&&key==='id'){
  const zone=selected,newId=value.trim();if(!newId){toast('ID зоны не должен быть пустым.');field.value=before;return;}
  if(current().zones.some(z=>z!==zone&&z.id.trim()===newId)){toast('Такой ID зоны уже существует.');field.value=before;return;}
  const oldId=zone.id;
  commit('Изменён ID зоны',()=>{for(const conn of current().connections){if(conn.zone1.trim()===oldId.trim())conn.zone1=newId;if(conn.zone2.trim()===oldId.trim())conn.zone2=newId;}
    const idMapping=Object.fromEntries(current().zones.map(z=>[z.id.trim(),z.id.trim()]));
    idMapping[oldId.trim()]=newId;
    const warnings=[];
    for(const z of current().zones)for(const name of ['town_hint','terrain_hint','faction_hint'])if(z.zone_options?.[name]){
      const result=remapHintRefsDetailed(z.zone_options[name],idMapping);
      if(result.warning)warnings.push(`Zone ${z.id}, ${name}: ${result.warning}`);
      z.zone_options[name]=result.value;
    }
    if(warnings.length)store.pack.warnings.push(...warnings);
    current().layout[newId]=current().layout[oldId];delete current().layout[oldId];zone.id=newId;});
 }else commit(`Изменено: ${path.join(' / ')}`,()=>{obj[key]=value;});
});
$('inspector-footer').addEventListener('click',e=>{const btn=e.target.closest('[data-inspector-action]');if(!btn)return;const action=btn.dataset.inspectorAction,s=store.selected;
 if(action==='duplicate'){
   if(s.kind==='zone')commit('Зона дублирована',()=>{const map=current(),source=map.zones[s.index],copy=structuredClone(source),id=String(Math.max(0,...map.zones.map(z=>Number(z.id)||0))+1);copy.id=id;map.zones.push(copy);
     map.layout[id]={x:(map.layout[source.id]?.x??100)+215,y:(map.layout[source.id]?.y??100)+145};store.selected={kind:'zone',index:map.zones.length-1};});
   else if(s.kind==='map')duplicateMap();
 }else if(action==='delete'){
   const name=s.kind==='zone'?`зону ${current().zones[s.index]?.id}`:s.kind==='connection'?'выбранную связь':'выбранную карту';
   confirmAction('Подтверждение удаления',`Удалить ${esc(name)}? Это действие можно отменить.`,()=>{
    if(s.kind==='zone')commit('Удалена зона',()=>{const map=current(),zone=map.zones[s.index];map.zones.splice(s.index,1);map.connections=map.connections.filter(c=>c.zone1!==zone.id&&c.zone2!==zone.id);delete map.layout[zone.id];store.selected={kind:'map',index:store.mapIndex};});
    else if(s.kind==='connection')commit('Удалена связь',()=>{current().connections.splice(s.index,1);store.selected={kind:'map',index:store.mapIndex};});
    else removeMap();
   });
 }
});
function addMap(){if(!store.pack)return;
 commit('Создана карта',()=>{const m={name:`New Map ${store.pack.maps.length+1}`,min_size:'36',max_size:'144',options:SCHEMA.formats[store.pack.format].isHota?Object.fromEntries(['artifacts','combo_arts','spells','secondary_skills','objects','rock_blocks','zone_sparseness','special_weeks_disabled','spell_research','anarchy'].map(k=>[k,''])):{},zones:[],connections:[],layout:{}};
 store.pack.maps.push(m);store.mapIndex=store.pack.maps.length-1;store.selected={kind:'map',index:store.mapIndex};});
 renderAll();}
function duplicateMap(){commit('Карта дублирована',()=>{const map=structuredClone(current());map.name+=' (copy)';store.pack.maps.splice(store.mapIndex+1,0,map);store.mapIndex++;store.selected={kind:'map',index:store.mapIndex};});fitView();}
function removeMap(){if(store.pack.maps.length<=1){toast('В пакете должна оставаться хотя бы одна карта.');return;}
 commit('Удалена карта',()=>{store.pack.maps.splice(store.mapIndex,1);store.mapIndex=Math.max(0,store.mapIndex-1);store.selected={kind:'map',index:store.mapIndex};});fitView();}
function addZone(){if(!current())return;
 commit('Добавлена зона',()=>{const map=current(),id=String(Math.max(0,...map.zones.map(z=>Number(z.id)||0))+1),z=freshZone(store.pack.format,id);
  z.terrains.Dirt='x';z.monster_factions.Neutral='x';map.zones.push(z);
  const points=Object.values(map.layout);let i=map.zones.length-1;map.layout[id]={x:130+(i%6)*230,y:130+Math.floor(i/6)*190};
  if(points.length){const cx=points.reduce((a,p)=>a+p.x,0)/points.length,cy=points.reduce((a,p)=>a+p.y,0)/points.length;map.layout[id]={x:cx+235,y:cy+70};}
  store.selected={kind:'zone',index:i};store.tab='Основное';
 });}
function addConnection(){if(!current()?.zones.length||current().zones.length<2){toast('Для связи нужны минимум две зоны.');return;}
 store.connectMode=true;store.connectFrom=null;renderToolbar();toast('Нажмите на первую зону, затем на вторую. Или Alt + перетащите между ними.');}
function doLayout(){commit('Расстановка зон',()=>{current().layout=autoLayout(current(),{preferStored:false});current().layoutDirty=true;});fitView();}
function changeSpread(factor){commit(factor>1?'Раздвинуты зоны':'Сближены зоны',()=>{resizeLayout(current(),factor);current().layoutDirty=true;});fitView();}
function doReid(sort){const warnings=[];commit('Перенумерованы зоны',()=>renumberMap(current(),{sort,warnings}));
 if(warnings.length)modal('Проверка подсказок зон',`<p>Некоторые HotA-подсказки не изменены из-за неизвестного синтаксиса или ссылок:</p><div class="issues">${warnings.slice(0,30).map(w=>`<div class="issue badge-warning">${esc(w)}</div>`).join('')}</div>`);
}
function createFreshPack(format){const pack=freshPack(format);pack.maps.push({name:'New Map',min_size:'36',max_size:'144',options:Object.fromEntries(['artifacts','combo_arts','spells','secondary_skills','objects','rock_blocks','zone_sparseness','special_weeks_disabled','spell_research','anarchy'].map(k=>[k,''])),zones:[freshZone(format,'1')],connections:[],layout:{}});
 pack.maps[0].zones[0].terrains.Dirt='x';pack.maps[0].zones[0].monster_factions.Neutral='x';setPack(pack);}
function newPackDialog(){modal('Новый шаблон',`<div class="field"><label>Формат нового пакета</label><select id="new-pack-format"><option value="hota18">HotA 1.8.x</option><option value="hota17">HotA 1.7.x</option><option value="sod">Shadow of Death</option></select></div><p class="field-note">Несохранённые изменения текущего пакета будут потеряны.</p>`,[{label:'Отмена'},{label:'Создать',primary:true,handler:()=>createFreshPack($('new-pack-format').value)}]);}
function download(bytes,filename,mime='application/octet-stream'){
 const blob=new Blob([bytes],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function fileName(format){const original=store.pack.filename??'template',base=original.replace(/\.(h3t|txt)$/i,'');return base+(format==='sod'?'.txt':'.h3t');}
function performSave(format){const source=store.pack,converted=format===source.format?source:convertPack(source,format,{packName:source.filename.replace(/\.[^.]+$/,'')});
 if(SCHEMA.formats[format].isHota)for(const m of converted.maps){if(m.layoutDirty)saveImagePositions(m);}
 const output=serializePack(converted);download(output.bytes,fileName(format));
 if(format===source.format){if(SCHEMA.formats[format].isHota)for(let i=0;i<source.maps.length;i++)if(source.maps[i].layoutDirty){source.maps[i].zones.forEach((z,j)=>z.zone_options.image_settings=converted.maps[i].zones[j].zone_options.image_settings);source.maps[i].layoutDirty=false;}
   source.originalBytes=output.bytes;source.dirty=false;}
 renderAll();status(`Экспортировано: ${fileName(format)} (${upper(format)})`);toast(`Сохранено: ${fileName(format)}`);
 if(output.warnings.some(w=>/replaced/i.test(w)))modal('Предупреждение о кодировке',output.warnings.filter(w=>/replaced/i.test(w)).map(esc).join('<br>'));
}
function askSave(format){if(!store.pack)return;
 let converted;try{converted=format===store.pack.format?store.pack:convertPack(store.pack,format);}catch(e){toast(e.message);return;}
 const losses=converted.warnings.filter(w=>w.toLowerCase().includes('conversion loss'));
 const issues=validatePack(store.pack).filter(x=>x.level==='error');
 if(issues.length){modal('Ошибка проверки',`<p>Найдены проблемы, которые необходимо проверить:</p><div class="issues">${issues.slice(0,20).map(x=>`<div class="issue error">${esc(x.text)}</div>`).join('')}</div>`,[{label:'Отмена'},{label:'Сохранить как есть',primary:true,handler:()=>performSave(format)}]);return;}
 if(losses.length){modal('Внимание: потеря данных',`<p>Целевой формат не поддерживает некоторые поля:</p><div class="issues">${losses.slice(0,15).map(w=>`<div class="issue badge-warning">${esc(w)}</div>`).join('')}</div><p>Исходный файл останется неизменным.</p>`,[{label:'Отмена'},{label:'Всё равно конвертировать',primary:true,handler:()=>performSave(format)}]);return;}
 performSave(format);
}
function saveLayout(){if(!store.pack)return;
 persistLayout();
 const maps=store.pack.maps.map(m=>{
  const ids=m.zones.map(z=>z.id),missing=ids.some(id=>!Number.isFinite(m.layout?.[id]?.x)||!Number.isFinite(m.layout?.[id]?.y));
  return {...m,layout:missing?{...autoLayout(m),...m.layout}:m.layout};
 });
 const payload=createSidecar({...store.pack,maps});
 const count=Object.keys(payload.maps).length;
 if(!count){toast('Нет позиций для сохранения.');return;}
 const filename=store.pack.filename+'.h3tc-layout.json';
 download(new TextEncoder().encode(JSON.stringify(payload,null,2)+'\n'),filename,'application/json');
 toast(`Позиции сохранены: ${count} карт`);
}
async function importLayout(file){try{
 const payload=JSON.parse(await file.text()),positions=readSidecar(payload,store.pack,store.mapIndex);
 commit('Позиции загружены',()=>{
  for(const [i,valid] of positions){const map=store.pack.maps[i];
    Object.assign(map.layout,valid);map.layoutDirty=true;
    try{localStorage.setItem('h3tc-layout-'+store.fileKey+'-'+i,JSON.stringify(map.layout));}catch{}
  }
 });fitView();toast(`Позиции восстановлены: ${positions.size} карт`);
 }catch(e){toast('Layout import failed: '+e.message);}}
function svgStyles(){const cs=getComputedStyle(document.documentElement),v=n=>cs.getPropertyValue('--'+n).trim();
 return `.node-border{fill:${v('card')};stroke:${v('card-edge')};stroke-width:1.3}.node-start .node-accent{fill:${v('start')}}.node-treasure .node-accent{fill:${v('treasure')}}.node-neutral .node-accent{fill:${v('neutral')}}.node-id-pill,.node-badge{fill:${v('panel-3')}}.node-id-label,.node-title{fill:${v('card-text')};font-weight:700;font-family:Arial}.node-title{font-size:12px}.node-id-label{font-size:13px}.node-meta,.node-badge-label{fill:${v('card-muted')};font-size:10px;font-family:Arial}.node-separator{stroke:${v('card-edge')}}.node-grab{display:none}.conn-line{fill:none;stroke:${v('soft')};stroke-width:2}.conn-hit{display:none}.conn-wide .conn-line{stroke-width:3}.dangling .conn-line{stroke:${v('error')};stroke-dasharray:6 5}.conn-label-bg{fill:${v('panel')};stroke:${v('line')}}.conn-label{fill:${v('muted')};font:11px Arial;text-anchor:middle;dominant-baseline:middle}.grid-dot{fill:${v('grid')}}`;}
async function exportPNG(){if(!current()?.zones.length)return;const map=current(),b=bounds(map),pad=54,w=Math.ceil(b.w+pad*2),h=Math.ceil(b.h+pad*2),cs=getComputedStyle(document.documentElement);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><style>${svgStyles()}</style><rect width="100%" height="100%" fill="${cs.getPropertyValue('--canvas').trim()}"/><g transform="translate(${pad-b.x} ${pad-b.y})">${canvasMarkup(map)}</g></svg>`;
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),img=new Image();
 try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
  const canvas=document.createElement('canvas');canvas.width=Math.min(w,9000);canvas.height=Math.min(h,9000);const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG encoding failed.');
  download(new Uint8Array(await blob.arrayBuffer()),`${map.name.replace(/[\\/:*?"<>|]/g,'_')}.png`,'image/png');toast('PNG схема экспортирована.');
 }catch(e){toast('PNG export failed: '+e.message);}finally{URL.revokeObjectURL(url);}
}
function validateDialog(){if(!store.pack)return;const issues=validatePack(store.pack),warnings=store.pack.warnings;
 modal('Проверка шаблона',`<p><strong>${store.pack.maps.length}</strong> карт · <strong>${issues.length}</strong> замечаний · <strong>${warnings.length}</strong> сообщений парсера.</p>${!issues.length?'<p>Семантических проблем не обнаружено.</p>':`<div class="issues">${issues.slice(0,70).map(x=>`<div class="issue ${x.level==='error'?'error':'badge-warning'}">${esc(x.text)}</div>`).join('')}${issues.length>70?`<p>Ещё ${issues.length-70} замечаний...</p>`:''}</div>`}${warnings.length?`<details><summary>Сообщения исходного файла (${warnings.length})</summary><div class="issues">${warnings.slice(0,35).map(x=>`<div class="issue">${esc(x)}</div>`).join('')}</div></details>`:''}<p class="field-note">Проверка не изменяет шаблон автоматически.</p>`,[{label:'Закрыть'}]);
}
function helpDialog(){modal('Справка · H3 Template Studio',`<p><strong>Редактор работает локально:</strong> ваши шаблоны остаются в браузере и скачиваются на компьютер.</p>
 <h3>Файлы</h3><ul><li>Откройте <code>.h3t</code> (HotA 1.7/1.8) или <code>.txt</code> (SoD) кнопкой «Открыть» либо перетащите файл на схему.</li><li>Сохранение в исходном формате — «Сохранить». Конвертация — выберите формат и нажмите «Конвертировать».</li><li>Для SoD сохраняйте положение всех карт в совместимом с исходным редактором файле <code>.h3tc-layout.json</code>. В HotA новые координаты записываются в <code>image_settings</code>.</li></ul>
 <h3>Полотно</h3><ul><li>Колесо мыши или кнопки −/+ — изменение масштаба; фон — перетаскивание; «Вместить» — разместить карту по экрану.</li><li>Перетаскивайте зоны; <code>Alt + перетаскивание</code> между зонами создаёт связь; также можно использовать кнопку «Связь» и два клика.</li><li>Выберите зону или связь для редактирования всех параметров в правой панели.</li></ul>
 <h3>Горячие клавиши</h3><ul><li><code>Ctrl+O</code> — открыть; <code>Ctrl+S</code> — сохранить; <code>Ctrl+Z</code> / <code>Ctrl+Y</code> — отменить / повторить.</li><li><code>Delete</code> — удалить выделенную зону/связь (с подтверждением).</li><li><code>Ctrl+0</code> — вместить; <code>Ctrl+Shift++/-</code> — раздвинуть/сблизить; <code>Esc</code> — отменить создание связи / закрыть панели.</li></ul>
 <h3>Установка</h3><p>Нажмите «Установить» в Chrome/Edge на HTTPS. На iPhone/iPad: Share → Add to Home Screen. После первого открытия приложение сохраняет основные ресурсы для автономной работы.</p>
 <p class="field-note">Основано на MIT-лицензированном sokie/heroes3-template-util; браузерная версия является отдельной реализацией.</p>`,[{label:'Закрыть'}]);}
async function installApp(){if(store.installPrompt){const prompt=store.installPrompt;store.installPrompt=null;prompt.prompt();const result=await prompt.userChoice;if(result.outcome==='accepted')toast('Приложение устанавливается.');return;}
 const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 if(standalone){toast('Приложение уже открыто в установленном режиме.');return;}
 modal('Установка приложения',`<p>Установка доступна через меню браузера при открытии сайта по HTTPS (например, на GitHub Pages).</p><ul><li><b>Chrome / Edge:</b> меню ⋮ → «Установить приложение» или значок установки в адресной строке.</li><li><b>iPhone / iPad (Safari):</b> «Поделиться» → «На экран Домой».</li><li><b>Firefox:</b> встроенная установка PWA на компьютере может быть недоступна; используйте «Добавить на главный экран» на поддерживаемом телефоне.</li></ul><p>После первого открытия сайт может работать без интернета; для больших шаблонов откройте локальные файлы после установки.</p>`,[{label:'Закрыть'}]);
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();store.installPrompt=event;$('install-btn').title='Установить приложение';});
window.addEventListener('appinstalled',()=>{store.installPrompt=null;toast('Приложение установлено.');});
function runAction(action){$('more-menu').classList.add('hidden');if(!current())return;
 if(action==='layout')doLayout();else if(action==='spread')changeSpread(1.17);else if(action==='compact')changeSpread(.84);
 else if(action.startsWith('reid-'))doReid(action.slice(5));
 else if(action==='duplicate-map')duplicateMap();else if(action==='remove-map')confirmAction('Удаление карты',`Удалить карту ${esc(current().name)}?`,removeMap);
 else if(action==='png')exportPNG();else if(action==='export-layout')saveLayout();else if(action==='import-layout')$('layout-input').click();
}
$('more-menu').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)runAction(b.dataset.action);});
$('more-btn').onclick=()=>$('more-menu').classList.toggle('hidden');
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#more-menu,#more-btn'))$('more-menu').classList.add('hidden');});
$('open-btn').onclick=()=>$('file-input').click();
$('file-input').onchange=e=>{openFile(e.target.files[0]);e.target.value='';};
$('layout-input').onchange=e=>{if(e.target.files[0])importLayout(e.target.files[0]);e.target.value='';};
$('save-btn').onclick=()=>askSave(store.pack?.format);
$('convert-btn').onclick=()=>askSave($('export-format').value);
$('add-map-btn').onclick=addMap;
$('add-zone-btn').onclick=addZone;$('empty-add-btn').onclick=addZone;
$('add-conn-btn').onclick=addConnection;
$('undo-btn').onclick=undo;$('redo-btn').onclick=redo;
$('pack-props-btn').onclick=()=>{store.selected={kind:'pack',index:0};store.tab='Пакет';renderInspector();$('inspector').classList.add('open');$('sidebar').classList.remove('open');};
$('validate-btn').onclick=validateDialog;$('new-pack-btn').onclick=newPackDialog;
$('theme-btn').onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';setTheme(t);};
function setTheme(t){document.documentElement.dataset.theme=t;$('theme-btn').innerHTML=icon(t==='dark'?'sun':'moon');
 document.querySelector('meta[name="theme-color"]').content=t==='dark'?'#111827':'#ffffff';
 try{localStorage.setItem('h3tc-theme',t);}catch{}
}
$('install-btn').onclick=installApp;$('help-btn').onclick=helpDialog;
$('sidebar-toggle').onclick=()=>$('sidebar').classList.toggle('open');
$('inspector-close').onclick=()=>$('inspector').classList.remove('open');
let dragDepth=0;
window.addEventListener('dragenter',e=>{if(e.dataTransfer?.types?.includes('Files')){e.preventDefault();dragDepth++;$('drop-hint').classList.remove('hidden');}});
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
window.addEventListener('dragleave',e=>{if(e.dataTransfer?.types?.includes('Files')){dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('drop-hint').classList.add('hidden');}});
window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-hint').classList.add('hidden');if(e.dataTransfer?.files?.[0])openFile(e.dataTransfer.files[0]);});
document.addEventListener('keydown',e=>{
 if($('modal').open)return;const editing=e.target.matches('input,textarea,select,[contenteditable]');
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();$('file-input').click();}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();askSave(store.pack?.format);}
 if((e.ctrlKey||e.metaKey)&&!editing&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}
 if((e.ctrlKey||e.metaKey)&&!editing&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}
 if((e.ctrlKey||e.metaKey)&&e.key==='0'){e.preventDefault();fitView();}
 if((e.ctrlKey||e.metaKey)&&e.shiftKey&&!editing&&e.key==='+'){e.preventDefault();if(current())changeSpread(1.17);}
 if((e.ctrlKey||e.metaKey)&&e.shiftKey&&!editing&&e.key==='_'){e.preventDefault();if(current())changeSpread(.84);}
 if(e.key==='Escape'){store.connectMode=false;store.connectFrom=null;$('more-menu').classList.add('hidden');$('sidebar').classList.remove('open');$('inspector').classList.remove('open');renderToolbar();}
 if(!editing&&(e.key==='Delete'||e.key==='Backspace')&&['zone','connection'].includes(store.selected.kind)){
  e.preventDefault();$('inspector-footer').querySelector('[data-inspector-action="delete"]')?.click();
 }
});
window.addEventListener('beforeunload',e=>{if(store.pack?.dirty&&store.pack.originalBytes){e.preventDefault();e.returnValue='';}});
try{setTheme(localStorage.getItem('h3tc-theme')==='light'?'light':'dark');}catch{setTheme('dark');}
if('serviceWorker' in navigator&&location.protocol.startsWith('http')){
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(e=>console.warn('Service worker unavailable:',e)));
}
loadSample('tesseract.txt');
