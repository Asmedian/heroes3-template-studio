import {SCHEMA,FORMATS,parseBytes,parseText,serializePack,convertPack,freshPack,freshZone,freshConnection,validatePack,renumberMap,remapHintRefsDetailed} from './core.js';
import {autoLayout,topologyLayout,compactLayout,resizeLayout,saveImagePositions,separate,CARD_W,CARD_H} from './layout.js';
import {connectionGeometry,connectionBundles} from './geometry.js';
import {createSidecar,readSidecar} from './sidecar.js';
import {compactExact,treasureScore,zoneAppearance,townEntries,mineEntries,connectionAppearance} from './visuals.js';
import {initializeLanguage,setLanguage,getLanguage,translateText} from './i18n.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const upper=s=>s==='sod'?'SoD':s==='hota17'?'HotA 1.7':'HotA 1.8';
const flag=s=>String(s??'').trim().toLowerCase()==='x';
const icon=(name,size=16)=>`<svg width="${size}" height="${size}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const store={pack:null,mapIndex:0,selected:{kind:'map',index:0},tab:'general',inspectorView:'selection',scale:1,tx:0,ty:0,
  viewport:{w:700,h:600},drag:null,connectMode:false,connectFrom:null,undo:[],redo:[],installPrompt:null,toastTimer:0,
  fileKey:'',loaded:false,loadToken:0,builtinId:null,presetLayouts:null};
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
const layoutStorageKey=index=>`h3tc-layout-v3-${store.fileKey}-${index}`;
function presetMatches(map,preset){return Boolean(preset&&preset.name===map.name&&preset.connections===map.connections.length&&preset.ids.join('\0')===map.zones.map(z=>String(z.id)).join('\0'));}
function recommendedLayout(map,index){const preset=store.presetLayouts?.[index];return presetMatches(map,preset)?compactLayout(structuredClone(preset.positions),{gap:68}):(topologyLayout(map)||autoLayout(map,{preferStored:false}));}
function persistLayout(){const map=current();if(!map||!store.fileKey)return;
 try{localStorage.setItem(layoutStorageKey(store.mapIndex),JSON.stringify(map.layout));}catch{ /* Storage can be disabled or full. */ }
}
function restoreLayout(index){const map=store.pack.maps[index];if(!map)return;
 const ids=new Set(map.zones.map(z=>String(z.id))),generated=recommendedLayout(map,index);
 let restored={};
 // v3 deliberately does not import the old automatic cache namespace. It prevents
 // obsolete 1.4/1.5 layouts from overriding the newer topology engine after update.
 try{const json=localStorage.getItem(layoutStorageKey(index));if(json){const parsed=JSON.parse(json);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))restored=parsed;}}catch{}
 restored=Object.fromEntries(Object.entries(restored).filter(([id,p])=>ids.has(String(id))&&Number.isFinite(p?.x)&&Number.isFinite(p?.y)));
 const candidate=Object.keys(restored).length===ids.size?restored:{...generated,...restored};
 const points=Object.values(candidate),pad=46;
 const crowded=points.some((a,i)=>points.slice(i+1).some(b=>Math.abs(a.x-b.x)<CARD_W+pad&&Math.abs(a.y-b.y)<CARD_H+pad));
 map.layout=crowded?separate(candidate,68):candidate;
}
let upstreamLayoutsPromise=null;
async function loadUpstreamLayouts(){
 if(!upstreamLayoutsPromise)upstreamLayoutsPromise=fetch('./templates/upstream-layouts.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Layout catalog unavailable');return r.json();}).catch(error=>{upstreamLayoutsPromise=null;throw error;});
 return upstreamLayoutsPromise;
}
function matchPackPresets(pack,layouts){
 const pool=Object.values(layouts?.templates??{}).flat(),used=new Set();
 return pack.maps.map(map=>{
  const key=map.name+'\0'+map.connections.length+'\0'+map.zones.map(z=>String(z.id)).join('\0');
  const index=pool.findIndex((preset,i)=>!used.has(i)&&(preset.name+'\0'+preset.connections+'\0'+preset.ids.join('\0'))===key);
  if(index<0)return null;used.add(index);return pool[index];
 });
}
async function openFile(file){
 if(!file)return;
 const token=++store.loadToken;
 try{const bytes=new Uint8Array(await file.arrayBuffer());if(!/\.(h3t|txt)$/i.test(file.name))throw new Error(getLanguage()==='ru'?'Неверный тип файла. Выберите текстовый шаблон .txt (SoD) или .h3t (HotA).':'Unsupported file type. Choose a .txt (SoD) or .h3t (HotA) template.');if(bytes.some(b=>b===0)||bytes.slice(0,4096).some(b=>b<9||(b>13&&b<32)))throw new Error(getLanguage()==='ru'?'Файл содержит двоичные данные и не является текстовым шаблоном SoD/HotA.':'The file contains binary data and is not a text SoD/HotA template.');const pack=parseBytes(bytes,{filename:file.name});if(token!==store.loadToken)return;
  let presetLayouts=null;try{presetLayouts=matchPackPresets(pack,await loadUpstreamLayouts());}catch(error){console.warn('Canonical layout catalog unavailable:',error);}
  if(token!==store.loadToken)return;setPack(pack,bytes,null,presetLayouts);
  const total=pack.maps.reduce((s,m)=>s+m.zones.length,0);
  toast(`Открыт ${file.name} · ${pack.maps.length} карт · ${total} зон`);
 }catch(e){modal('Ошибка открытия',`<p>${esc(e?.message||e)}</p><p>Поддерживаются текстовые шаблоны SoD, HotA 1.7.x и HotA 1.8.x.</p>`);}
}
function setPack(pack,bytes=null,builtinId=null,presetLayouts=null){
 $('canvas-legend').open=false;
 store.pack=pack;store.builtinId=builtinId;store.presetLayouts=presetLayouts;if($('built-in-select'))$('built-in-select').value=builtinId||'';store.mapIndex=0;store.selected={kind:'map',index:0};store.tab='general';store.inspectorView='selection';store.undo=[];store.redo=[];
 store.connectMode=false;store.connectFrom=null;store.fileKey=fileSignature(bytes??new TextEncoder().encode(pack.filename),pack.filename);
 restoreLayout(0);store.loaded=true;
 $('export-format').value=pack.format;
 renderAll();requestAnimationFrame(()=>fitView(true));
 status(`Загружен: ${pack.filename} (${upper(pack.format)})`);
}
async function initializeCatalog(){
 const select=$('built-in-select');
 try{
  const response=await fetch('./templates/catalog.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const catalog=await response.json();if(!Array.isArray(catalog.templates)||catalog.count!==catalog.templates.length)throw new Error('Invalid built-in catalog.');
  select.replaceChildren(new Option(getLanguage()==='ru'?'Выберите встроенный шаблон…':translateText('Выберите встроенный шаблон…'),''));
  for(const entry of catalog.templates){
   const option=new Option(entry.name,entry.id);option.dataset.file=entry.file;select.add(option);
  }
  select.disabled=false;select.setAttribute('aria-label',getLanguage()==='ru'?'Встроенные шаблоны':'Built-in templates');
  $('builtin-count').textContent=`${catalog.count} SoD`;
 }catch(error){console.warn('Built-in catalog unavailable:',error);select.disabled=true;toast('Built-in template list unavailable: '+error.message);}
}
async function loadBuiltin(id){
 const select=$('built-in-select'),option=[...select.options].find(o=>o.value===id);
 if(!id||!option){select.value=store.builtinId||'';return;}
 if(store.pack?.dirty&&!confirm(getLanguage()==='ru'?'Несохранённые изменения будут потеряны. Продолжить?':'Unsaved changes will be lost. Continue?')){
   select.value=store.builtinId||'';return;
 }
 const token=++store.loadToken;select.disabled=true;
 try{
  const response=await fetch('./templates/'+encodeURIComponent(option.dataset.file));
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const bytes=new Uint8Array(await response.arrayBuffer());if(token!==store.loadToken)return;
  const pack=parseBytes(bytes,{filename:option.textContent+'.txt'});
  let presetLayouts=null;
  try{const layouts=await loadUpstreamLayouts();presetLayouts=layouts.templates[id]||null;}
  catch(error){console.warn('Upstream layout unavailable, using browser layout:',error);}
  setPack(pack,bytes,id,presetLayouts);
 }catch(e){if(token!==store.loadToken)return;select.value=store.builtinId||'';toast('Cannot open built-in template: '+e.message);}
 finally{select.disabled=false;}
}
$('built-in-select').onchange=e=>loadBuiltin(e.target.value);

function selectMap(index){if(!store.pack?.maps[index])return;
 $('canvas-legend').open=false;
 persistLayout();store.mapIndex=index;restoreLayout(index);store.selected={kind:'map',index};store.tab='general';store.inspectorView='selection';store.connectMode=false;store.connectFrom=null;
 $('sidebar').classList.remove('open');renderAll();requestAnimationFrame(()=>fitView(true));
}
function renderAll(){renderSidebar();renderToolbar();renderCanvas();renderLegend();renderInspector();renderStatus();}
function renderSidebar(){const pack=store.pack;
 $('package-name').textContent=pack?.metadata?.name||pack?.filename||'Новый пакет';
 $('current-format').textContent=pack?upper(pack.format):'—';$('map-count').textContent=pack?`${pack.maps.length} карт`:'0 карт';
 const filter=$('map-search').value.toLocaleLowerCase();
 $('map-list').innerHTML=pack?.maps.map((m,i)=>m.name.toLocaleLowerCase().includes(filter)?`<button type="button" class="map-item ${i===store.mapIndex?'active':''}" data-map-index="${i}" title="${esc(m.name)}"><span class="map-number">${i+1}</span><span class="map-text"><strong>${esc(m.name||'Без названия')}</strong><small>${m.zones.length} зон · ${m.connections.length} связей</small></span></button>`:'').join('')||'<div class="field-note" style="padding:10px">Карты не найдены.</div>';
}
$('map-list').addEventListener('click',e=>{const btn=e.target.closest('[data-map-index]');if(btn)selectMap(+btn.dataset.mapIndex);});
$('map-search').addEventListener('input',renderSidebar);
function renderToolbar(){const map=current();$('toolbar-format').textContent=store.pack?upper(store.pack.format):'—';
 $('map-title').textContent=map?.name||'Нет выбранной карты';$('map-title').setAttribute('aria-label',$('map-title').textContent);hideMapTitle();$('map-stats').textContent=map?`${map.zones.length} зон · ${map.connections.length} связей`:'';
 for(const id of ['add-zone-btn','add-conn-btn','undo-btn','redo-btn','save-btn','convert-btn'])$(id).disabled=!store.pack||(id==='undo-btn'&&!store.undo.length)||(id==='redo-btn'&&!store.redo.length)||(id==='add-zone-btn'&&!map)||(id==='add-conn-btn'&&!map);
 $('add-conn-btn').style.background=store.connectMode?'var(--accent-bg)':'';
}

const fullTitleTooltip=$('map-title-tooltip');
function showMapTitle(){
 const title=$('map-title'),rect=title.getBoundingClientRect();
 if(title.scrollWidth<=title.clientWidth+2){fullTitleTooltip.hidden=true;return;}
 fullTitleTooltip.textContent=title.textContent;
 fullTitleTooltip.style.width=Math.min(540,window.innerWidth-24)+'px';
 fullTitleTooltip.hidden=false;
 const w=fullTitleTooltip.getBoundingClientRect().width;
 fullTitleTooltip.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-w-12))+'px';
 const h=fullTitleTooltip.getBoundingClientRect().height;
 fullTitleTooltip.style.top=(rect.bottom+h+12<window.innerHeight?rect.bottom+8:Math.max(8,rect.top-h-8))+'px';
}
function hideMapTitle(){fullTitleTooltip.hidden=true;}
$('map-title').addEventListener('mouseenter',showMapTitle);
$('map-title').addEventListener('mouseleave',hideMapTitle);
$('map-title').addEventListener('focus',showMapTitle);
$('map-title').addEventListener('blur',hideMapTitle);
window.addEventListener('resize',hideMapTitle);
function renderStatus(){const map=current();$('status-zones').textContent=`${map?.zones.length||0} зон`;$('status-conns').textContent=`${map?.connections.length||0} связей`;
 $('dirty-indicator').textContent=store.pack?.dirty?'● Изменено':'✓ Сохранено';$('dirty-indicator').style.color=store.pack?.dirty?'var(--treasure)':'var(--soft)';
 $('zoom-value').textContent=Math.round(store.scale*100)+'%';
}
function bounds(map=current()){const p=Object.values(map?.layout??{});if(!p.length)return{x:0,y:0,w:620,h:430};
 const minX=Math.min(...p.map(v=>v.x))-145,minY=Math.min(...p.map(v=>v.y))-70,maxX=Math.max(...p.map(v=>v.x+CARD_W))+145,maxY=Math.max(...p.map(v=>v.y+CARD_H))+70;
 const ids=new Set(map.zones.map(z=>z.id.trim()));
 const stubPoints=[...danglingConnectors(map).values()];
 const stubMinX=Math.min(minX,...stubPoints.map(p=>p.ex-45)),stubMaxX=Math.max(maxX,...stubPoints.map(p=>p.ex+45));
 const stubMinY=Math.min(minY,...stubPoints.map(p=>p.ey-28)),stubMaxY=Math.max(maxY,...stubPoints.map(p=>p.ey+28));
 const orphanCount=map.connections.filter(c=>!ids.has(c.zone1.trim())&&!ids.has(c.zone2.trim())).length;
 return{x:stubMinX,y:stubMinY,w:Math.max(1,stubMaxX-stubMinX)+(orphanCount?170:0),h:Math.max(1,stubMaxY-stubMinY)};
}
function fitView(initial=false){const m=current();if(!m||!m.zones.length)return;
 const box=$('canvas').getBoundingClientRect();store.viewport={w:box.width||700,h:box.height||500};let b=bounds(m);
 const fit=Math.min(2.3,Math.max(.12,Math.min((store.viewport.w-36)/b.w,(store.viewport.h-92)/b.h)));
 // Initial load and Fit must display every node and every endpoint label.
 store.scale=fit;
 store.tx=(store.viewport.w-b.w*store.scale)/2-b.x*store.scale;
 store.ty=(store.viewport.h-b.h*store.scale)/2-b.y*store.scale;
 finishCanvasTransform();
}
// Keep pointer events cheap: draw at most once per animation frame. A CSS transform
// lets the browser composite the cached SVG layer instead of repainting all icons
// and SVG drop shadows for every high-frequency pointer event.
let canvasFrame=0;
let renderedZoom=null;
let dragRect=null;
function flushCanvasTransform(){
 canvasFrame=0;
 const css=`translate3d(${store.tx}px, ${store.ty}px, 0) scale(${store.scale})`;
 const svg=`translate(${store.tx} ${store.ty}) scale(${store.scale})`;
 for(const id of ['canvas-content','drag-preview']){
  const layer=$(id);
  layer.style.transform=css;
  // Preserve the SVG transform attribute for serialization, inspection and
  // browsers that fall back from compositor-backed CSS transforms.
  layer.setAttribute('transform',svg);
 }
}
function updateZoomIndicator(){
 const zoom=Math.round(store.scale*100),label=zoom+'%';
 if(zoom!==renderedZoom||$('zoom-value').textContent!==label){$('zoom-value').textContent=label;renderedZoom=zoom;}
}
function transformCanvas(){updateZoomIndicator();if(!canvasFrame)canvasFrame=requestAnimationFrame(flushCanvasTransform);}
function finishCanvasTransform(){if(canvasFrame){cancelAnimationFrame(canvasFrame);canvasFrame=0;}flushCanvasTransform();updateZoomIndicator();}

function zoomAt(factor,x=store.viewport.w/2,y=store.viewport.h/2){const old=store.scale,ne=Math.max(.14,Math.min(3.5,old*factor));
 store.tx=x-(x-store.tx)*ne/old;store.ty=y-(y-store.ty)*ne/old;store.scale=ne;finishCanvasTransform();}
const world=({x,y})=>({x:(x-store.tx)/store.scale,y:(y-store.ty)/store.scale});
const mousePos=e=>{const b=dragRect??$('canvas').getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};};
const touchPoints=new Map();
let pinch=null;
const pinchGeometry=()=>{const [a,b]=[...touchPoints.values()];return{distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
const zoneType=z=>flag(z.human_start)||flag(z.computer_start)?'start':flag(z.treasure)||flag(z.junction)?'treasure':'neutral';
const zoneLabel=z=>flag(z.human_start)?'Игрок':flag(z.computer_start)?'Компьютер':flag(z.treasure)?'Сокровища':flag(z.junction)?'Перекрёсток':'Нейтральная';
const swordCount=zone=>({weak:1,avg:2,average:2,normal:2,strong:3})[String(zone.monster_strength??'').trim().toLowerCase()]||Math.min(3,Math.max(0,parseInt(zone.monster_strength)||0));

/** Choose a visible outside-card stub for connections whose other endpoint is missing. */
function danglingConnectors(map){
 const result=new Map(),used=[];
 const positions=Object.values(map.layout??{});
 if(!positions.length)return result;
 const cx=positions.reduce((n,p)=>n+p.x+CARD_W/2,0)/positions.length;
 const cy=positions.reduce((n,p)=>n+p.y+CARD_H/2,0)/positions.length;
 const dirs=[[1,0],[0,1],[-1,0],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]];
 const intersects=(rect,x,y)=>x>rect.x&&x<rect.x+rect.w&&y>rect.y&&y<rect.y+rect.h;
 const boxes=positions.map(p=>({x:p.x-20,y:p.y-20,w:CARD_W+40,h:CARD_H+40}));
 map.connections.forEach((c,i)=>{
  const a=map.layout[c.zone1.trim()],b=map.layout[c.zone2.trim()];
  if(Boolean(a)===Boolean(b))return;
  const pt=a||b,ox=pt.x+CARD_W/2,oy=pt.y+CARD_H/2;
  const value=compactExact(String(c.value??'').trim());
  const labelW=Math.max(44,value.length*9+22);
  const candidates=dirs.map(([dx,dy],j)=>{
   const edgeDist=Math.min(CARD_W/2/(Math.abs(dx)||.00001),CARD_H/2/(Math.abs(dy)||.00001));
   const sx=ox+dx*(edgeDist+10),sy=oy+dy*(edgeDist+10);
   const lx=sx+dx*75,ly=sy+dy*75,ex=sx+dx*148,ey=sy+dy*148;
   let penalty=0;
   const sourceIndex=positions.indexOf(pt);
   boxes.forEach((box,k)=>{if(k===sourceIndex)return;
    for(let t=0;t<=12;t++){if(intersects(box,sx+(ex-sx)*t/12,sy+(ey-sy)*t/12)){penalty+=200;break;}}
    if(lx+labelW/2>box.x&&lx-labelW/2<box.x+box.w&&ly+14>box.y&&ly-14<box.y+box.h)penalty+=350;
   });
   for(const old of used)if(Math.abs(old.x-lx)<(old.w+labelW)/2+20&&Math.abs(old.y-ly)<40)penalty+=500;
   // Prefer the exterior side of the diagram when alternatives are equally clear.
   penalty-=((ox-cx)*dx+(oy-cy)*dy)*.005;
   return {sx,sy,lx,ly,ex,ey,penalty,j};
  }).sort((a,b)=>a.penalty-b.penalty||a.j-b.j);
  const p=candidates[0];used.push({x:p.lx,y:p.ly,w:labelW});
  result.set(i,{d:`M${p.sx} ${p.sy} L${p.ex} ${p.ey}`,x:p.lx,y:p.ly,ex:p.ex,ey:p.ey});
 });
 return result;
}
// The icon symbols are shipped with the page, so diagram and PNG export stay offline.
const GLYPH_COLORS={chest:'#cc9957',swords:'#ccd2dd'};
const svgIcon=(name,x,y,size,color='')=>`<use class="h3-icon h3-icon-${esc(name)}" href="#h3-${esc(String(name).toLowerCase())}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
function smallSlot(kind,name,entry,x,y,owner='0'){
  const label=compactExact(entry.min)+entry.suffix,raw=entry.min+(entry.density?' / '+entry.density:'');
  const colored=kind==='town'&&entry.faction==='player'&&+owner>=1&&+owner<=8;
  const symbol=kind==='town'?(name==='castle'?'fort':'village')+'-'+(colored?owner:'neutral'):name;
  const metadata=kind==='mine'?`data-resource="${esc(entry.resource)}"`:`data-faction="${esc(entry.faction)}" data-building="${esc(name)}"`;
  return `<g class="h3-slot h3-slot-${kind} ${Number(entry.min)===0?'optional':''}" ${metadata} data-count-raw="${esc(entry.min)}" data-density-raw="${esc(entry.density)}">
    <title>${esc((kind==='mine'?entry.resource:entry.faction+' '+name)+': '+raw)}</title>
    ${svgIcon(symbol,x,y,40)}<text class="h3-slot-count ${label.length>5?'count-condensed':''}" x="${x+20}" y="${y+44}" text-anchor="middle">${esc(label)}</text></g>`;
}
function canvasMarkup(map){
 const nodesById=new Map(map.zones.map(z=>[z.id.trim(),z]));
 const visibleStubs=danglingConnectors(map);
 const geometry=connectionGeometry(map.connections,map.layout,{width:CARD_W,height:CARD_H,
   labelWidths:map.connections.map(c=>{const value=String(c.value??'').trim();
     const label=String(c.border_guard??'').trim().toLowerCase()==='x'?'┃':value&&value!=='0'?compactExact(value):'';
     return label?Math.max(44,label.length*14+20):0;})});
 const edges=map.connections.map((c,i)=>{
  const a=map.layout[c.zone1.trim()],b=map.layout[c.zone2.trim()],ok=!!(a&&b),visual=connectionAppearance(c);
  let path;let className=`connection ${store.selected.kind==='connection'&&store.selected.index===i?'selected':''} ${visual.wide?'conn-wide':''} ${visual.fictive?'conn-fictive':''} ${visual.roadRequired?'conn-road-required':''} ${visual.roadForbidden?'conn-roadless':''} ${visual.border?'conn-border':''} ${visual.type==='teleport'?'conn-teleport':''} ${ok?'':'dangling'}`;
  if(ok){path=geometry[i];}
  else if(a||b){path=visibleStubs.get(i);}
  else{const lastX=Math.max(...Object.values(map.layout??{}).map(pt=>pt.x+CARD_W),CARD_W),x=lastX+36,y=Math.min(...Object.values(map.layout??{}).map(pt=>pt.y),110)+36+(i%8)*54;path={d:`M${x} ${y} l88 0`,x:x+44,y:y};}
  const raw=strVal(c.value).trim(),label=!a&&!b?'⚠':visual.border?'┃':raw&&raw!=='0'?compactExact(raw):'';
  const textW=Math.max(44,label.length*14+20);
  return `<g class="${className}" data-conn-index="${i}" data-parallel-count="${path.total||1}" data-lane="${path.lane??0}" data-value-raw="${esc(raw)}" aria-label="${esc('Connection '+c.zone1+' to '+c.zone2+', exact guard value '+(raw||'0'))}"><title>${esc('Connection '+c.zone1+'–'+c.zone2+'; guard '+(raw||'0')+(visual.wide?'; wide':'')+(visual.roadRequired?'; road required':'')+(visual.roadForbidden?'; roads forbidden':''))}</title>
    <path class="conn-line" d="${path.d}"/>${visual.roadRequired?`<path class="conn-road-overlay" d="${path.d}"/>`:''}<path class="conn-hit" d="${path.d}"/>
    ${path.ex!==undefined?`<circle class="conn-terminal" cx="${path.ex}" cy="${path.ey}" r="5"/>`:''}
    ${label?`<rect class="conn-label-bg" x="${path.x-textW/2}" y="${path.y-18}" width="${textW}" height="36" rx="8"/><text class="conn-label" x="${path.x}" y="${path.y}">${esc(label)}</text>`:''}</g>`;
 }).join('');
 const zones=map.zones.map((z,i)=>{
  const p=map.layout[z.id]??{x:110+i*240,y:120},appearance=zoneAppearance(z),selected=store.selected.kind==='zone'&&store.selected.index===i;
  const owner=appearance.owner||'0',towns=townEntries(z),mines=mineEntries(z),strength=String(z.monster_strength??'').trim().toLowerCase();
  const swords=swordCount(z);
  // Keep factions distinct (player-colored roofs versus neutral-gray roofs).
  const playerTowns=towns.filter(t=>t.faction==='player'),neutralTowns=towns.filter(t=>t.faction==='neutral');
  const townRow=(playerTowns.length?`<text class="node-section-caption" x="9" y="85">P:</text>`+playerTowns.map((entry,j)=>smallSlot('town',entry.kind,entry,32+j*44,70,owner)).join(''):'')+
    (neutralTowns.length?`<text class="node-section-caption" x="${playerTowns.length?117:9}" y="85">N:</text>`+neutralTowns.map((entry,j)=>smallSlot('town',entry.kind,entry,(playerTowns.length?138:32)+j*44,70)).join(''):'');
  const mineStart=towns.length?120:79;
  const mineRow=mines.map((entry,j)=>smallSlot('mine',entry.resource,entry,7+(j%5)*44,mineStart+Math.floor(j/5)*43)).join('');
  const placement=String(z.zone_options?.placement??'').trim().toLowerCase();
  const groundIcon=['ground','underground'].includes(placement)?`<text class="node-placement" x="${CARD_W-50}" y="58">${placement==='ground'?'↑':'↓'}</text>`:'';
  const modified=Boolean(String(z.zone_options?.objects??'').trim());
  return `<g class="node ${selected?'selected':''}" data-zone-index="${i}" data-owner="${owner}" data-richness="${appearance.richness}" data-junction="${appearance.junction?'true':'false'}" transform="translate(${p.x} ${p.y})" role="button" tabindex="0" aria-label="${esc('Zone '+z.id+', '+(appearance.owner?'player '+appearance.owner:'neutral')+', treasure '+appearance.score)}">
    <title>${esc('Zone '+z.id+' | treasure '+appearance.score+' | size '+(z.base_size||'—')+' | '+mines.map(m=>m.resource+' '+m.min+(m.density?'/'+m.density:'')).join(', '))}</title>
    <rect class="node-border" width="${CARD_W}" height="${CARD_H}" rx="8"/>
    ${appearance.junction?`<rect class="node-junction-rim" width="${CARD_W-14}" height="${CARD_H-14}" x="7" y="7" rx="5"/>`:''}
    <g class="node-head">${svgIcon('chest',6,3,43)}<text class="node-treasure" x="55" y="35" ${String(compactExact(appearance.score)).length>4?'style="font-size:24px"':String(compactExact(appearance.score)).length>3?'style="font-size:29px"':''}>${esc(compactExact(appearance.score))}${modified?'*':''}</text>
    ${Array.from({length:swords},(_,j)=>svgIcon('swords',CARD_W-7-(j+1)*30,7,30)).join('')}
    <text class="node-size" x="11" y="62">S ${esc(z.base_size||'—')}</text>${appearance.computer?`<text class="node-cpu" x="${CARD_W-14}" y="61" text-anchor="end">CPU</text>`:''}</g>
    ${townRow}
    ${mineRow}${groundIcon}
    <text class="node-id-label" x="${CARD_W-10}" y="${CARD_H-9}" text-anchor="end">${esc(z.id)}</text></g>`;
 }).join('');return edges+zones;
}

