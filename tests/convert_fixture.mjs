/** Generate a synthetic HotA 1.8 fixture from an existing legally supplied sample. */
import fs from 'node:fs';
import path from 'node:path';
import {parseBytes,convertPack,serializePack} from '../src/core.js';
if(process.argv.length!==4)throw new Error('Usage: node tests/convert_fixture.mjs SOURCE DESTINATION');
const [source,destination]=process.argv.slice(2);
const pack=parseBytes(fs.readFileSync(source),{filename:path.basename(source)});
const result=convertPack(pack,'hota18');
const zone=result.maps[0].zones[0];zone.town_types.Bulwark='x';zone.monster_factions.Bulwark='x';result.dirty=true;
fs.writeFileSync(destination,serializePack(result).bytes);
