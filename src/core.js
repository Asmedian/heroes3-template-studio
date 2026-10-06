/** Format engine. Column tables are generated from sokie's Python schema. */
import SCHEMA from './schema-data.js';
export { SCHEMA };
export const FORMATS = { sod: 'Shadow of Death', hota17: 'HotA 1.7.x', hota18: 'HotA 1.8.x' };
const FIELDS = SCHEMA.zoneOptionFields;
const RES = SCHEMA.resources;
const POS = ['min_human', 'max_human', 'min_total', 'max_total'];
const TOWN = ['min_towns', 'min_castles', 'town_density', 'castle_density'];
const MAPOPT = ['artifacts', 'combo_arts', 'spells', 'secondary_skills', 'objects', 'rock_blocks', 'zone_sparseness', 'special_weeks_disabled', 'spell_research', 'anarchy'];
const META = ['name', 'description', 'town_selection', 'heroes', 'mirror', 'tags', 'max_battle_rounds', 'forbid_hiring_heroes'];
const COUNTS = ['town', 'terrain', 'zone_type', 'pack_new', 'map_new', 'zone_new', 'connection_new'];
const caps = a => Object.fromEntries(a.map(k => [k, '']));
const clone = value => structuredClone(value);
const on = value => String(value ?? '').trim().toLowerCase() === 'x';
const str = value => String(value ?? '');
const mval = o => Object.values(o ?? {}).some(v => str(v).trim());
/** Parse RFC4180-style TSV including quoted multiline cells and double quotes. */
export function readTSV(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            if (quoted && text[i + 1] === '"') {
                cell += '"';
                i++;
            }
            else
                quoted = !quoted;
        }
        else if (ch === '\t' && !quoted) {
            row.push(cell);
            cell = '';
        }
        else if ((ch === '\n' || ch === '\r') && !quoted) {
            if (ch === '\r' && text[i + 1] === '\n')
                i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        }
        else
            cell += ch;
    }
    if (quoted)
        throw new Error('Unclosed quoted cell in template file.');
    if (cell !== '' || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}
