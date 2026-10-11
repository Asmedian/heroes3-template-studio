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
        const bytes = Array.from(text, c => {
            const n = c.codePointAt(0);
            if (n > 255) {
                replaced = true;
                return 63;
            }
            return n;
        });
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
const cell = (row, index) => Number.isInteger(index) && index >= 0 ? row[index] ?? '' : '';
const normHeader = value => str(value).trim().toLowerCase();
function headerLayout(rows) {
    const headerRows = rows.slice(0, 3);
    const width = Math.max(0, ...headerRows.map(row => row.length));
    const paths = [];
    let top = '', sub = '';
    for (let i = 0; i < width; i++) {
        const nextTop = normHeader(headerRows[0]?.[i]);
        const nextSub = normHeader(headerRows[1]?.[i]);
        if (nextTop) {
            top = nextTop;
            sub = '';
        }
        if (nextSub)
            sub = nextSub;
        paths.push({ top, sub, leaf: normHeader(headerRows[2]?.[i]), rawLeaf: str(headerRows[2]?.[i]).trim() });
    }
    const find = (topName, subName, leafName) => paths.findIndex(path => path.top === normHeader(topName) && path.sub === normHeader(subName) && path.leaf === normHeader(leafName));
    const section = (topName, subName = null) => paths.map((path, index) => ({ ...path, index })).filter(path => path.top === normHeader(topName) && (subName == null || path.sub === normHeader(subName)));
    return { width, paths, find, section };
}
function labelsFromBase(base, keys) {
    return Object.fromEntries(keys.map((key, i) => [key, str(base.headers[2]?.[base.columns[key] ?? i]).trim()]));
}
function mapColumns(layout, top, sub, labels) {
    return Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, layout.find(top, sub, label)]));
}
function sectionEntries(layout, top, sub, { exclude = [] } = {}) {
    const blocked = new Set(exclude.map(normHeader));
    return layout.section(top, sub).filter(item => item.leaf && !blocked.has(item.leaf)).map(item => ({ name: item.rawLeaf, index: item.index }));
}
function schemaForRows(rows, format) {
    const base = SCHEMA.formats[format], layout = headerLayout(rows), c = {};
    const requireColumn = (key, top, sub, leaf) => {
        const index = layout.find(top, sub, leaf);
        if (index < 0)
            throw new Error(`Template header is missing required column ${top}${sub ? ' / ' + sub : ''} / ${leaf}.`);
        c[key] = index;
        return index;
    };
    const optionalColumn = (key, top, sub, leaf) => c[key] = layout.find(top, sub, leaf);
    const requireUniqueColumn = (key, top, leaf) => {
        const matches = layout.section(top).filter(item => item.leaf === normHeader(leaf));
        if (matches.length !== 1)
            throw new Error(`Template header must contain exactly one ${top} / ${leaf} column; found ${matches.length}.`);
        c[key] = matches[0].index;
        return c[key];
    };
    const optionalUniqueColumn = (key, top, leaf) => {
        const matches = layout.section(top).filter(item => item.leaf === normHeader(leaf));
        c[key] = matches.length === 1 ? matches[0].index : -1;
        return c[key];
    };

    if (base.isHota) {
        const countLabels = ['Town', 'Terrain', 'Zone type', 'Pack new', 'Map new', 'Zone new', 'Connection new'];
        COUNTS.forEach((field, i) => requireColumn(`FIELD_COUNT_${['TOWN', 'TERRAIN', 'ZONE_TYPE', 'PACK_NEW', 'MAP_NEW', 'ZONE_NEW', 'CONN_NEW'][i]}`, 'Pack', 'Field count', countLabels[i]));
        const metaLabels = ['Name', 'Description', 'Town selection', 'Heroes', 'Mirror', 'Tags', 'Max Battle Rounds', 'Forbid Hiring Heroes'];
        META.forEach((field, i) => requireColumn(`PACK_${['NAME', 'DESC', 'TOWN_SELECTION', 'HEROES', 'MIRROR', 'TAGS', 'MAX_BATTLE_ROUNDS', 'FORBID_HIRING_HEROES'][i]}`, 'Pack', 'Options', metaLabels[i]));
        requireColumn('MAP_NAME', 'Map', '', 'Name');
        requireColumn('MAP_MIN_SIZE', 'Map', '', 'Minimum Size');
        requireColumn('MAP_MAX_SIZE', 'Map', '', 'Maximum Size');
        const mapLabels = labelsFromBase(base, ['MAP_ARTIFACTS', 'MAP_COMBO_ARTS', 'MAP_SPELLS', 'MAP_SECONDARY_SKILLS', 'MAP_OBJECTS', 'MAP_ROCK_BLOCKS', 'MAP_ZONE_SPARSENESS', 'MAP_SPECIAL_WEEKS_DISABLED', 'MAP_SPELL_RESEARCH', 'MAP_ANARCHY']);
        const mapKeys = ['MAP_ARTIFACTS', 'MAP_COMBO_ARTS', 'MAP_SPELLS', 'MAP_SECONDARY_SKILLS', 'MAP_OBJECTS', 'MAP_ROCK_BLOCKS', 'MAP_ZONE_SPARSENESS', 'MAP_SPECIAL_WEEKS_DISABLED', 'MAP_SPELL_RESEARCH', 'MAP_ANARCHY'];
        for (const key of mapKeys)
            optionalColumn(key, 'Map', '', mapLabels[key]);
    }
    else {
        requireColumn('NAME', 'Map', '', 'Name');
        requireColumn('MIN_SIZE', 'Map', '', 'Minimum Size');
        requireColumn('MAX_SIZE', 'Map', '', 'Maximum Size');
    }

    requireColumn('ZONE_ID', 'Zone', '', 'Id');
    requireColumn('HUMAN_START', 'Zone', 'Type', 'human start');
    requireColumn('COMPUTER_START', 'Zone', 'Type', 'computer start');
    requireColumn('TREASURE', 'Zone', 'Type', 'Treasure');
    requireColumn('JUNCTION', 'Zone', 'Type', 'Junction');
    requireColumn('BASE_SIZE', 'Zone', 'Type', 'Base Size');
    requireColumn('MIN_HUMAN_POS', 'Zone', 'Restrictions', 'Minimum human positions');
    requireColumn('MAX_HUMAN_POS', 'Zone', 'Restrictions', 'Maximum human positions');
    requireColumn('MIN_TOTAL_POS', 'Zone', 'Restrictions', 'Minimum total positions');
    requireColumn('MAX_TOTAL_POS', 'Zone', 'Restrictions', 'Maximum total positions');
    requireUniqueColumn('OWNERSHIP', 'Zone', 'Ownership');
    requireColumn('PLAYER_MIN_TOWNS', 'Zone', 'Player towns', 'Minimum towns');
    requireColumn('PLAYER_MIN_CASTLES', 'Zone', 'Player towns', 'Minimum castles');
    requireColumn('PLAYER_TOWN_DENSITY', 'Zone', 'Player towns', 'Town Density');
    requireColumn('PLAYER_CASTLE_DENSITY', 'Zone', 'Player towns', 'Castle Density');
    requireColumn('NEUTRAL_MIN_TOWNS', 'Zone', 'Neutral towns', 'Minimum towns');
    requireColumn('NEUTRAL_MIN_CASTLES', 'Zone', 'Neutral towns', 'Minimum castles');
    requireColumn('NEUTRAL_TOWN_DENSITY', 'Zone', 'Neutral towns', 'Town Density');
    requireColumn('NEUTRAL_CASTLE_DENSITY', 'Zone', 'Neutral towns', 'Castle Density');
    requireUniqueColumn('TOWNS_SAME_TYPE', 'Zone', 'Towns are of same type');

    const townEntries = sectionEntries(layout, 'Zone', 'Town types', { exclude: ['Towns are of same type'] });
    const minMineEntries = sectionEntries(layout, 'Zone', 'Minimum mines');
    const mineDensityEntries = sectionEntries(layout, 'Zone', 'Mine Density');
    requireColumn('TERRAIN_MATCH', 'Zone', 'Terrain', 'Match to town');
    const terrainEntries = sectionEntries(layout, 'Zone', 'Terrain', { exclude: ['Match to town'] });
    requireColumn('MONSTER_STRENGTH', 'Zone', 'Monsters', 'Strength');
    requireColumn('MONSTER_MATCH', 'Zone', 'Monsters', 'Match to town');
    const monsterEntries = sectionEntries(layout, 'Zone', 'Monsters', { exclude: ['Strength', 'Match to town'] });
    const treasureEntries = sectionEntries(layout, 'Zone', 'Treasure');

    const setRange = (prefix, entries) => {
        c[`${prefix}_START`] = entries.length ? entries[0].index : -1;
        c[`${prefix}_END`] = entries.length ? entries.at(-1).index : -1;
        c[`${prefix}_COUNT`] = entries.length;
    };
    setRange('TOWN_TYPES', townEntries);
    setRange('MIN_MINES', minMineEntries);
    setRange('MINE_DENSITY', mineDensityEntries);
    setRange('TERRAINS', terrainEntries);
    setRange('MONSTER_FACTIONS', monsterEntries);
    c.TREASURE_START = treasureEntries.length ? treasureEntries[0].index : -1;
    c.TREASURE_END = treasureEntries.length ? treasureEntries.at(-1).index : -1;

    let zoneOptionColumns = {};
    let zoneOptionFields = [];
    if (base.isHota) {
        const baseLabels = FIELDS.map((field, i) => [field, str(base.headers[2]?.[base.columns.ZONE_OPTIONS_START + i]).trim()]);
        for (const [field, label] of baseLabels) {
            const index = layout.find('Zone', 'Options', label);
            if (index >= 0) {
                zoneOptionColumns[field] = index;
                zoneOptionFields.push(field);
            }
        }
        const optionIndices = Object.values(zoneOptionColumns);
        c.ZONE_OPTIONS_START = optionIndices.length ? Math.min(...optionIndices) : -1;
        c.ZONE_OPTIONS_END = optionIndices.length ? Math.max(...optionIndices) : -1;
        c.ZONE_OPTIONS_COUNT = optionIndices.length;
    }

    requireUniqueColumn('CONN_ZONE1', 'Connections', 'Zone 1');
    requireUniqueColumn('CONN_ZONE2', 'Connections', 'Zone 2');
    requireUniqueColumn('CONN_VALUE', 'Connections', 'Value');
    requireUniqueColumn('CONN_WIDE', 'Connections', 'Wide');
    requireUniqueColumn('CONN_BORDER_GUARD', 'Connections', 'Border Guard');
    if (base.isHota) {
        optionalUniqueColumn('CONN_ROAD', 'Connections', 'Road');
        optionalUniqueColumn('CONN_TYPE', 'Connections', 'Type');
        optionalUniqueColumn('CONN_FICTIVE', 'Connections', 'Fictive');
        optionalUniqueColumn('CONN_PORTAL_REPULSION', 'Connections', 'Portal repulsion');
    }
    else
        c.CONN_ROAD = c.CONN_TYPE = c.CONN_FICTIVE = c.CONN_PORTAL_REPULSION = -1;
    requireUniqueColumn('CONN_MIN_HUMAN_POS', 'Connections', 'Minimum human positions');
    requireUniqueColumn('CONN_MAX_HUMAN_POS', 'Connections', 'Maximum human positions');
    requireUniqueColumn('CONN_MIN_TOTAL_POS', 'Connections', 'Minimum total positions');
    requireUniqueColumn('CONN_MAX_TOTAL_POS', 'Connections', 'Maximum total positions');

    const lastHeaderColumn = Math.max(0, ...rows.slice(0, 3).map(row => {
        for (let i = row.length - 1; i >= 0; i--)
            if (str(row[i]).trim())
                return i + 1;
        return 0;
    }));
    if (base.isHota)
        c.TOTAL = lastHeaderColumn;
    else
        c.ACTIVE_COLS = lastHeaderColumn;

    const knownColumns = new Set(Object.entries(c).filter(([key, value]) => Number.isInteger(value) && value >= 0 && !/(?:_START|_END|_COUNT|TOTAL|ACTIVE_COLS)$/.test(key)).map(([, value]) => value));
    for (const entry of [...townEntries, ...minMineEntries, ...mineDensityEntries, ...terrainEntries, ...monsterEntries, ...treasureEntries])
        knownColumns.add(entry.index);
    for (const index of Object.values(zoneOptionColumns))
        knownColumns.add(index);

    const zoneColumns = layout.section('Zone').map(item => item.index);
    const connectionColumns = layout.section('Connections').map(item => item.index);
    const sch = {
        ...base,
        columns: c,
        towns: townEntries.map(entry => entry.name === 'Elemental' ? 'Conflux' : entry.name),
        resourcesMin: minMineEntries.map(entry => entry.name),
        resourcesDensity: mineDensityEntries.map(entry => entry.name),
        terrains: terrainEntries.map(entry => entry.name),
        monsters: monsterEntries.map(entry => entry.name === 'Elemental' ? 'Conflux' : entry.name),
        treasureColumns: treasureEntries.map(entry => entry.index),
        townColumns: townEntries,
        minMineColumns: minMineEntries,
        mineDensityColumns: mineDensityEntries,
        terrainColumns: terrainEntries,
        monsterColumns: monsterEntries,
        zoneOptionColumns,
        zoneOptionFields,
        zoneColumns,
        connectionColumns,
        knownColumns,
        headerWidth: lastHeaderColumn
    };
    return sch;
}
function schemaForPack(pack, format) {
    const base = SCHEMA.formats[format];
    if (format === pack.format && pack.header_rows?.length === 3)
        return schemaForRows([...pack.header_rows, []], format);
    return {
        ...base,
        zoneOptionFields: FIELDS,
        resourcesMin: RES,
        resourcesDensity: RES,
        treasureColumns: Array.from({ length: 9 }, (_, i) => base.columns.TREASURE_START + i),
        townColumns: base.towns.map((name, i) => ({ name, index: base.columns.TOWN_TYPES_START + i })),
        minMineColumns: RES.map((name, i) => ({ name, index: base.columns.MIN_MINES_START + i })),
        mineDensityColumns: RES.map((name, i) => ({ name, index: base.columns.MINE_DENSITY_START + i })),
        terrainColumns: base.terrains.map((name, i) => ({ name, index: base.columns.TERRAINS_START + i })),
        monsterColumns: base.monsters.map((name, i) => ({ name, index: base.columns.MONSTER_FACTIONS_START + i })),
        zoneOptionColumns: Object.fromEntries(FIELDS.map((field, i) => [field, base.columns.ZONE_OPTIONS_START != null ? base.columns.ZONE_OPTIONS_START + i : -1])),
        zoneColumns: [], connectionColumns: [], knownColumns: new Set()
    };
}
const pos = (row, c, prefix) => Object.fromEntries(POS.map((field, i) => [field, cell(row, c[prefix + ['MIN_HUMAN_POS', 'MAX_HUMAN_POS', 'MIN_TOTAL_POS', 'MAX_TOTAL_POS'][i]])]));
const towns = (row, c, prefix) => Object.fromEntries(TOWN.map((field, i) => [field, cell(row, c[prefix + ['MIN_TOWNS', 'MIN_CASTLES', 'TOWN_DENSITY', 'CASTLE_DENSITY'][i]])]));
const fromList = (row, offset, names) => Object.fromEntries(names.map((name, i) => [name, row[offset + i] ?? '']));
const fromEntries = (row, entries) => Object.fromEntries(entries.map(({ name, index }) => [name === 'Elemental' ? 'Conflux' : name, cell(row, index)]));
const fromColumnMap = (row, mapping, defaults = {}) => ({ ...defaults, ...Object.fromEntries(Object.entries(mapping ?? {}).filter(([, index]) => Number.isInteger(index) && index >= 0).map(([key, index]) => [key, cell(row, index)])) });
function parseZone(row, sch) {
    const c = sch.columns;
    return {
        id: row[c.ZONE_ID] ?? '', human_start: row[c.HUMAN_START] ?? '', computer_start: row[c.COMPUTER_START] ?? '',
        treasure: row[c.TREASURE] ?? '', junction: row[c.JUNCTION] ?? '', base_size: row[c.BASE_SIZE] ?? '',
        positions: pos(row, c, ''), ownership: row[c.OWNERSHIP] ?? '',
        player_towns: towns(row, c, 'PLAYER_'), neutral_towns: towns(row, c, 'NEUTRAL_'),
        towns_same_type: row[c.TOWNS_SAME_TYPE] ?? '',
        town_types: fromEntries(row, sch.townColumns ?? []),
        min_mines: fromEntries(row, sch.minMineColumns ?? []), mine_density: fromEntries(row, sch.mineDensityColumns ?? []),
        terrain_match: row[c.TERRAIN_MATCH] ?? '', terrains: fromEntries(row, sch.terrainColumns ?? []),
        monster_strength: row[c.MONSTER_STRENGTH] ?? '', monster_match: row[c.MONSTER_MATCH] ?? '',
        monster_factions: fromEntries(row, sch.monsterColumns ?? []),
        treasure_tiers: Array.from({ length: 3 }, (_, i) => ({ low: cell(row, sch.treasureColumns?.[i * 3]), high: cell(row, sch.treasureColumns?.[i * 3 + 1]), density: cell(row, sch.treasureColumns?.[i * 3 + 2]) })),
        zone_options: sch.isHota ? fromColumnMap(row, sch.zoneOptionColumns, Object.fromEntries(FIELDS.map(f => [f, null]))) : Object.fromEntries(FIELDS.map(f => [f, null]))
    };
}
function parseConnection(row, sch) {
    const c = sch.columns;
    return {
        zone1: cell(row, c.CONN_ZONE1), zone2: cell(row, c.CONN_ZONE2), value: cell(row, c.CONN_VALUE),
        wide: cell(row, c.CONN_WIDE), border_guard: cell(row, c.CONN_BORDER_GUARD), positions: pos(row, c, 'CONN_'),
        road: sch.isHota ? cell(row, c.CONN_ROAD) : null, conn_type: sch.isHota ? cell(row, c.CONN_TYPE) : null,
        fictive: sch.isHota ? cell(row, c.CONN_FICTIVE) : null, portal_repulsion: sch.isHota ? cell(row, c.CONN_PORTAL_REPULSION) : null
    };
}
function rowExtras(row, sch) {
    const columns = {};
    for (const j of sch.zoneColumns ?? [])
        if (str(row[j]).trim())
            columns[j] = row[j];
    return columns;
}
function unknownRowColumns(row, sch, width) {
    const columns = {};
    for (let j = 0; j < width; j++)
        if (!sch.knownColumns?.has(j) && str(row[j]).trim())
            columns[j] = row[j];
    return columns;
}
export function parseText(text, { filename = 'template.h3t', encoding = 'utf-8', originalBytes = null } = {}) {
    const rows = readTSV(text);
    while (rows.length && !rows[0].some(v => v.trim()))
        rows.shift();
    const format = formatOfRows(rows), sch = schemaForRows(rows, format), c = sch.columns;
    const pack = { format, filename, encoding, originalBytes, dirty: false, metadata: null, field_counts: null, header_rows: rows.slice(0, 3), source_schema: { columns: { ...c }, zone_option_fields: [...(sch.zoneOptionFields ?? [])] }, maps: [], warnings: [], source_issues: [] };
    const width = sch.isHota ? c.TOTAL : c.ACTIVE_COLS;
    let cur = null;
    rows.slice(3).forEach((input, index) => {
        const row = input.slice();
        if (!row.some(v => v.trim()))
            return;
        let rowIssue = null;
        if (row.length < width) {
            rowIssue = { code: 'truncated_row', args: { line: index + 4, actual: row.length, expected: width } };
        }
        else if (row.slice(width).some(v => v.trim())) {
            rowIssue = { code: 'extra_columns', args: { line: index + 4, expected: width } };
        }
        while (row.length < width + 1)
            row.push('');
        if (sch.isHota && index === 0) {
            const countKeys = ['FIELD_COUNT_TOWN', 'FIELD_COUNT_TERRAIN', 'FIELD_COUNT_ZONE_TYPE', 'FIELD_COUNT_PACK_NEW', 'FIELD_COUNT_MAP_NEW', 'FIELD_COUNT_ZONE_NEW', 'FIELD_COUNT_CONN_NEW'];
            pack.field_counts = Object.fromEntries(COUNTS.map((f, i) => [f, cell(row, c[countKeys[i]])]));
            const metaKeys = ['PACK_NAME', 'PACK_DESC', 'PACK_TOWN_SELECTION', 'PACK_HEROES', 'PACK_MIRROR', 'PACK_TAGS', 'PACK_MAX_BATTLE_ROUNDS', 'PACK_FORBID_HIRING_HEROES'];
            pack.metadata = Object.fromEntries(META.map((f, i) => [f, cell(row, c[metaKeys[i]])]));
        }
        const mapName = (row[sch.isHota ? c.MAP_NAME : c.NAME] ?? '').trim(), zoneId = (row[c.ZONE_ID] ?? '').trim();
        // A connection exists only when a column that belongs to the top-level Connections
        // section contains data. Every top-level section is independent of neighbouring sections.
        const hasConn = (sch.connectionColumns ?? []).some(column => str(row[column]).trim());
        if (mapName) {
            const mapOptionKeys = ['MAP_ARTIFACTS', 'MAP_COMBO_ARTS', 'MAP_SPELLS', 'MAP_SECONDARY_SKILLS', 'MAP_OBJECTS', 'MAP_ROCK_BLOCKS', 'MAP_ZONE_SPARSENESS', 'MAP_SPECIAL_WEEKS_DISABLED', 'MAP_SPELL_RESEARCH', 'MAP_ANARCHY'];
            cur = {
                name: mapName, min_size: cell(row, sch.isHota ? c.MAP_MIN_SIZE : c.MIN_SIZE), max_size: cell(row, sch.isHota ? c.MAP_MAX_SIZE : c.MAX_SIZE),
                options: sch.isHota ? Object.fromEntries(MAPOPT.map((field, i) => [field, cell(row, c[mapOptionKeys[i]])])) : Object.fromEntries(MAPOPT.map(f => [f, null])),
                zones: [], connections: [], row_extras: [], unknown_rows: [], layout: {}
            };
            pack.maps.push(cur);
        }
        if (!cur)
            return;
        if (rowIssue) {
            const map = pack.maps.length - 1;
            const text = rowIssue.code === 'truncated_row'
                ? `${cur.name}, line ${rowIssue.args.line}: row has ${rowIssue.args.actual} columns; expected at least ${rowIssue.args.expected}.`
                : `${cur.name}, line ${rowIssue.args.line}: row contains data beyond the ${rowIssue.args.expected} recognized columns.`;
            pack.source_issues.push({ level: 'error', map, ...rowIssue, text });
        }
        const zoneIndex = zoneId ? cur.zones.length : null;
        const connectionIndex = hasConn ? cur.connections.length : null;
        if (zoneId)
            cur.zones.push(parseZone(row, sch));
        const extras = zoneId ? {} : rowExtras(row, sch);
        if (Object.keys(extras).length)
            cur.row_extras.push({ line: index + 4, connection_index: connectionIndex, columns: extras });
        const unknown = unknownRowColumns(row, sch, width);
        if (Object.keys(unknown).length)
            cur.unknown_rows.push({ line: index + 4, map_row: Boolean(mapName), zone_index: zoneIndex, connection_index: connectionIndex, columns: unknown });
        if (hasConn)
            cur.connections.push(parseConnection(row, sch));
    });
    if (!pack.maps.length)
        throw new Error('No templates found.');
    return pack;
}
export function parseBytes(bytes, opts = {}) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { text, encoding } = decodeBytes(b);
    return parseText(text, { ...opts, originalBytes: b.slice(), encoding });
}
export function freshPack(format = 'sod') {
    if (!SCHEMA.formats[format])
        throw new Error('Unknown format.');
    const sch = SCHEMA.formats[format];
    return {
        format, filename: format === 'sod' ? 'template.txt' : 'template.h3t', encoding: 'utf-8', originalBytes: null, dirty: true,
        metadata: sch.isHota ? { ...caps(META), name: 'New template pack' } : null,
        field_counts: sch.isHota ? { ...caps(COUNTS), town: String(sch.towns.length), terrain: String(sch.terrains.length), zone_type: '4', pack_new: '8', map_new: '10', zone_new: '18', connection_new: '4' } : null,
        header_rows: clone(sch.headers), source_schema: null, maps: [], warnings: [], source_issues: []
    };
}
export function freshZone(format = 'sod', id = '1') {
    const sch = SCHEMA.formats[format];
    return {
        id, human_start: '', computer_start: '', treasure: '', junction: '', base_size: '80', positions: caps(POS), ownership: '', player_towns: caps(TOWN), neutral_towns: caps(TOWN), towns_same_type: '',
        town_types: caps(sch.towns.map(f => f === 'Elemental' ? 'Conflux' : f)), min_mines: caps(RES), mine_density: caps(RES), terrain_match: '', terrains: caps(sch.terrains),
        monster_strength: 'avg', monster_match: '', monster_factions: caps(sch.monsters), treasure_tiers: Array.from({ length: 3 }, () => ({ low: '', high: '', density: '' })),
        zone_options: sch.isHota ? caps(FIELDS) : Object.fromEntries(FIELDS.map(f => [f, null]))
    };
}
export function freshConnection(format = 'sod', z1 = '1', z2 = '2') {
    const isHota = SCHEMA.formats[format].isHota;
    return { zone1: z1, zone2: z2, value: '3000', wide: '', border_guard: '', positions: caps(POS), road: isHota ? '' : null, conn_type: isHota ? '' : null, fictive: isHota ? '' : null, portal_repulsion: isHota ? '' : null };
}
function setPos(row, c, prefix, obj) { POS.forEach((f, i) => { const index = c[prefix + ['MIN_HUMAN_POS', 'MAX_HUMAN_POS', 'MIN_TOTAL_POS', 'MAX_TOTAL_POS'][i]]; if (Number.isInteger(index) && index >= 0) row[index] = str(obj?.[f]); }); }
function setTowns(row, c, prefix, obj) { TOWN.forEach((f, i) => { row[c[prefix + ['MIN_TOWNS', 'MIN_CASTLES', 'TOWN_DENSITY', 'CASTLE_DENSITY'][i]]] = str(obj?.[f]); }); }
function listWrite(row, start, names, obj) { names.forEach((key, i) => row[start + i] = str(obj?.[key === 'Elemental' ? 'Conflux' : key])); }
function entriesWrite(row, entries, obj) { for (const { name, index } of entries ?? []) if (Number.isInteger(index) && index >= 0) row[index] = str(obj?.[name === 'Elemental' ? 'Conflux' : name]); }
function columnMapWrite(row, mapping, obj) { for (const [key, index] of Object.entries(mapping ?? {})) if (Number.isInteger(index) && index >= 0) row[index] = str(obj?.[key]); }
function fillZone(row, zone, sch) {
    const c = sch.columns;
    for (const [key, idx] of [['id', c.ZONE_ID], ['human_start', c.HUMAN_START], ['computer_start', c.COMPUTER_START], ['treasure', c.TREASURE], ['junction', c.JUNCTION], ['base_size', c.BASE_SIZE], ['ownership', c.OWNERSHIP], ['towns_same_type', c.TOWNS_SAME_TYPE], ['terrain_match', c.TERRAIN_MATCH], ['monster_strength', c.MONSTER_STRENGTH], ['monster_match', c.MONSTER_MATCH]])
        row[idx] = str(zone[key]);
    setPos(row, c, '', zone.positions);
    setTowns(row, c, 'PLAYER_', zone.player_towns);
    setTowns(row, c, 'NEUTRAL_', zone.neutral_towns);
    entriesWrite(row, sch.townColumns, zone.town_types);
    entriesWrite(row, sch.minMineColumns, zone.min_mines);
    entriesWrite(row, sch.mineDensityColumns, zone.mine_density);
    entriesWrite(row, sch.terrainColumns, zone.terrains);
    entriesWrite(row, sch.monsterColumns, zone.monster_factions);
    for (let t = 0; t < 3; t++) {
        const tier = zone.treasure_tiers[t] ?? {};
        const cols = sch.treasureColumns ?? [];
        if (Number.isInteger(cols[t * 3])) row[cols[t * 3]] = str(tier.low);
        if (Number.isInteger(cols[t * 3 + 1])) row[cols[t * 3 + 1]] = str(tier.high);
        if (Number.isInteger(cols[t * 3 + 2])) row[cols[t * 3 + 2]] = str(tier.density);
    }
    if (sch.isHota)
        columnMapWrite(row, sch.zoneOptionColumns, zone.zone_options);
}
function fillConn(row, conn, sch) {
    const c = sch.columns;
    for (const [key, col] of [['zone1', c.CONN_ZONE1], ['zone2', c.CONN_ZONE2], ['value', c.CONN_VALUE], ['wide', c.CONN_WIDE], ['border_guard', c.CONN_BORDER_GUARD]])
        row[col] = str(conn[key]);
    if (sch.isHota)
        for (const [key, col] of [['road', c.CONN_ROAD], ['conn_type', c.CONN_TYPE], ['fictive', c.CONN_FICTIVE], ['portal_repulsion', c.CONN_PORTAL_REPULSION]])
            if (Number.isInteger(col) && col >= 0)
                row[col] = str(conn[key]);
    setPos(row, c, 'CONN_', conn.positions);
}
export function serializePack(pack, { format = pack.format, packName = '' } = {}) {
    if (!FORMATS[format])
        throw new Error('Unknown output format.');
    if (format === pack.format && !pack.dirty && pack.originalBytes) {
        return { bytes: pack.originalBytes.slice(), text: null, pack, warnings: [...pack.warnings] };
    }
    const sameFormat = format === pack.format;
    const converted = sameFormat ? pack : convertPack(pack, format, { packName });
    const sch = schemaForPack(converted, format), c = sch.columns, width = sch.isHota ? c.TOTAL + 1 : c.ACTIVE_COLS;
    const headers = converted.header_rows?.length === 3 ? converted.header_rows : sch.headers;
    const rows = headers.map(row => [...row]);
    const zoneColumnSet = new Set(sch.zoneColumns?.length ? sch.zoneColumns : Array.from({ length: Math.max(0, c.CONN_ZONE1 - c.ZONE_ID) }, (_, i) => c.ZONE_ID + i));
    const countKeys = ['FIELD_COUNT_TOWN', 'FIELD_COUNT_TERRAIN', 'FIELD_COUNT_ZONE_TYPE', 'FIELD_COUNT_PACK_NEW', 'FIELD_COUNT_MAP_NEW', 'FIELD_COUNT_ZONE_NEW', 'FIELD_COUNT_CONN_NEW'];
    const metaKeys = ['PACK_NAME', 'PACK_DESC', 'PACK_TOWN_SELECTION', 'PACK_HEROES', 'PACK_MIRROR', 'PACK_TAGS', 'PACK_MAX_BATTLE_ROUNDS', 'PACK_FORBID_HIRING_HEROES'];
    const mapOptionKeys = ['MAP_ARTIFACTS', 'MAP_COMBO_ARTS', 'MAP_SPELLS', 'MAP_SECONDARY_SKILLS', 'MAP_OBJECTS', 'MAP_ROCK_BLOCKS', 'MAP_ZONE_SPARSENESS', 'MAP_SPECIAL_WEEKS_DISABLED', 'MAP_SPELL_RESEARCH', 'MAP_ANARCHY'];

    converted.maps.forEach((tm, mi) => {
        const baseCount = Math.max(tm.zones.length, tm.connections.length, 1);
        const attachedExtras = new Map(), standaloneExtras = [];
        if (sameFormat) {
            for (const extra of tm.row_extras ?? []) {
                const ci = Number.isInteger(extra?.connection_index) ? extra.connection_index : null;
                if (ci != null && ci >= tm.zones.length && ci < tm.connections.length && !attachedExtras.has(ci))
                    attachedExtras.set(ci, extra);
                else
                    standaloneExtras.push(extra);
            }
        }
        const unknownAttached = new Map(), unknownStandalone = [];
        if (sameFormat) {
            for (const extra of tm.unknown_rows ?? []) {
                let target = null;
                if (Number.isInteger(extra?.zone_index) && extra.zone_index >= 0 && extra.zone_index < tm.zones.length)
                    target = extra.zone_index;
                else if (Number.isInteger(extra?.connection_index) && extra.connection_index >= 0 && extra.connection_index < tm.connections.length)
                    target = extra.connection_index;
                else if (extra?.map_row)
                    target = 0;
                if (target == null)
                    unknownStandalone.push(extra);
                else {
                    const merged = unknownAttached.get(target) ?? {};
                    Object.assign(merged, extra.columns ?? {});
                    unknownAttached.set(target, merged);
                }
            }
        }
        const count = baseCount + standaloneExtras.length + unknownStandalone.length;
        for (let i = 0; i < count; i++) {
            const row = Array(width).fill('');
            if (unknownAttached.has(i))
                for (const [column, value] of Object.entries(unknownAttached.get(i)))
                    if (+column >= 0 && +column < width)
                        row[+column] = value;
            if (sch.isHota && mi === 0 && i === 0) {
                COUNTS.forEach((field, j) => {
                    const index = c[countKeys[j]];
                    if (Number.isInteger(index) && index >= 0) row[index] = str(converted.field_counts?.[field]);
                });
                META.forEach((field, j) => {
                    const index = c[metaKeys[j]];
                    if (Number.isInteger(index) && index >= 0) row[index] = str(converted.metadata?.[field]);
                });
            }
            if (i === 0) {
                row[sch.isHota ? c.MAP_NAME : c.NAME] = tm.name;
                row[sch.isHota ? c.MAP_MIN_SIZE : c.MIN_SIZE] = tm.min_size;
                row[sch.isHota ? c.MAP_MAX_SIZE : c.MAX_SIZE] = tm.max_size;
                if (sch.isHota)
                    MAPOPT.forEach((field, j) => {
                        const index = c[mapOptionKeys[j]];
                        if (Number.isInteger(index) && index >= 0) row[index] = str(tm.options?.[field]);
                    });
            }
            if (i < tm.zones.length)
                fillZone(row, tm.zones[i], sch);
            if (attachedExtras.has(i))
                for (const [column, value] of Object.entries(attachedExtras.get(i).columns ?? {}))
                    if (zoneColumnSet.has(+column))
                        row[+column] = value;
            if (i < tm.connections.length)
                fillConn(row, tm.connections[i], sch);
            if (i >= baseCount && i < baseCount + standaloneExtras.length) {
                const extra = standaloneExtras[i - baseCount];
                for (const [column, value] of Object.entries(extra?.columns ?? {}))
                    if (zoneColumnSet.has(+column))
                        row[+column] = value;
            }
            if (i >= baseCount + standaloneExtras.length) {
                const extra = unknownStandalone[i - baseCount - standaloneExtras.length];
                for (const [column, value] of Object.entries(extra?.columns ?? {}))
                    if (+column >= 0 && +column < width)
                        row[+column] = value;
            }
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
    p.source_schema = null;
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
            Object.assign(conn, SCHEMA.sodToHotaDefaults.connection);
        }
    }
    return p;
}
function hota17To18(input) {
    const p = clone(input);
    p.format = 'hota18';
    p.source_schema = null;
    p.header_rows = clone(SCHEMA.formats.hota18.headers);
    p.field_counts.town = '12';
    for (const m of p.maps) {
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
    p.source_schema = null;
    p.header_rows = clone(SCHEMA.formats.hota17.headers);
    p.field_counts.town = '11';
    let affected = 0;
    for (const m of p.maps) {
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
    p.source_schema = null;
    p.header_rows = clone(SCHEMA.formats.sod.headers);
    if (p.metadata && mval(p.metadata))
        p.warnings.push('Conversion loss: HotA template pack metadata dropped (not available in SoD).');
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
        }
    }
    for (const [key, desc] of Object.entries({ map: 'template options', zone: 'zone options', conn: 'connection options', terrain: 'Highlands/Wasteland terrains', town: 'newer town factions', monster: 'newer monster factions', zero: 'zones left without a terrain' }))
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
    const extraRows = p.maps.reduce((sum, map) => sum + (map.row_extras?.length ?? 0), 0);
    if (extraRows) {
        p.warnings.push(`Conversion loss: ${extraRows} row(s) contain zone-column data without a Zone ID; this invalid source data cannot be mapped to the target format.`);
        for (const map of p.maps)
            map.row_extras = [];
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
    p.maps.forEach(m => {
        if (to === 'sod')
            m.layout = { ...m.layout };
    });
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
    const issues = (pack.source_issues ?? []).map(issue => ({ ...issue }));
    const positiveId = value => /^[1-9]\d*$/.test(str(value).trim());
    pack.maps.forEach((m, mi) => {
        const ids = m.zones.map(z => str(z.id).trim());
        const counts = new Map();
        for (const id of ids)
            counts.set(id, (counts.get(id) ?? 0) + 1);
        for (const [zi, id] of ids.entries()) {
            if (!positiveId(id)) {
                issues.push({ level: 'error', map: mi, code: 'invalid_zone_id', zone: zi, args: { id, zone: zi + 1 }, text: `${m.name}: zone #${zi + 1} has invalid ID ${id || '(empty)'}; Zone ID must be a positive integer.` });
            }
        }
        for (const [id, count] of counts) {
            if (id && count > 1)
                issues.push({ level: 'error', map: mi, code: 'duplicate_zone_id', args: { id, count }, text: `${m.name}: duplicate zone ID ${id} (${count} zones).` });
        }
        for (const extra of m.row_extras ?? []) {
            const fields = Object.entries(extra.columns ?? {}).map(([column, value]) => ({
                column: Number(column),
                label: pack.header_rows?.[2]?.[Number(column)] || `Column ${Number(column) + 1}`,
                value: str(value)
            }));
            if (fields.length)
                issues.push({ level: 'error', map: mi, code: 'orphan_zone_data', args: { line: extra.line, count: fields.length }, fields, text: `${m.name}, line ${extra.line}: ${fields.length} zone-column value(s) are present without a Zone ID.` });
        }
        const validIds = new Set(ids.filter(id => positiveId(id) && counts.get(id) === 1));
        for (const [ci, conn] of m.connections.entries()) {
            const zone1 = str(conn.zone1).trim(), zone2 = str(conn.zone2).trim();
            const reasons = [];
            for (const [field, value] of [['zone1', zone1], ['zone2', zone2]]) {
                if (!value)
                    reasons.push({ code: 'missing_endpoint', field });
                else if (!positiveId(value))
                    reasons.push({ code: 'invalid_endpoint', field, value });
                else if (!counts.has(value))
                    reasons.push({ code: 'unknown_zone', field, value });
                else if (!validIds.has(value))
                    reasons.push({ code: 'ambiguous_zone', field, value });
            }
            if (reasons.length) {
                const reasonText = reasons.map(reason => {
                    const field = reason.field === 'zone1' ? 'Zone 1' : 'Zone 2';
                    if (reason.code === 'missing_endpoint') return `${field} is empty`;
                    if (reason.code === 'invalid_endpoint') return `${field}=${reason.value} is not a positive integer`;
                    if (reason.code === 'unknown_zone') return `${field} references missing zone ${reason.value}`;
                    return `${field} references duplicate/invalid zone ${reason.value}`;
                }).join('; ');
                issues.push({ level: 'error', map: mi, code: 'invalid_connection', connection: ci, args: { index: ci + 1, zone1, zone2 }, reasons, text: `${m.name}: connection #${ci + 1} (${zone1 || '∅'} ↔ ${zone2 || '∅'}): ${reasonText}.` });
            }
        }
        for (const z of m.zones) {
            if (!on(z.terrain_match) && !Object.values(z.terrains).some(on))
                issues.push({ level: 'warning', map: mi, code: 'no_terrain', args: { id: z.id }, text: `${m.name}, zone ${z.id}: no terrain enabled.` });
            if (!on(z.monster_match) && !Object.values(z.monster_factions).some(on))
                issues.push({ level: 'warning', map: mi, code: 'no_monsters', args: { id: z.id }, text: `${m.name}, zone ${z.id}: no monster factions enabled.` });
        }
    });
    return issues;
}
