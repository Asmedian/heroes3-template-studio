/** Presentation-only helpers. Raw template fields are never rewritten or rounded. */
export const PLAYER_PALETTE=Object.freeze({
  '1':'red','2':'blue','3':'tan','4':'green','5':'orange','6':'purple','7':'teal','8':'pink'
});
export const RESOURCES=['Wood','Mercury','Ore','Sulfur','Crystal','Gems','Gold'];
export const RESOURCE_LABELS={Wood:'Wood',Mercury:'Mercury',Ore:'Ore',Sulfur:'Sulfur',Crystal:'Crystal',Gems:'Gems',Gold:'Gold'};
export function compactExact(value){
  const raw=String(value??'').trim();
  if(!/^-?\d+(?:\.\d+)?$/.test(raw))return raw;
  const negative=raw.startsWith('-');
  const [whole,decimal='']=raw.replace(/^-/, '').split('.');
  const digits=whole.replace(/^0+(?=\d)/,'');
  const magnitude=digits.length>9?9:digits.length>6?6:digits.length>3?3:0;
  if(!magnitude)return raw;
  const unit={3:'k',6:'m',9:'b'}[magnitude];
  const lead=digits.slice(0,-magnitude)||'0', fractional=(digits.slice(-magnitude)+decimal).replace(/0+$/,'');
  return (negative?'-':'')+lead+(fractional?'.'+fractional:'')+unit;
}
const amount=value=>{const number=Number(String(value??'').trim());return Number.isFinite(number)?number:0;};
export function treasureScore(zone){
  return Math.trunc((zone.treasure_tiers??[]).reduce((sum,t)=>{
    const low=amount(t.low),high=amount(t.high),density=amount(t.density);
    return sum+(low+high)/2*density;
  },0)/1000);
}
export function zoneAppearance(zone){
  const start=String(zone.human_start??'').toLowerCase().trim()==='x'||String(zone.computer_start??'').toLowerCase().trim()==='x';
  const owner=String(zone.ownership??'').trim();
  const score=treasureScore(zone);
  return {owner:start&&PLAYER_PALETTE[owner]?owner:null,richness:score>=200?'high':score>=100?'mid':'low',score,
    computer:String(zone.computer_start??'').toLowerCase().trim()==='x',
    junction:String(zone.junction??'').toLowerCase().trim()==='x'};
}
function detailCount(min,density){
  const n=String(min??'').trim(),d=String(density??'').trim();
  if(!(amount(n)>0||amount(d)>0))return null;
  return {min:n||'0',density:d||'',text:compactExact(n||'0'),suffix:amount(d)>0?'/'+compactExact(d):''};
}
export function townEntries(zone){
  const result=[];
  for(const [faction,fields] of [['player',zone.player_towns],['neutral',zone.neutral_towns]]){
    for(const [name,key,densityKey] of [['castle','min_castles','castle_density'],['town','min_towns','town_density']]){
      const count=detailCount(fields?.[key],fields?.[densityKey]);
      if(count)result.push({faction,kind:name,...count});
    }
  }
  return result;
}
export function mineEntries(zone){
  const result=[];
  for(const name of RESOURCES){
    const count=detailCount(zone.min_mines?.[name],zone.mine_density?.[name]);
    if(count)result.push({resource:name,...count});
  }
  const yards=detailCount(zone.zone_options?.min_airship_shipyards,zone.zone_options?.airship_shipyard_density);
  if(yards)result.push({resource:'Airship',...yards});
  return result;
}
export function connectionAppearance(connection){
  const type=String(connection.conn_type??'').trim().toLowerCase();
  const road=String(connection.road??'').trim().toLowerCase();
  const on=v=>String(v??'').trim().toLowerCase()==='x';
  return {wide:on(connection.wide),border:on(connection.border_guard),fictive:on(connection.fictive)||type.includes('fictive'),
    roadRequired:['+','1','required','must','yes','x'].includes(road),roadForbidden:['-','-1','forbidden','no','disabled'].includes(road),type};
}
