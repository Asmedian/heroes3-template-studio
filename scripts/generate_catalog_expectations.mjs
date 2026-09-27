/** Regenerate immutable browser-test expectations from uploaded template bytes. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseBytes} from '../src/core.js';
import {mineEntries,zoneAppearance} from '../src/visuals.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../templates/catalog.json',import.meta.url)));
const result={version:'1.2.0',count:catalog.count,templates:[]};
for(const entry of catalog.templates){
 const data=fs.readFileSync(new URL('../templates/'+entry.file,import.meta.url));
 if(crypto.createHash('sha256').update(data).digest('hex')!==entry.sha256)throw new Error('Catalog checksum mismatch: '+entry.file);
 const pack=parseBytes(data,{filename:entry.name+'.txt'});
 result.templates.push({id:entry.id,name:entry.name,file:entry.file,maps:pack.maps.map(map=>({name:map.name,zones:map.zones.length,connections:map.connections.length,mines:map.zones.reduce((n,z)=>n+mineEntries(z).length,0),players:map.zones.map(z=>zoneAppearance(z).owner).filter(Boolean)}))});
}
fs.writeFileSync(new URL('../tests/catalog_expectations.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(`Wrote expectations for ${result.templates.length} bundles, ${result.templates.reduce((n,e)=>n+e.maps.length,0)} maps.`);
