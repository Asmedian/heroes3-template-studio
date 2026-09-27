/** Produce a format-neutral JS model so the Python upstream can be compared field-for-field. */
import fs from 'node:fs';
import path from 'node:path';
import {parseBytes,serializePack,convertPack} from '../src/core.js';
if(process.argv.length<3)throw new Error('Usage: node tests/export_model.mjs FILE [TARGET_FORMAT]');
const filename=process.argv[2],pack=parseBytes(fs.readFileSync(filename),{filename:path.basename(filename)});
const output=process.argv[3]?convertPack(pack,process.argv[3]):pack;
const normalized={metadata:output.metadata,field_counts:output.field_counts,
  maps:output.maps.map(({name,min_size,max_size,options,zones,connections})=>({name,min_size,max_size,options,zones,connections})),
  header_rows:output.header_rows};
console.log(JSON.stringify(normalized));
