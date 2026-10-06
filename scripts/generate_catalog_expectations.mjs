/** Regenerate immutable browser-test expectations from uploaded template bytes. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseBytes } from '../src/core.js';
import { isRenderableConnection, mineEntries, zoneAppearance } from '../src/visuals.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../templates/catalog.json', import.meta.url)));
const result = {
    version: '1.5.4',
    count: catalog.count,
    templates: []
};

for (const entry of catalog.templates) {
    const data = fs.readFileSync(new URL('../templates/' + entry.file, import.meta.url));
    const digest = crypto.createHash('sha256').update(data).digest('hex');
    if (digest !== entry.sha256) {
        throw new Error('Catalog checksum mismatch: ' + entry.file);
    }

    const pack = parseBytes(data, { filename: entry.name + '.txt' });
    result.templates.push({
        id: entry.id,
        name: entry.name,
        file: entry.file,
        maps: pack.maps.map(map => {
            const zoneIds = new Set(map.zones.map(zone => String(zone.id ?? '').trim()));
            const renderedConnections = map.connections.filter(connection => isRenderableConnection(connection, zoneIds)).length;
            return {
                name: map.name,
                zones: map.zones.length,
                connections: map.connections.length,
                renderedConnections,
                mines: map.zones.reduce((count, zone) => count + mineEntries(zone).length, 0),
                players: map.zones.map(zone => zoneAppearance(zone).owner).filter(Boolean)
            };
        })
    });
}

fs.writeFileSync(
    new URL('../tests/catalog_expectations.json', import.meta.url),
    JSON.stringify(result, null, 4) + '\n'
);

const maps = result.templates.reduce((count, entry) => count + entry.maps.length, 0);
console.log(`Wrote expectations for ${result.templates.length} bundles, ${maps} templates.`);