const strVal=v=>String(v??'');

// The canvas legend describes only symbols present in the selected map. It intentionally
// lives outside the SVG so it remains readable regardless of the current zoom.
const legendWords=(ru,en)=>getLanguage()==='ru'?ru:en;
const legendIcon=name=>`<svg class="legend-icon" viewBox="0 0 64 64" aria-hidden="true"><use href="#h3-${esc(name)}" width="64" height="64"/></svg>`;
const legendSwatch=color=>`<span class="legend-swatch" style="background:${color}"></span>`;
const legendItem=(symbol,description)=>`<div class="legend-item">${symbol}<span>${esc(description)}</span></div>`;
const legendSection=(name,items)=>items.length?`<section class="legend-section"><h3>${esc(name)}</h3>${items.join('')}</section>`:'';
const legendLine=(cls='')=>`<svg class="legend-conn ${cls}" viewBox="0 0 36 24" aria-hidden="true"><line x1="2" y1="12" x2="34" y2="12"/>${cls==='road-required'?'<line class="overlay" x1="2" y1="12" x2="34" y2="12"/>':''}</svg>`;
const legendValue=value=>`<span class="legend-example">${esc(value)}</span>`;
function renderLegend(){
 const panel=$('canvas-legend'),content=$('legend-content'),map=current();
 panel.hidden=!map?.zones.length;
 if(panel.hidden){content.replaceChildren();return;}
 $('legend-heading').textContent=legendWords('Обозначения','Legend');
 const zones=map.zones,links=map.connections,looks=zones.map(zoneAppearance);
 const owners=[...new Set(looks.map(a=>a.owner).filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
 const palette=['#e64d4d','#7083e7','#c8ac84','#79c662','#e47f16','#a878b3','#55c0c3','#db98a7'];
 const ownerNamesRu=['Красный','Синий','Коричневый','Зелёный','Оранжевый','Фиолетовый','Бирюзовый','Розовый'];
 const ownerNamesEn=['Red','Blue','Tan','Green','Orange','Purple','Teal','Pink'];
 const zoneRows=owners.map(id=>legendItem(legendSwatch(palette[Number(id)-1]),legendWords('Стартовая зона игрока: '+ownerNamesRu[Number(id)-1],'Player start: '+ownerNamesEn[Number(id)-1])));
 for(const [kind,paint,ru,en] of [
   ['low','var(--neutral-low)','Нейтральная зона: бедное наполнение','Neutral: low richness'],
   ['mid','linear-gradient(135deg,#9fa6b2 0%,#eef2f6 36%,#a4acb7 67%,#d9dee5 100%)','Нейтральная зона: богатое наполнение','Neutral: rich'],
   ['high','linear-gradient(135deg,#d5a448 0%,#fff0b7 37%,#d5a147 66%,#ffe4a0 100%)','Нейтральная зона: очень богатое наполнение','Neutral: very rich']
 ])if(looks.some(a=>!a.owner&&a.richness===kind))zoneRows.push(legendItem(legendSwatch(paint),legendWords(ru,en)));
 if(looks.some(a=>a.junction))zoneRows.push(legendItem('<span class="legend-rim"></span>',legendWords('Толстая серая рамка: зона-перекрёсток','Thick gray border: junction zone')));
 if(store.selected.kind==='zone'&&zones[store.selected.index])zoneRows.push(legendItem('<span class="legend-rim legend-selected-rim"></span>',legendWords('Синяя рамка: выбранная зона','Blue border: selected zone')));
 if(looks.some(a=>a.computer))zoneRows.push(legendItem(legendValue('CPU'),legendWords('Начальная зона компьютера','Computer-only start')));
 if(zones.some(z=>['ground','underground'].includes(String(z.zone_options?.placement??'').trim().toLowerCase()))){
   if(zones.some(z=>String(z.zone_options?.placement??'').trim().toLowerCase()==='ground'))zoneRows.push(legendItem(legendValue('↑'),legendWords('Зона только на поверхности','Surface-only zone')));
   if(zones.some(z=>String(z.zone_options?.placement??'').trim().toLowerCase()==='underground'))zoneRows.push(legendItem(legendValue('↓'),legendWords('Зона только под землёй','Underground-only zone')));
 }
 zoneRows.push(legendItem(legendIcon('chest'),legendWords('Число: богатство наполнения зоны'+(zones.some(z=>String(z.zone_options?.objects??'').trim())?'; * — индивидуальные параметры объектов':''),'Number: zone richness'+(zones.some(z=>String(z.zone_options?.objects??'').trim())?'; * marks custom object settings':''))));
 if(zones.some(z=>z.base_size!==''))zoneRows.push(legendItem(legendValue('S '+esc(zones.find(z=>String(z.base_size??'').trim())?.base_size||'—')),legendWords('S: относительный базовый размер зоны','S: relative base zone size')));
 zoneRows.push(legendItem(legendValue('#'+esc(zones[0].id)),legendWords('Номер зоны в правом нижнем углу','Zone ID at the bottom right')));
 const swords=[...new Set(zones.map(swordCount))].sort((a,b)=>a-b);
 const guardRows=swords.map(count=>legendItem(count?Array.from({length:count},()=>legendIcon('swords')).join(''):'<span class="legend-example">—</span>',[
   legendWords('Нет охраны объектов','Unguarded objects'),
   legendWords('Слабая охрана объектов','Weak object guards'),
   legendWords('Средняя охрана объектов','Average object guards'),
   legendWords('Сильная охрана объектов','Strong object guards')][count]));
 const townKinds=new Set(zones.flatMap(townEntries).map(t=>t.faction+':'+t.kind));
 const townRows=[];
 if([...townKinds].some(kind=>kind.startsWith('player:')))townRows.push(legendItem(legendValue('P:'),legendWords('Города игрока','Player towns')));
 if([...townKinds].some(kind=>kind.startsWith('neutral:')))townRows.push(legendItem(legendValue('N:'),legendWords('Нейтральные города','Neutral towns')));
 for(const faction of ['player','neutral'])for(const kind of ['castle','town'])if(townKinds.has(faction+':'+kind)){
   const own=owners[0]||'neutral';const symbol=(kind==='castle'?'fort':'village')+'-'+(faction==='player'?own:'neutral');
   townRows.push(legendItem(legendIcon(symbol),legendWords((faction==='player'?'Город игрока: ':'Нейтральный город: ')+(kind==='castle'?'замок':'деревня'),(faction==='player'?'Player ':'Neutral ')+(kind==='castle'?'castle':'village'))));
 }
 if(townRows.length)townRows.push(legendItem(legendValue('1/3'),legendWords('Под значком: минимальное количество / дополнительная плотность','Below icons: minimum count / extra density')));
 const resourceNames={Wood:['Дерево','Wood'],Mercury:['Ртуть','Mercury'],Ore:['Руда','Ore'],Sulfur:['Сера','Sulfur'],Crystal:['Кристаллы','Crystal'],Gems:['Самоцветы','Gems'],Gold:['Золото','Gold'],Airship:['Верфь дирижаблей','Airship shipyards']};
 const present=new Set(zones.flatMap(mineEntries).map(e=>e.resource));
 const mineRows=Object.entries(resourceNames).filter(([name])=>present.has(name)).map(([name,label])=>legendItem(name==='Airship'?legendValue('✦'):legendIcon(name.toLowerCase()),legendWords(label[0],label[1])+legendWords(' — количество/плотность шахт',' — mine count/density')));
 const appearance=links.map(connectionAppearance),connRows=[];
 if(links.length){
   if(appearance.some(a=>!a.wide&&!a.fictive&&!['teleport','monolith'].includes(a.type)))connRows.push(legendItem(legendLine(),legendWords('Обычная связь между зонами','Normal zone connection')));
   if(appearance.some(a=>a.wide))connRows.push(legendItem(legendLine('wide'),legendWords('Широкая связь без охраны','Wide, unguarded connection')));
   if([...connectionBundles(links).values()].some(rows=>rows.length>1))connRows.push(legendItem(legendLine('multi'),legendWords('Параллельные линии — отдельные связи между одними зонами; каждое число относится к своей линии','Parallel lines are separate connections between the same two zones, each with its own guard value')));
   if(appearance.some(a=>a.fictive))connRows.push(legendItem(legendLine('fictive'),legendWords('Фиктивная связь (влияет на размещение зон)','Fictive link (affects zone placement)')));
   if(appearance.some(a=>a.roadRequired))connRows.push(legendItem(legendLine('road-required'),legendWords('Обязательная дорога через связь','Required road through connection')));
   if(appearance.some(a=>a.roadForbidden))connRows.push(legendItem(legendLine('no-road'),legendWords('Дорога запрещена','Road forbidden')));
   if(appearance.some(a=>['teleport','monolith'].includes(a.type)))connRows.push(legendItem(legendLine('teleport'),legendWords('Связь через портал/монолит','Teleport/monolith connection')));
   if(appearance.some(a=>a.border))connRows.push(legendItem('<span class="legend-border-guard">┃</span>',legendWords('Связь со Стражем границы','Border Guard connection')));
   if(store.selected.kind==='connection'&&links[store.selected.index])connRows.push(legendItem(legendLine('selected'),legendWords('Выделенная связь','Selected connection')));
   if(links.some((c,i)=>!appearance[i].border&&String(c.value??'').trim()!==''&&Number(c.value)>0))connRows.push(legendItem(legendValue(compactExact(links.find((c,i)=>!appearance[i].border&&String(c.value??'').trim()!==''&&Number(c.value)>0).value)),legendWords('Ценность охраны связи, сокращённая запись','Connection guard value, abbreviated display')));
   if(links.some((c,i)=>!appearance[i].border&&(!String(c.value??'').trim()||Number(c.value)===0)))connRows.push(legendItem(legendValue('—'),legendWords('Связь без числа: нет охраны','No number: unguarded connection')));
   const ids=new Set(zones.map(z=>z.id.trim()));
   if(links.some(c=>!ids.has(c.zone1.trim())||!ids.has(c.zone2.trim())))connRows.push(legendItem(legendLine('dangling'),legendWords('Красный пунктир с точкой: отсутствующая зона в исходном шаблоне','Red dashed link and endpoint: missing zone in the source template')));
 }
 content.innerHTML=legendSection(legendWords('Зоны','Zones'),zoneRows)+legendSection(legendWords('Охрана объектов','Object guards'),guardRows)+legendSection(legendWords('Города','Towns'),townRows)+legendSection(legendWords('Ресурсы','Resources'),mineRows)+legendSection(legendWords('Связи','Connections'),connRows);
}

function renderCanvas(){const map=current();$('canvas-content').innerHTML=map?canvasMarkup(map):'';
 $('empty-hint').classList.toggle('hidden',!!map?.zones.length);$('empty-add-btn').hidden=!store.pack;
 transformCanvas();
}
function select(kind,index){store.selected={kind,index};store.tab='general';store.inspectorView='selection';store.inspectorView='selection';store.connectMode=false;
 $('inspector').classList.add('open');renderAll();}
function captureCanvasPointer(pointerId){
 // Some synthetic pointer events have no active pointer in the browser; do not
 // let them crash unrelated click-away handlers or leave a drag half-started.
 try{$('canvas').setPointerCapture(pointerId);}catch(error){if(error.name!=='NotFoundError'&&error.name!=='InvalidStateError')throw error;}
}
function handleCanvasDown(e){if(e.button!==0&&e.button!==1)return;
 dragRect=$('canvas').getBoundingClientRect();
 const btn=e.target.closest('[data-zone-index]'),conn=e.target.closest('[data-conn-index]'),p=mousePos(e);
 if(e.pointerType==='touch'){
  touchPoints.set(e.pointerId,p);
  if(touchPoints.size===2){
   const g=pinchGeometry();pinch={startDistance:Math.max(1,g.distance),startScale:store.scale,anchor:world(g)};
   store.drag=null;$('drag-preview').innerHTML='';$('canvas').classList.add('canvas-panning');
   e.preventDefault();captureCanvasPointer(e.pointerId);return;
  }
  if(touchPoints.size>2){e.preventDefault();return;}
 }
 if(conn&&!btn){dragRect=null;select('connection',+conn.dataset.connIndex);return;}
 if(btn){const i=+btn.dataset.zoneIndex,z=current()?.zones[i];if(!z)return;
  if(store.connectMode){if(!store.connectFrom){store.connectFrom=z.id;toast('Выберите вторую зону');}else{
    let from=store.connectFrom;store.connectFrom=null;store.connectMode=false;
    commit('Добавлена связь',()=>{current().connections.push(freshConnection(store.pack.format,from,z.id));store.selected={kind:'connection',index:current().connections.length-1};});
  }dragRect=null;return;}
  store.drag={type:e.altKey?'connect':'zone',index:i,from:z.id,initial:current().layout[z.id]?{...current().layout[z.id]}:{x:0,y:0},moved:false,at:p,snapshot:capture()};
  if(!e.altKey){store.selected={kind:'zone',index:i};store.inspectorView='selection';}
  if(e.pointerType!=='touch')$('inspector').classList.add('open');renderInspector();renderCanvas();
 }else{
  if(store.connectMode){store.connectMode=false;store.connectFrom=null;toast('Добавление связи отменено.');renderToolbar();}
  store.drag={type:'pan',at:p,initial:{x:store.tx,y:store.ty}};
  $('canvas').classList.add('canvas-panning');
 }
 e.preventDefault();captureCanvasPointer(e.pointerId);
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
 if(pinch){if(touchPoints.size<2){pinch=null;$('canvas').classList.remove('canvas-panning');dragRect=null;finishCanvasTransform();}store.drag=null;return;}
 const d=store.drag;if(!d){dragRect=null;return;}store.drag=null;$('drag-preview').innerHTML='';
 dragRect=null;finishCanvasTransform();$('canvas').classList.remove('canvas-panning');
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
$('canvas').addEventListener('pointercancel',e=>{touchPoints.delete(e.pointerId);pinch=null;store.drag=null;dragRect=null;$('canvas').classList.remove('canvas-panning');$('drag-preview').innerHTML='';finishCanvasTransform();});
$('canvas').addEventListener('wheel',e=>{e.preventDefault();let p=mousePos(e);zoomAt(Math.exp(-e.deltaY*.00125),p.x,p.y);},{passive:false});
$('zoom-in').onclick=()=>zoomAt(1.25);$('zoom-out').onclick=()=>zoomAt(.8);$('zoom-fit').onclick=()=>fitView();
$('canvas').addEventListener('keydown',e=>{const n=e.target.closest?.('[data-zone-index]');if(n&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select('zone',+n.dataset.zoneIndex);}});
try{new ResizeObserver(()=>{let b=$('canvas').getBoundingClientRect();store.viewport={w:b.width||700,h:b.height||500};}).observe($('canvas'));}catch{}

// Every form field is schema-backed and updated without implicit conversions.
// Numeric schema fields accept decimal digits only. Values remain strings so serialization stays byte-compatible.
const isNumericField=path=>/^(?:id|base_size|ownership|min_size|max_size|max_battle_rounds|zone1|zone2|value)$/.test(path)||
 /^(?:positions)\.(?:min_human|max_human|min_total|max_total)$/.test(path)||
 /^(?:player_towns|neutral_towns)\.(?:min_towns|min_castles|town_density|castle_density)$/.test(path)||
 /^treasure_tiers\.\d+\.(?:low|high|density)$/.test(path)||
 /^(?:min_mines|mine_density)\.[^.]+$/.test(path)||/^field_counts\.[^.]+$/.test(path)||
 /^zone_options\.(?:min_objects|zone_repulsion|monsters_joining_percentage|min_airship_shipyards|airship_shipyard_density|max_block_value)$/.test(path);
const digitsOnly=value=>String(value??'').replace(/[^0-9]/g,'');
const f=(path,label,value,{hint='',multiline=false,select=null,placeholder=''}={})=>{
 const attr=`data-path="${esc(path)}"`,v=strVal(value);
 let elem;
 if(select){const opts=[...select];if(!opts.some(x=>x[1]===v))opts.push([v,v||'(empty)']);elem=`<select ${attr}>${opts.map(([name,val])=>`<option value="${esc(val)}" ${val===v?'selected':''}>${esc(name)}</option>`).join('')}</select>`;}
 else if(multiline)elem=`<textarea ${attr} rows="3">${esc(v)}</textarea>`;
 else {const numeric=isNumericField(path);elem=`<input type="text" ${attr} ${numeric?'data-numeric="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off"':'spellcheck="false"'} value="${esc(v)}" placeholder="${esc(placeholder)}">`;}
 return `<div class="field"><label>${esc(label)}</label>${elem}${hint?`<small class="field-note">${esc(hint)}</small>`:''}</div>`;
};
const check=(path,label,value)=>`<div class="field row-field"><label for="${esc(path)}">${esc(label)}</label><input id="${esc(path)}" type="checkbox" data-path="${esc(path)}" ${flag(value)?'checked':''}></div>`;
const group=(title,body)=>`<section class="prop-group"><h3>${esc(title)}</h3>${body}</section>`;
const pair=(arr)=>`<div class="form-grid">${arr.join('')}</div>`;
const kv=(prefix,obj,entries)=>entries.map(([field,label])=>f(`${prefix}.${field}`,label,obj?.[field]));
const posLabels=[['min_human','Минимум игроков'],['max_human','Максимум игроков'],['min_total','Минимум позиций'],['max_total','Максимум позиций']];
const factions=schema=>schema.towns.map(s=>s==='Elemental'?'Conflux':s);
function inspectorSelection(){return store.inspectorView==='map'?{kind:'map',index:store.mapIndex}:store.selected;}
function selectedModel(){const pack=store.pack,map=current(),s=inspectorSelection();
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
function renderInspector(){const p=store.pack,m=current(),s=inspectorSelection();
 if(!p){$('inspector-context-tabs').innerHTML='<button type="button" data-inspector-view="map" role="tab" disabled>Параметры карты</button>';$('inspector-body').innerHTML='<div class="inspector-empty">Откройте шаблон для начала работы.</div>';return;}
 let obj=selectedModel();if(!obj){store.selected={kind:'map',index:store.mapIndex};return renderInspector();}
 const kind=s.kind;const picked=store.selected.kind;const viewTabs=[['map','Параметры карты']];if(picked==='zone'||picked==='connection')viewTabs.push(['selection',picked==='zone'?'Зона #'+current().zones[store.selected.index]?.id:'Связь '+(current().connections[store.selected.index]?.zone1??'')+' ↔ '+(current().connections[store.selected.index]?.zone2??'')]);if(picked==='pack')viewTabs.push(['selection','Параметры пакета']);$('inspector-context-tabs').innerHTML=viewTabs.map(([view,text])=>`<button type="button" data-inspector-view="${view}" role="tab" aria-selected="${(store.inspectorView==='map'?'map':'selection')===view}" title="${esc(text)}">${esc(text)}</button>`).join('');
 const label=kind==='zone'?`Зона #${obj.id}`:kind==='connection'?`Связь ${obj.zone1} ↔ ${obj.zone2}`:kind==='pack'?'Параметры пакета':'Параметры карты';
 $('inspector-title').textContent=label;
 $('inspector-subtitle').textContent=kind==='zone'?'Свойства выбранной зоны':kind==='connection'?'Свойства соединения':kind==='pack'?p.filename:m.name;
 const tabs=tabsFor(kind);if(!tabs.includes(store.tab))store.tab=tabs[0];
 $('inspector-tabs').innerHTML=tabs.map(t=>`<button type="button" data-tab="${esc(t)}" class="${t===store.tab?'active':''}">${esc(t)}</button>`).join('');
 $('inspector-body').innerHTML=kind==='zone'?zoneProps(obj,store.tab):kind==='connection'?connectionProps(obj,store.tab):kind==='pack'?packProps(p):mapProps(obj,store.tab);
 $('inspector-footer').innerHTML=kind==='zone'?`<button class="btn btn-subtle" data-inspector-action="duplicate">${icon('copy',15)} Дублировать</button><button class="btn btn-subtle danger" data-inspector-action="delete">${icon('trash',15)} Удалить</button>`:
 kind==='connection'?`<button class="btn btn-subtle danger" data-inspector-action="delete">${icon('trash',15)} Удалить связь</button>`:
 kind==='map'?`<button class="btn btn-subtle" data-inspector-action="duplicate">${icon('copy',15)} Дублировать</button><button class="btn btn-subtle danger" data-inspector-action="delete">${icon('trash',15)} Удалить карту</button>`:'';
}
$('inspector-context-tabs').addEventListener('click',e=>{const button=e.target.closest('[data-inspector-view]');if(!button||button.disabled)return;store.inspectorView=button.dataset.inspectorView;store.tab=store.inspectorView==='map'?'Карта':'Основное';renderInspector();});
$('inspector-tabs').addEventListener('click',e=>{const el=e.target.closest('[data-tab]');if(el){store.tab=el.dataset.tab;renderInspector();}});
// Live preview updates the model on each keystroke, but expensive diagram updates
// are coalesced to one animation frame and one undo entry per editing session.
const liveEdits=new WeakMap();
let liveRefreshId=0;
function scheduleInspectorPreview(){
 if(liveRefreshId)return;
 liveRefreshId=requestAnimationFrame(()=>{
  liveRefreshId=0;
  renderSidebar();renderToolbar();renderCanvas();renderLegend();renderStatus();
 });
}
$('inspector-body').addEventListener('beforeinput',e=>{
 const field=e.target.closest?.('[data-numeric="1"]');
 if(!field||e.isComposing||!e.inputType?.startsWith('insert')||e.data==null)return;
 if(/[^0-9]/.test(e.data))e.preventDefault();
});
$('inspector-body').addEventListener('input',e=>{
 const field=e.target.closest('[data-path]');
 if(!field||field.type==='checkbox'||field.tagName==='SELECT'||e.isComposing)return;
 if(field.dataset.numeric==='1'){const clean=digitsOnly(field.value);if(clean!==field.value)field.value=clean;}
 const selection=inspectorSelection(),path=field.dataset.path.split('.'),model=selectedModel();if(!model)return;
 // Renaming a zone must atomically update all links, layout keys and object hints.
 if(selection.kind==='zone'&&path.length===1&&path[0]==='id')return;
 let obj=model;for(let i=0;i<path.length-1;i++){if(obj[path[i]]==null)obj[path[i]]={};obj=obj[path[i]];}
 const key=path.at(-1),value=field.value;
 if(obj[key]===value)return;
 if(!liveEdits.has(field))liveEdits.set(field,{snapshot:capture(),selection:{...store.selected},tab:store.tab,label:'Updated: '+path.join(' / ')});
 obj[key]=value;store.pack.dirty=true;scheduleInspectorPreview();
});
function finishLiveEdit(field){
 const edit=liveEdits.get(field);if(!edit)return false;
 liveEdits.delete(field);
 if(edit.snapshot!==capture()){
  store.undo.push(edit);if(store.undo.length>(store.pack.maps.length>90?18:50))store.undo.shift();store.redo=[];
  store.pack.dirty=true;persistLayout();if(liveRefreshId){cancelAnimationFrame(liveRefreshId);liveRefreshId=0;}
  renderAll();status(edit.label);
 }
 return true;
}
$('inspector-body').addEventListener('change',e=>{
 const field=e.target.closest('[data-path]');if(!field)return;
 if(finishLiveEdit(field))return;
 if(field.dataset.numeric==='1'){const clean=digitsOnly(field.value);if(clean!==field.value)field.value=clean;}
 const path=field.dataset.path.split('.'),selected=selectedModel();if(!selected)return;
 const value=field.type==='checkbox'?(field.checked?'x':''):field.value;
 let obj=selected;for(let i=0;i<path.length-1;i++){if(obj[path[i]]==null)obj[path[i]]={};obj=obj[path[i]];}
 const key=path.at(-1),before=obj[key];if(before===value)return;
 if(inspectorSelection().kind==='zone'&&path.length===1&&key==='id'){
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
$('inspector-footer').addEventListener('click',e=>{const btn=e.target.closest('[data-inspector-action]');if(!btn)return;const action=btn.dataset.inspectorAction,s=inspectorSelection();
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
function doLayout(){commit('Расстановка зон',()=>{const map=current();map.layout=recommendedLayout(map,store.mapIndex);map.layoutDirty=true;});fitView();}
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
async function performSave(format){
 if(!store.pack)return;
 const source=store.pack;
 try{
  const converted=format===source.format?structuredClone(source):convertPack(source,format,{packName:source.filename.replace(/\.[^.]+$/,'')});
  if(SCHEMA.formats[format].isHota)for(const m of converted.maps)if(m.layoutDirty)saveImagePositions(m);
  const output=serializePack(converted),name=fileName(format);
  // showSaveFilePicker must run directly in a user gesture; do not await before invoking it.
  if(typeof window.showSaveFilePicker!=='function'){
   modal('Save as',`<p>${esc(getLanguage()==='ru'?'Ваш браузер не поддерживает системный диалог выбора файла. Нажмите «Скачать», чтобы явно разрешить загрузку, или воспользуйтесь Chrome/Edge на компьютере.':'Your browser does not support the native Save as file picker. Choose Download explicitly, or use desktop Chrome/Edge.')}</p>`,[
    {label:getLanguage()==='ru'?'Отмена':'Cancel'},
    {label:getLanguage()==='ru'?'Скачать':'Download',primary:true,handler:()=>{download(output.bytes,name);status(getLanguage()==='ru'?'Загрузка запрошена: '+name:'Download requested: '+name);}}
   ]);
   return;
  }
  const handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:format==='sod'?'SoD template':'HotA template',accept:{'application/octet-stream':[format==='sod'?'.txt':'.h3t']}}]});
  const writer=await handle.createWritable();
  try{await writer.write(output.bytes);await writer.close();}
  catch(error){try{await writer.abort();}catch{}throw error;}
  if(format===source.format){
   if(SCHEMA.formats[format].isHota)for(let i=0;i<source.maps.length;i++)if(source.maps[i].layoutDirty){
    source.maps[i].zones.forEach((z,j)=>{z.zone_options.image_settings=converted.maps[i].zones[j].zone_options.image_settings;});
    source.maps[i].layoutDirty=false;
   }
   source.originalBytes=output.bytes;source.dirty=false;
  }
  renderAll();status(`Saved: ${handle.name||name} (${upper(format)})`);toast(getLanguage()==='ru'?'Сохранено: '+(handle.name||name):'Saved: '+(handle.name||name));
  if(output.warnings.some(w=>/replaced/i.test(w)))modal('Encoding warning',output.warnings.filter(w=>/replaced/i.test(w)).map(esc).join('<br>'));
 }catch(error){
  if(error?.name==='AbortError'){status(getLanguage()==='ru'?'Сохранение отменено.':'Save cancelled.');return;}
  console.error('Save failed:',error);toast((getLanguage()==='ru'?'Ошибка сохранения: ':'Save failed: ')+(error?.message||error));
 }
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
    try{localStorage.setItem(layoutStorageKey(i),JSON.stringify(map.layout));}catch{}
  }
 });fitView();toast(`Позиции восстановлены: ${positions.size} карт`);
 }catch(e){toast('Layout import failed: '+e.message);}}
function svgStyles(){
  const root=getComputedStyle(document.documentElement),v=name=>root.getPropertyValue('--'+name).trim();
  const colors=['red','blue','tan','green','orange','purple','teal','pink'];
  const owners=colors.map((name,i)=>`.node[data-owner="${i+1}"] .node-border{fill:${v('player-'+name)}}`).join('');
  return `${owners}.node[data-owner="0"][data-richness="low"] .node-border{fill:${v('neutral-low')}}.node[data-owner="0"][data-richness="mid"] .node-border{fill:url(#zone-silver)}.node[data-owner="0"][data-richness="high"] .node-border{fill:url(#zone-gold)}
  .node-border{stroke:${v('card-edge')};stroke-width:1.7}.node .node-junction-rim{stroke:#707780;stroke-width:10;fill:none}.node text{font-family:Arial,sans-serif;fill:${v('zone-text')};font-weight:700}
  .node-treasure{font-size:32px;font-weight:850}.node-size{font-size:15px}.node-id-label{font-size:23px}.h3-slot-count{font-size:14px;font-weight:850}.h3-slot-count.count-condensed{font-size:11px}.node-section-caption{font-size:14px}.node-cpu,.node-placement{font-size:12px;font-weight:800}
  .conn-line{fill:none;stroke:${v('soft')};stroke-width:2}.conn-hit{display:none}.conn-wide .conn-line{stroke-width:6}.conn-fictive .conn-line{stroke-dasharray:2 9}.conn-roadless .conn-line{stroke-dasharray:11 7}.conn-road-overlay{fill:none;stroke:white;stroke-width:1;stroke-dasharray:5 6}.conn-teleport .conn-line{stroke:${v('accent')};stroke-dasharray:6 4}.dangling .conn-line{stroke:${v('error')};stroke-dasharray:6 5}
  .conn-label-bg{fill:${v('conn-label-bg')};stroke:${v('line')}}.conn-label{fill:${v('conn-label')};font:750 24px Arial;text-anchor:middle;dominant-baseline:middle}`;
}

async function exportPNG(){if(!current()?.zones.length)return;const map=current(),b=bounds(map),pad=54,w=Math.ceil(b.w+pad*2),h=Math.ceil(b.h+pad*2),cs=getComputedStyle(document.documentElement);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${document.querySelector('.sprite').innerHTML}</defs><style>${svgStyles()}</style><rect width="100%" height="100%" fill="${cs.getPropertyValue('--canvas').trim()}"/><g transform="translate(${pad-b.x} ${pad-b.y})">${canvasMarkup(map)}</g></svg>`;
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
function helpDialog(){
 if(getLanguage()==='en'){
  modal('Help · H3 Template Studio',`<p><strong>All processing is local:</strong> your templates stay on your device.</p>
    <h3>Files</h3><ul><li>Open HotA 1.7/1.8 <code>.h3t</code> or SoD <code>.txt</code> using Open or drag a file onto the canvas.</li>
    <li>Save downloads the current format. To convert, select the target version and click Convert.</li>
    <li>Export a <code>.h3tc-layout.json</code> sidecar for SoD; moved HotA zones update their <code>image_settings</code> when saved.</li></ul>
    <h3>Canvas</h3><ul><li>Scroll or use −/+ to zoom. Drag the background to pan; use Fit to see all zones.</li>
    <li>Drag zones to reposition them. Alt + drag from one zone to another, or select Connection and then click two zones.</li>
    <li>Click a zone or connection to edit its full schema-backed properties in the right panel. Icons show towns, castles and resource mines.</li></ul>
    <h3>Keyboard shortcuts</h3><ul><li>Ctrl+O Open; Ctrl+S Save; Ctrl+Z / Ctrl+Y Undo / Redo.</li>
    <li>Delete removes the selected item after confirmation. Ctrl+0 fits the graph, Ctrl+Shift++/- changes spacing; Esc cancels link mode.</li></ul>
    <h3>Installation</h3><p>Open this site over HTTPS and choose Install in Chrome or Edge. On iPhone/iPad, choose Share → Add to Home Screen. Resources are cached for offline use.</p>
    <p class="field-note">A separate browser implementation based on MIT-licensed sokie/heroes3-template-util.</p>`,[{label:'Close'}]);
  return;
 }
modal('Справка · H3 Template Studio',`<p><strong>Редактор работает локально:</strong> ваши шаблоны остаются в браузере и скачиваются на компьютер.</p>
 <h3>Файлы</h3><ul><li>Откройте <code>.h3t</code> (HotA 1.7/1.8) или <code>.txt</code> (SoD) кнопкой «Открыть» либо перетащите файл на схему.</li><li>Сохранение в исходном формате — «Сохранить». Конвертация — выберите формат и нажмите «Конвертировать».</li><li>Для SoD сохраняйте положение всех карт в совместимом с исходным редактором файле <code>.h3tc-layout.json</code>. В HotA новые координаты записываются в <code>image_settings</code>.</li></ul>
 <h3>Полотно</h3><ul><li>Колесо мыши или кнопки −/+ — изменение масштаба; фон — перетаскивание; «Вместить» — разместить карту по экрану.</li><li>Перетаскивайте зоны; <code>Alt + перетаскивание</code> между зонами создаёт связь; также можно использовать кнопку «Связь» и два клика.</li><li>Выберите зону или связь для редактирования всех параметров в правой панели.</li></ul>
 <h3>Горячие клавиши</h3><ul><li><code>Ctrl+O</code> — открыть; <code>Ctrl+S</code> — сохранить; <code>Ctrl+Z</code> / <code>Ctrl+Y</code> — отменить / повторить.</li><li><code>Delete</code> — удалить выделенную зону/связь (с подтверждением).</li><li><code>Ctrl+0</code> — вместить; <code>Ctrl+Shift++/-</code> — раздвинуть/сблизить; <code>Esc</code> — отменить создание связи / закрыть панели.</li></ul>
 <h3>Установка</h3><p>Нажмите «Установить» в Chrome/Edge на HTTPS. На iPhone/iPad: Share → Add to Home Screen. После первого открытия приложение сохраняет основные ресурсы для автономной работы.</p>
 <p class="field-note">Основано на MIT-лицензированном sokie/heroes3-template-util; браузерная версия является отдельной реализацией.</p>`,[{label:'Закрыть'}]);}
async function installApp(){if(store.installPrompt){
  const prompt=store.installPrompt;store.installPrompt=null;
  try{await prompt.prompt();const result=await prompt.userChoice;
   if(result?.outcome==='accepted')toast(getLanguage()==='ru'?'Приложение устанавливается.':'App installation is in progress.');
   return;
  }catch(error){console.info('Native install prompt already consumed or unavailable:',error);}
 }

 const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 if(standalone){toast('Приложение уже открыто в установленном режиме.');return;}
 if(getLanguage()==='en'){
  modal('Install application',`<p>Open this app over HTTPS (for example, on GitHub Pages) and use your browser's install menu.</p><ul>
   <li><b>Chrome / Edge:</b> choose Install app in the ⋮ menu or use the address-bar install icon.</li>
   <li><b>iPhone / iPad (Safari):</b> Share → Add to Home Screen.</li>
   <li><b>Android:</b> accept the browser installation, then check your app drawer. Some launchers require you to add the installed app to the home screen manually.</li>
   <li><b>Firefox:</b> desktop PWA installation may not be supported. Use Add to Home Screen on supported mobile devices.</li></ul>
   <p>After the first load, you can work offline with local template files.</p>`,[{label:'Close'}]);return;
 }
 modal('Установка приложения',`<p>Установка доступна через меню браузера при открытии сайта по HTTPS (например, на GitHub Pages).</p><ul><li><b>Chrome / Edge:</b> меню ⋮ → «Установить приложение» или значок установки в адресной строке.</li><li><b>iPhone / iPad (Safari):</b> «Поделиться» → «На экран Домой».</li><li><b>Firefox:</b> встроенная установка PWA на компьютере может быть недоступна; используйте «Добавить на главный экран» на поддерживаемом телефоне.</li></ul><p>После первого открытия сайт может работать без интернета; для больших шаблонов откройте локальные файлы после установки.</p>`,[{label:'Закрыть'}]);
}
// Allow Chrome to show its own install banner. The user may also use our Install
// button while the saved event remains promptable; never claim that an icon is installed.
window.addEventListener('beforeinstallprompt',event=>{store.installPrompt=event;$('install-btn').title='Установить приложение';});
window.addEventListener('appinstalled',()=>{store.installPrompt=null;toast(getLanguage()==='ru'?'Приложение установлено. Если значка нет на главном экране Android, найдите приложение в списке всех приложений и добавьте значок вручную.':'App installed. On Android, find the app in the app drawer and add its icon to your home screen if needed.');});
function runAction(action){$('more-menu').classList.add('hidden');if(!current())return;
 if(action==='layout')doLayout();else if(action==='spread')changeSpread(1.17);else if(action==='compact')changeSpread(.84);
 else if(action.startsWith('reid-'))doReid(action.slice(5));
 else if(action==='duplicate-map')duplicateMap();else if(action==='remove-map')confirmAction('Удаление карты',`Удалить карту ${esc(current().name)}?`,removeMap);
 else if(action==='png')exportPNG();else if(action==='export-layout')saveLayout();else if(action==='import-layout')$('layout-input').click();
}
$('more-menu').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)runAction(b.dataset.action);});
$('more-btn').onclick=()=>$('more-menu').classList.toggle('hidden');
document.addEventListener('pointerdown',e=>{
 if(!e.target.closest('#more-menu,#more-btn'))$('more-menu').classList.add('hidden');
 if(!e.target.closest('#canvas-legend'))$('canvas-legend').open=false;
 if(window.matchMedia('(max-width:970px)').matches&&$('inspector').classList.contains('open')&&
    !e.target.closest('#inspector,#canvas [data-zone-index],#canvas [data-conn-index]'))$('inspector').classList.remove('open');
},true);
$('open-btn').onclick=()=>$('file-input').click();
$('file-input').onchange=e=>{openFile(e.target.files[0]);e.target.value='';};
$('layout-input').onchange=e=>{if(e.target.files[0])importLayout(e.target.files[0]);e.target.value='';};
$('save-btn').onclick=()=>askSave(store.pack?.format);
$('convert-btn').onclick=()=>askSave($('export-format').value);
$('add-map-btn').onclick=addMap;
$('add-zone-btn').onclick=addZone;$('empty-add-btn').onclick=addZone;
$('add-conn-btn').onclick=addConnection;
$('undo-btn').onclick=undo;$('redo-btn').onclick=redo;
$('pack-props-btn').onclick=()=>{store.selected={kind:'pack',index:0};store.inspectorView='selection';store.tab='Пакет';renderInspector();$('inspector').classList.add('open');$('sidebar').classList.remove('open');};
$('validate-btn').onclick=validateDialog;$('new-pack-btn').onclick=newPackDialog;
$('language-select').onchange=event=>{setLanguage(event.target.value);renderLegend();const placeholder=$('built-in-select').options[0];if(placeholder)placeholder.text=getLanguage()==='ru'?'Выберите встроенный шаблон…':translateText('Выберите встроенный шаблон…');};
initializeLanguage();
$('theme-btn').onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';setTheme(t);};
function setTheme(t){document.documentElement.dataset.theme=t;$('theme-btn').innerHTML=icon(t==='dark'?'sun':'moon');renderCanvas();
 document.querySelector('meta[name="theme-color"]').content=t==='dark'?'#111827':'#ffffff';
 try{localStorage.setItem('h3tc-theme',t);}catch{}
}
$('install-btn').onclick=installApp;$('help-btn').onclick=helpDialog;
$('sidebar-toggle').onclick=()=>$('sidebar').classList.toggle('open');
document.addEventListener('pointerdown',event=>{if($('sidebar').classList.contains('open')&&!event.target.closest('#sidebar,#sidebar-toggle'))$('sidebar').classList.remove('open');});
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
 if(e.key==='Escape'){store.connectMode=false;store.connectFrom=null;$('canvas-legend').open=false;$('more-menu').classList.add('hidden');$('sidebar').classList.remove('open');$('inspector').classList.remove('open');renderToolbar();}
 if(!editing&&(e.key==='Delete'||e.key==='Backspace')&&['zone','connection'].includes(store.selected.kind)){
  e.preventDefault();$('inspector-footer').querySelector('[data-inspector-action="delete"]')?.click();
 }
});
window.addEventListener('beforeunload',e=>{if(store.pack?.dirty&&store.pack.originalBytes){e.preventDefault();e.returnValue='';}});
try{setTheme(localStorage.getItem('h3tc-theme')==='light'?'light':'dark');}catch{setTheme('dark');}
if('serviceWorker' in navigator&&location.protocol.startsWith('http')){
 let reloadingForWorker=false;
 const hadController=Boolean(navigator.serviceWorker.controller);
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(hadController&&!reloadingForWorker){reloadingForWorker=true;location.reload();}
 });
 window.addEventListener('load',async()=>{
  try{
   // Version the worker URL and bypass the HTTP cache during update checks. This
   // prevents an installed PWA from reopening with JS/CSS from an older release.
   const registration=await navigator.serviceWorker.register('./sw.js?v=1.5.1',{scope:'./',updateViaCache:'none'});
   await registration.update();
   if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
  }catch(e){console.warn('Service worker unavailable:',e);}
 });
}
renderAll();initializeCatalog();