export function writeTSV(rows) {
    return rows.map(row => row.map(value => {
        const t = str(value);
        return /[\t\r\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }).join('\t')).join('\r\n') + '\r\n';
}
export function decodeBytes(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length >= 3 && b[0] === 239 && b[1] === 187 && b[2] === 191)
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(3)), encoding: 'utf-8-sig' };
    try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'utf-8' };
    }
    catch {
        const cp1251 = new TextDecoder('windows-1251').decode(b);
        if (!cp1251.includes('\ufffd'))
            return { text: cp1251, encoding: 'cp1251' };
        return { text: Array.from(b, byte => String.fromCharCode(byte)).join(''), encoding: 'latin-1' };
    }
}
let cp1251Map;
function encodeCp1251(text, warnings) {
    if (!cp1251Map) {
        cp1251Map = new Map();
        const decoder = new TextDecoder('windows-1251');
        for (let i = 0; i < 256; i++) {
            const c = decoder.decode(Uint8Array.of(i));
            if (c !== '\ufffd')
                cp1251Map.set(c, i);
        }
    }
    const bytes = [];
    let replaced = false;
    for (const ch of text) {
        if (cp1251Map.has(ch))
            bytes.push(cp1251Map.get(ch));
        else {
            bytes.push(63);
            replaced = true;
        }
    }
    if (replaced)
        warnings.push('Some characters cannot be represented in Windows-1251 and were replaced with ?.');
    return Uint8Array.from(bytes);
}
export function encodeText(text, encoding, warnings = []) {
    if (encoding === 'cp1251')
        return encodeCp1251(text, warnings);
    if (encoding === 'latin-1') {
        let replaced = false;
        const bytes = Array.from(text, c => { const n = c.codePointAt(0); if (n > 255) {
            replaced = true;
            return 63;
        } return n; });
        if (replaced)
            warnings.push('Some characters cannot be represented in Latin-1 and were replaced with ?.');
        return Uint8Array.from(bytes);
    }
    const enc = new TextEncoder().encode(text);
    return encoding === 'utf-8-sig' ? Uint8Array.from([239, 187, 191, ...enc]) : enc;
}
export function formatOfRows(rows) {
    if (rows.length < 4)
        throw new Error('Template must contain three header rows and at least one data row.');
    if (rows[0][0]?.trim() === 'Map')
        return 'sod';
    const count = rows[3]?.[0]?.trim();
    if (count === '11')
        return 'hota17';
    if (count === '12')
        return 'hota18';
    throw new Error(`Unknown template format: expected HotA town count 11 or 12, received ${count || '(empty)'}.`);
}
const pos = (row, c, prefix) => Object.fromEntries(POS.map((field, i) => [field, row[c[prefix + ['MIN_HUMAN_POS', 'MAX_HUMAN_POS', 'MIN_TOTAL_POS', 'MAX_TOTAL_POS'][i]]] ?? '']));
const towns = (row, c, prefix) => Object.fromEntries(TOWN.map((field, i) => [field, row[c[prefix + ['MIN_TOWNS', 'MIN_CASTLES', 'TOWN_DENSITY', 'CASTLE_DENSITY'][i]]] ?? '']));
const fromList = (row, offset, names) => Object.fromEntries(names.map((name, i) => [name, row[offset + i] ?? '']));
function parseZone(row, sch) {
    const c = sch.columns;
    return {
        id: row[c.ZONE_ID] ?? '', human_start: row[c.HUMAN_START] ?? '', computer_start: row[c.COMPUTER_START] ?? '',
        treasure: row[c.TREASURE] ?? '', junction: row[c.JUNCTION] ?? '', base_size: row[c.BASE_SIZE] ?? '',
        positions: pos(row, c, ''), ownership: row[c.OWNERSHIP] ?? '',
        player_towns: towns(row, c, 'PLAYER_'), neutral_towns: towns(row, c, 'NEUTRAL_'),
        towns_same_type: row[c.TOWNS_SAME_TYPE] ?? '',
        town_types: fromList(row, c.TOWN_TYPES_START, sch.towns.map(f => f === 'Elemental' ? 'Conflux' : f)),
        min_mines: fromList(row, c.MIN_MINES_START, RES), mine_density: fromList(row, c.MINE_DENSITY_START, RES),
        terrain_match: row[c.TERRAIN_MATCH] ?? '', terrains: fromList(row, c.TERRAINS_START, sch.terrains),
        monster_strength: row[c.MONSTER_STRENGTH] ?? '', monster_match: row[c.MONSTER_MATCH] ?? '',
        monster_factions: fromList(row, c.MONSTER_FACTIONS_START, sch.monsters),
        treasure_tiers: Array.from({ length: 3 }, (_, i) => ({ low: row[c.TREASURE_START + i * 3] ?? '', high: row[c.TREASURE_START + i * 3 + 1] ?? '', density: row[c.TREASURE_START + i * 3 + 2] ?? '' })),
        zone_options: sch.isHota ? fromList(row, c.ZONE_OPTIONS_START, FIELDS) : Object.fromEntries(FIELDS.map(f => [f, null]))
    };
}
function parseConnection(row, sch, zoneId) {
    const c = sch.columns;
    const connection = { zone1: row[c.CONN_ZONE1] ?? '', zone2: row[c.CONN_ZONE2] ?? '', value: row[c.CONN_VALUE] ?? '',
        wide: row[c.CONN_WIDE] ?? '', border_guard: row[c.CONN_BORDER_GUARD] ?? '', positions: pos(row, c, 'CONN_'),
        road: sch.isHota ? row[c.CONN_ROAD] ?? '' : null, conn_type: sch.isHota ? row[c.CONN_TYPE] ?? '' : null,
        fictive: sch.isHota ? row[c.CONN_FICTIVE] ?? '' : null, portal_repulsion: sch.isHota ? row[c.CONN_PORTAL_REPULSION] ?? '' : null,
        extra_zone_cols: {} };
    if (!zoneId)
        for (let j = c.ZONE_ID; j < c.CONN_ZONE1; j++)
            if (str(row[j]).trim())
                connection.extra_zone_cols[j] = row[j];
    return connection;
}
export function parseText(text, { filename = 'template.h3t', encoding = 'utf-8', originalBytes = null } = {}) {
    const rows = readTSV(text);
    while (rows.length && !rows[0].some(v => v.trim()))
        rows.shift();
    const format = formatOfRows(rows), sch = SCHEMA.formats[format], c = sch.columns;
    const pack = { format, filename, encoding, originalBytes, dirty: false, metadata: null, field_counts: null, header_rows: rows.slice(0, 3), maps: [], warnings: [] };
    const width = sch.isHota ? c.TOTAL : c.ACTIVE_COLS;
    let cur = null;
    rows.slice(3).forEach((input, index) => {
        const row = input.slice();
        if (!row.some(v => v.trim()))
            return;
        if (row.length < width)
            pack.warnings.push(`Line ${index + 4}: truncated row (${row.length}/${width} columns).`);
        else if (row.slice(width).some(v => v.trim()))
            pack.warnings.push(`Line ${index + 4}: data beyond ${width} columns.`);
        while (row.length < width + 1)
            row.push('');
        if (sch.isHota && index === 0) {
            pack.field_counts = Object.fromEntries(COUNTS.map((f, i) => [f, row[i] ?? '']));
            pack.metadata = Object.fromEntries(META.map((f, i) => [f, row[c.PACK_NAME + i] ?? '']));
        }
        const mapName = (row[sch.isHota ? c.MAP_NAME : c.NAME] ?? '').trim(), zoneId = (row[c.ZONE_ID] ?? '').trim();
        const hasConn = row.slice(c.CONN_ZONE1, c.CONN_MAX_TOTAL_POS + 1).some(v => str(v).trim());
        if (mapName) {
            cur = { name: mapName, min_size: row[sch.isHota ? c.MAP_MIN_SIZE : c.MIN_SIZE] ?? '', max_size: row[sch.isHota ? c.MAP_MAX_SIZE : c.MAX_SIZE] ?? '',
                options: sch.isHota ? fromList(row, c.MAP_ARTIFACTS, MAPOPT) : Object.fromEntries(MAPOPT.map(f => [f, null])),
                zones: [], connections: [], layout: {} };
            pack.maps.push(cur);
        }
        if (!cur)
            return;
        if (zoneId)
            cur.zones.push(parseZone(row, sch));
        if (hasConn)
            cur.connections.push(parseConnection(row, sch, zoneId));
    });
    if (!pack.maps.length)
        throw new Error('No template maps found.');
    return pack;
}
export function parseBytes(bytes, opts = {}) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { text, encoding } = decodeBytes(b);
    return parseText(text, { ...opts, originalBytes: b.slice(), encoding });
}
export function freshPack(format = 'hota18') {
    if (!SCHEMA.formats[format])
        throw new Error('Unknown format.');
    const sch = SCHEMA.formats[format];
    return { format, filename: format === 'sod' ? 'template.txt' : 'template.h3t', encoding: 'utf-8', originalBytes: null, dirty: true,
        metadata: sch.isHota ? { ...caps(META), name: 'New template pack' } : null,
        field_counts: sch.isHota ? { ...caps(COUNTS), town: String(sch.towns.length), terrain: String(sch.terrains.length), zone_type: '4', pack_new: '8', map_new: '10', zone_new: '18', connection_new: '4' } : null,
        header_rows: clone(sch.headers), maps: [], warnings: [] };
}
export function freshZone(format = 'hota18', id = '1') {
    const sch = SCHEMA.formats[format];
    return {
        id, human_start: '', computer_start: '', treasure: '', junction: '', base_size: '80', positions: caps(POS), ownership: '', player_towns: caps(TOWN), neutral_towns: caps(TOWN), towns_same_type: '',
        town_types: caps(sch.towns.map(f => f === 'Elemental' ? 'Conflux' : f)), min_mines: caps(RES), mine_density: caps(RES), terrain_match: '', terrains: caps(sch.terrains),
        monster_strength: 'avg', monster_match: '', monster_factions: caps(sch.monsters), treasure_tiers: Array.from({ length: 3 }, () => ({ low: '', high: '', density: '' })),
        zone_options: sch.isHota ? caps(FIELDS) : Object.fromEntries(FIELDS.map(f => [f, null]))
    };
}
export function freshConnection(format = 'hota18', z1 = '1', z2 = '2') {
    const isHota = SCHEMA.formats[format].isHota;
    return { zone1: z1, zone2: z2, value: '3000', wide: '', border_guard: '', positions: caps(POS), road: isHota ? '' : null, conn_type: isHota ? '' : null, fictive: isHota ? '' : null, portal_repulsion: isHota ? '' : null, extra_zone_cols: {} };
}
function setPos(row, c, prefix, obj) { POS.forEach((f, i) => { row[c[prefix + ['MIN_HUMAN_POS', 'MAX_HUMAN_POS', 'MIN_TOTAL_POS', 'MAX_TOTAL_POS'][i]]] = str(obj?.[f]); }); }
function setTowns(row, c, prefix, obj) { TOWN.forEach((f, i) => { row[c[prefix + ['MIN_TOWNS', 'MIN_CASTLES', 'TOWN_DENSITY', 'CASTLE_DENSITY'][i]]] = str(obj?.[f]); }); }
function listWrite(row, start, names, obj) { names.forEach((key, i) => row[start + i] = str(obj?.[key === 'Elemental' ? 'Conflux' : key])); }
function fillZone(row, zone, sch) {
    const c = sch.columns;
    for (const [key, idx] of [['id', c.ZONE_ID], ['human_start', c.HUMAN_START], ['computer_start', c.COMPUTER_START], ['treasure', c.TREASURE], ['junction', c.JUNCTION], ['base_size', c.BASE_SIZE], ['ownership', c.OWNERSHIP], ['towns_same_type', c.TOWNS_SAME_TYPE], ['terrain_match', c.TERRAIN_MATCH], ['monster_strength', c.MONSTER_STRENGTH], ['monster_match', c.MONSTER_MATCH]])
        row[idx] = str(zone[key]);
    setPos(row, c, '', zone.positions);
    setTowns(row, c, 'PLAYER_', zone.player_towns);
    setTowns(row, c, 'NEUTRAL_', zone.neutral_towns);
    listWrite(row, c.TOWN_TYPES_START, sch.towns, zone.town_types);
    listWrite(row, c.MIN_MINES_START, RES, zone.min_mines);
    listWrite(row, c.MINE_DENSITY_START, RES, zone.mine_density);
    listWrite(row, c.TERRAINS_START, sch.terrains, zone.terrains);
    listWrite(row, c.MONSTER_FACTIONS_START, sch.monsters, zone.monster_factions);
    for (let t = 0; t < 3; t++) {
        const tier = zone.treasure_tiers[t] ?? {};
        row[c.TREASURE_START + t * 3] = str(tier.low);
        row[c.TREASURE_START + t * 3 + 1] = str(tier.high);
        row[c.TREASURE_START + t * 3 + 2] = str(tier.density);
    }
    if (sch.isHota)
        listWrite(row, c.ZONE_OPTIONS_START, FIELDS, zone.zone_options);
}
function fillConn(row, conn, sch, restore) {
    const c = sch.columns;
    if (restore)
        for (const [k, v] of Object.entries(conn.extra_zone_cols ?? {}))
            if (+k < c.CONN_ZONE1)
                row[+k] = v;
    for (const [key, col] of [['zone1', c.CONN_ZONE1], ['zone2', c.CONN_ZONE2], ['value', c.CONN_VALUE], ['wide', c.CONN_WIDE], ['border_guard', c.CONN_BORDER_GUARD]])
        row[col] = str(conn[key]);
    if (sch.isHota)
        for (const [key, col] of [['road', c.CONN_ROAD], ['conn_type', c.CONN_TYPE], ['fictive', c.CONN_FICTIVE], ['portal_repulsion', c.CONN_PORTAL_REPULSION]])
            row[col] = str(conn[key]);
    setPos(row, c, 'CONN_', conn.positions);
}
export function serializePack(pack, { format = pack.format, packName = '' } = {}) {
    if (!FORMATS[format])
        throw new Error('Unknown output format.');
    if (format === pack.format && !pack.dirty && pack.originalBytes) {
        return { bytes: pack.originalBytes.slice(), text: null, pack, warnings: [...pack.warnings] };
    }
    const converted = format === pack.format ? pack : convertPack(pack, format, { packName });
    const sch = SCHEMA.formats[format], c = sch.columns, width = sch.isHota ? c.TOTAL + 1 : c.ACTIVE_COLS;
    const headers = converted.header_rows?.length === 3 ? converted.header_rows : sch.headers;
    const rows = headers.map(row => [...row]);
    converted.maps.forEach((tm, mi) => {
        const count = Math.max(tm.zones.length, tm.connections.length, 1);
        for (let i = 0; i < count; i++) {
            const row = Array(width).fill('');
            if (sch.isHota && mi === 0 && i === 0) {
                COUNTS.forEach((field, j) => row[j] = str(converted.field_counts?.[field]));
                META.forEach((field, j) => row[c.PACK_NAME + j] = str(converted.metadata?.[field]));
            }
            if (i === 0) {
                row[sch.isHota ? c.MAP_NAME : c.NAME] = tm.name;
                row[sch.isHota ? c.MAP_MIN_SIZE : c.MIN_SIZE] = tm.min_size;
                row[sch.isHota ? c.MAP_MAX_SIZE : c.MAX_SIZE] = tm.max_size;
                if (sch.isHota)
                    listWrite(row, c.MAP_ARTIFACTS, MAPOPT, tm.options);
            }
            if (i < tm.zones.length)
                fillZone(row, tm.zones[i], sch);
            if (i < tm.connections.length)
                fillConn(row, tm.connections[i], sch, i >= tm.zones.length);
            rows.push(row);
        }
    });
    const text = writeTSV(rows), warnings = [...converted.warnings], bytes = encodeText(text, converted.encoding, warnings);
    return { bytes, text, pack: converted, warnings };
}
const enabled = (o, keys) => keys.some(k => str(o[k]).trim() === 'x');
const allEnabled = (o, keys) => keys.every(k => str(o[k]).trim() === 'x');
const sodTowns = ['Castle', 'Rampart', 'Tower', 'Inferno', 'Necropolis', 'Dungeon', 'Stronghold', 'Fortress', 'Conflux'];
const sodMonsters = ['Neutral', 'Castle', 'Rampart', 'Tower', 'Inferno', 'Necropolis', 'Dungeon', 'Stronghold', 'Fortress', 'Forge'];
function sodTo17(input, packName) {
    const p = clone(input);
    p.format = 'hota17';
    p.header_rows = clone(SCHEMA.formats.hota17.headers);
    p.field_counts = Object.fromEntries(COUNTS.map((key, i) => [key, SCHEMA.sodToHotaDefaults.field_counts[i]]));
    p.metadata = { ...caps(META), name: packName || input.filename.replace(/\.[^.]*$/, '') };
    for (const m of p.maps) {
        m.options = { ...caps(MAPOPT), special_weeks_disabled: 'x', spell_research: 'x', anarchy: 'x' };
        for (const z of m.zones) {
            const anyTown = enabled(z.town_types, sodTowns), anyMonster = enabled(z.monster_factions, sodMonsters.filter(k => k !== 'Forge')), allMonster = allEnabled(z.monster_factions, sodMonsters);
            const allTerr = allEnabled(z.terrains, SCHEMA.formats.sod.terrains);
            z.town_types = { ...z.town_types, Cove: anyTown ? 'x' : '', Factory: anyTown ? 'x' : '' };
            z.terrains = { ...z.terrains, Highlands: allTerr ? 'x' : '', Wasteland: allTerr ? 'x' : '' };
            const monsters = { ...z.monster_factions };
            delete monsters.Forge;
            z.monster_factions = { ...monsters, Conflux: allMonster ? 'x' : '', Cove: anyMonster ? 'x' : '', Factory: anyMonster ? 'x' : '' };
            z.zone_options = clone(SCHEMA.sodToHotaDefaults.zone_options);
            if (z.monster_strength?.trim().toLowerCase() === 'average')
                z.monster_strength = 'avg';
        }
        for (const conn of m.connections) {
            Object.assign(conn, { ...SCHEMA.sodToHotaDefaults.connection, extra_zone_cols: {} });
        }
    }
    return p;
}
function hota17To18(input) {
    const p = clone(input);
    p.format = 'hota18';
    p.header_rows = clone(SCHEMA.formats.hota18.headers);
    p.field_counts.town = '12';
    for (const m of p.maps) {
        for (const conn of m.connections)
            conn.extra_zone_cols = {};
        for (const z of m.zones) {
            z.town_types.Bulwark = enabled(z.town_types, SCHEMA.formats.hota17.towns) ? 'x' : '';
            z.monster_factions.Bulwark = enabled(z.monster_factions, SCHEMA.formats.hota17.monsters) ? 'x' : '';
        }
    }
    return p;
}
function hota18To17(input) {
    const p = clone(input);
    p.format = 'hota17';
    p.header_rows = clone(SCHEMA.formats.hota17.headers);
    p.field_counts.town = '11';
    let affected = 0;
    for (const m of p.maps) {
        for (const conn of m.connections)
            conn.extra_zone_cols = {};
        for (const z of m.zones) {
            if (str(z.town_types.Bulwark).trim() || str(z.monster_factions.Bulwark).trim())
                affected++;
            delete z.town_types.Bulwark;
            delete z.monster_factions.Bulwark;
        }
    }
    if (affected)
        p.warnings.push(`Conversion loss: Bulwark town/monster settings dropped in ${affected} zone(s).`);
    return p;
}
function hotaToSod(input) {
    const p = clone(input);
    p.format = 'sod';
    p.header_rows = clone(SCHEMA.formats.sod.headers);
    if (p.metadata && mval(p.metadata))
        p.warnings.push('Conversion loss: HotA pack metadata dropped (not available in SoD).');
    p.metadata = null;
    p.field_counts = null;
    const loss = { map: 0, zone: 0, conn: 0, terrain: 0, town: 0, monster: 0, zero: 0 };
    for (const m of p.maps) {
        if (mval(m.options))
            loss.map++;
        m.options = Object.fromEntries(MAPOPT.map(f => [f, null]));
        for (const z of m.zones) {
            if (mval(z.zone_options))
                loss.zone++;
            if (enabled(z.town_types, ['Cove', 'Factory', 'Bulwark']))
                loss.town++;
            if (enabled(z.terrains, ['Highlands', 'Wasteland'])) {
                loss.terrain++;
                if (!enabled(z.terrains, SCHEMA.formats.sod.terrains))
                    loss.zero++;
            }
            if (enabled(z.monster_factions, ['Conflux', 'Cove', 'Factory', 'Bulwark']))
                loss.monster++;
            const anyMonster = mval(z.monster_factions);
            z.town_types = Object.fromEntries(sodTowns.map(f => [f, str(z.town_types[f])]));
            z.terrains = Object.fromEntries(SCHEMA.formats.sod.terrains.map(f => [f, str(z.terrains[f])]));
            z.monster_factions = Object.fromEntries(SCHEMA.formats.sod.monsters.map(f => [f, f === 'Forge' ? (anyMonster ? 'x' : '') : str(z.monster_factions[f])]));
            z.zone_options = Object.fromEntries(FIELDS.map(f => [f, null]));
        }
        for (const c of m.connections) {
            if ([c.road, c.conn_type, c.fictive, c.portal_repulsion].some(v => str(v).trim()))
                loss.conn++;
            c.road = c.conn_type = c.fictive = c.portal_repulsion = null;
            c.extra_zone_cols = {};
        }
    }
    for (const [key, desc] of Object.entries({ map: 'map options', zone: 'zone options', conn: 'connection options', terrain: 'Highlands/Wasteland terrains', town: 'newer town factions', monster: 'newer monster factions', zero: 'zones left without a terrain' }))
        if (loss[key])
            p.warnings.push(`Conversion loss: ${loss[key]} ${desc}${key === 'zero' ? ' (requires attention)' : ''}.`);
    return p;
}
export function convertPack(pack, to, { packName = '' } = {}) {
    if (!FORMATS[to])
        throw new Error('Unsupported output format.');
    let p = clone(pack);
    if (p.format === to) {
        p.originalBytes = null;
        p.dirty = true;
        return p;
    }
    if (p.format === 'sod')
        p = sodTo17(p, packName);
    if (p.format === 'hota18' && to !== 'hota18')
        p = hota18To17(p);
    if (p.format === 'hota17' && to === 'hota18')
        p = hota17To18(p);
    if (p.format === 'hota17' && to === 'sod')
        p = hotaToSod(p);
    p.originalBytes = null;
    p.dirty = true;
    p.filename = to === 'sod' ? p.filename.replace(/\.[^.]*$/, '.txt') : p.filename.replace(/\.[^.]*$/, '.h3t');
    p.maps.forEach(m => { if (to === 'sod')
        m.layout = { ...m.layout }; });
    return p;
}
export function renumberMap(map, { sort = 'row', warnings = [] } = {}) {
    const ids = map.zones.map(z => z.id.trim());
    if (new Set(ids).size !== ids.length)
        throw new Error('Duplicate zone IDs: renumbering is ambiguous.');
    let zones = map.zones;
    if (sort === 'players')
        zones = [...zones].sort((a, b) => Number(on(b.human_start) || on(b.computer_start)) - Number(on(a.human_start) || on(a.computer_start)) || Number(a.id) - Number(b.id));
    else if (sort === 'center')
        zones = [...zones].sort((a, b) => Number(on(b.treasure) || on(b.junction)) - Number(on(a.treasure) || on(a.junction)) || Number(a.id) - Number(b.id));
    const mapping = Object.fromEntries(zones.map((z, i) => [z.id.trim(), str(i + 1)]));
    for (const z of zones) {
        for (const name of ['town_hint', 'terrain_hint', 'faction_hint']) {
            const val = z.zone_options?.[name];
            if (val) {
                const result = remapHintRefsDetailed(val, mapping);
                if (result.warning)
                    warnings.push(`Zone ${z.id}, ${name}: ${result.warning}`);
                z.zone_options[name] = result.value;
            }
        }
    }
    for (const c of map.connections) {
        c.zone1 = mapping[c.zone1.trim()] ?? c.zone1;
        c.zone2 = mapping[c.zone2.trim()] ?? c.zone2;
    }
    map.layout = Object.fromEntries(Object.entries(map.layout ?? {}).map(([k, v]) => [mapping[k] ?? k, v]));
    for (const z of zones)
        z.id = mapping[z.id.trim()];
    map.zones = zones;
    return mapping;
}
/** Parse the exact HotA hint-token grammar before changing any zone references. */
export function remapHintRefsDetailed(text, mapping) {
    if (text == null || !String(text).trim())
        return { value: text, warning: null };
    const chunks = String(text).split(/(\s+)/), result = [];
    for (const token of chunks) {
        if (!token || /^\s+$/.test(token)) {
            result.push(token);
            continue;
        }
        const parsed = /^(p|n|\d+)?(st|dt|s|d)(x|\d+)(?:_(p|\d+))?$/.exec(token);
        if (!parsed)
            return { value: text, warning: `Unrecognized hint token ${JSON.stringify(token)}.` };
        const [, group = '', operation, arg, weight] = parsed;
        if (/^\d+$/.test(arg) && !Object.hasOwn(mapping, arg))
            return { value: text, warning: `Hint token ${JSON.stringify(token)} references unknown zone ${arg}.` };
        result.push(`${group}${operation}${/^\d+$/.test(arg) ? mapping[arg] : arg}${weight == null ? '' : `_${weight}`}`);
    }
    return { value: result.join(''), warning: null };
}
export const remapHintRefs = (text, mapping) => remapHintRefsDetailed(text, mapping).value;
export function validatePack(pack) {
    const issues = [];
    pack.maps.forEach((m, mi) => {
        const ids = m.zones.map(z => z.id.trim()), seen = new Set();
        for (const id of ids) {
            if (seen.has(id))
                issues.push({ level: 'error', map: mi, text: `${m.name}: duplicate zone ID ${id || '(empty)'}.` });
            seen.add(id);
        }
        if (ids.some((id, i) => id !== String(i + 1)))
            issues.push({ level: 'warning', map: mi, text: `${m.name}: zone IDs are not consecutive in row order (1..${ids.length}).` });
        for (const z of m.zones) {
            if (!on(z.terrain_match) && !Object.values(z.terrains).some(on))
                issues.push({ level: 'warning', map: mi, text: `${m.name}, zone ${z.id}: no terrain enabled.` });
            if (!on(z.monster_match) && !Object.values(z.monster_factions).some(on))
                issues.push({ level: 'warning', map: mi, text: `${m.name}, zone ${z.id}: no monster factions enabled.` });
        }
        for (const conn of m.connections) {
            if (!seen.has(conn.zone1.trim()) || !seen.has(conn.zone2.trim()))
                issues.push({ level: 'warning', map: mi, text: `${m.name}: dangling connection ${conn.zone1} ↔ ${conn.zone2}.` });
        }
    });
    return issues;
}
