import { SCHEMA, FORMATS, parseBytes, parseText, serializePack, convertPack, freshPack, freshZone, freshConnection, validatePack, renumberMap, remapHintRefsDetailed } from './core.js';
import { autoLayout, topologyLayout, compactLayout, resizeLayout, saveImagePositions, separate, CARD_W, CARD_H } from './layout.js';
import { connectionGeometry, connectionBundles } from './geometry.js';
import { createSidecar, readSidecar } from './sidecar.js';
import { compactExact, treasureScore, zoneAppearance, townEntries, mineEntries, connectionAppearance, connectionDisplayLabel, isRenderableConnection } from './visuals.js';
import { initializeLanguage, setLanguage, getLanguage, translateText, message } from './i18n.js';
import { createTemplatePicker } from './ui/template-picker.js';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const upper = s => s === 'sod' ? 'SoD' : s === 'hota17' ? 'HotA 1.7' : 'HotA 1.8';
const flag = s => String(s ?? '').trim().toLowerCase() === 'x';
const icon = (name, size = 16) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const store = { pack: null, mapIndex: 0, selected: { kind: 'map', index: 0 }, tab: 'general', inspectorView: 'selection', scale: 1, tx: 0, ty: 0,
    viewport: { w: 700, h: 600 }, drag: null, connectMode: false, connectFrom: null, undo: [], redo: [], installPrompt: null, toastTimer: 0,
    fileKey: '', loaded: false, loadToken: 0, builtinId: null, presetLayouts: null };
const current = () => store.pack?.maps[store.mapIndex];
const renderableConnectionCount = map => {
    if (!map) {
        return 0;
    }
    const zoneIds = new Set(map.zones.map(zone => String(zone.id ?? '').trim()));
    return map.connections.filter(connection => isRenderableConnection(connection, zoneIds)).length;
};
const templatePicker = createTemplatePicker({ onSelect: loadBuiltin });
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(store.toastTimer); store.toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500); }
function status(s) { $('status-text').textContent = s; }
function modal(title, body, actions = [{ label: 'Close' }]) {
    $('modal-title').textContent = title;
    $('modal-content').innerHTML = body;
    const foot = $('modal-buttons');
    foot.innerHTML = '';
    for (const entry of actions) {
        const b = document.createElement('button');
        b.className = `btn ${entry.primary ? 'btn-primary' : 'btn-subtle'} ${entry.danger ? 'danger' : ''}`;
        b.textContent = entry.label;
        b.addEventListener('click', () => { if (entry.handler?.() === false)
            return; $('modal').close(); });
        foot.append(b);
    }
    $('modal').showModal();
}
$('modal-close').onclick = () => $('modal').close();
function confirmAction(title, detail, callback) { modal(title, `<p>${detail}</p>`, [{ label: 'Cancel' }, { label: 'Confirm', primary: true, handler: callback }]); }
function fileSignature(bytes, filename) { let h = 2166136261 >>> 0; for (let i = 0; i < Math.min(bytes.length, 32000); i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619) >>> 0;
} return `${filename}-${bytes.length}-${h}`; }
function capture() { return JSON.stringify({ maps: store.pack.maps, metadata: store.pack.metadata, field_counts: store.pack.field_counts }); }
function commit(label, fn) {
    if (!store.pack)
        return;
    let before = capture();
    let previousSelection = { ...store.selected }, oldTab = store.tab;
    try {
        fn();
    }
    catch (e) {
        toast(e.message);
        return;
    }
    if (before === capture())
        return;
    store.undo.push({ snapshot: before, selection: previousSelection, tab: oldTab, label });
    if (store.undo.length > (store.pack.maps.length > 90 ? 18 : 50))
        store.undo.shift();
    store.redo = [];
    store.pack.dirty = true;
    persistLayout();
    renderAll();
    status(label);
}
function restore(data) {
    const snap = JSON.parse(data.snapshot);
    store.pack.maps = snap.maps;
    store.pack.metadata = snap.metadata;
    store.pack.field_counts = snap.field_counts;
    store.selected = data.selection;
    store.tab = data.tab;
    store.mapIndex = Math.min(store.mapIndex, store.pack.maps.length - 1);
    store.pack.dirty = true;
    persistLayout();
    renderAll();
}
function undo() { if (!store.undo.length)
    return; const change = store.undo.pop(); store.redo.push({ snapshot: capture(), selection: { ...store.selected }, tab: store.tab, label: change.label }); restore(change); status(message('undone', translateText(change.label))); }
function redo() { if (!store.redo.length)
    return; const change = store.redo.pop(); store.undo.push({ snapshot: capture(), selection: { ...store.selected }, tab: store.tab, label: change.label }); restore(change); status(message('redone', translateText(change.label))); }
const layoutStorageKey = index => `h3tc-layout-v3-${store.fileKey}-${index}`;
function presetMatches(map, preset) { return Boolean(preset && preset.name === map.name && preset.connections === map.connections.length && preset.ids.join('\0') === map.zones.map(z => String(z.id)).join('\0')); }
function recommendedLayout(map, index) { const preset = store.presetLayouts?.[index]; return presetMatches(map, preset) ? compactLayout(structuredClone(preset.positions), { gap: 68 }) : (topologyLayout(map) || autoLayout(map, { preferStored: false })); }
function persistLayout() {
    const map = current();
    if (!map || !store.fileKey)
        return;
    try {
        localStorage.setItem(layoutStorageKey(store.mapIndex), JSON.stringify(map.layout));
    }
    catch { /* Storage can be disabled or full. */ }
}
function restoreLayout(index) {
    const map = store.pack.maps[index];
    if (!map)
        return;
    const ids = new Set(map.zones.map(z => String(z.id))), generated = recommendedLayout(map, index);
    let restored = {};
    // v3 deliberately does not import the old automatic cache namespace. It prevents
    // obsolete 1.4/1.5 layouts from overriding the newer topology engine after update.
    try {
        const json = localStorage.getItem(layoutStorageKey(index));
        if (json) {
            const parsed = JSON.parse(json);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                restored = parsed;
        }
    }
    catch { }
    restored = Object.fromEntries(Object.entries(restored).filter(([id, p]) => ids.has(String(id)) && Number.isFinite(p?.x) && Number.isFinite(p?.y)));
    const candidate = Object.keys(restored).length === ids.size ? restored : { ...generated, ...restored };
    const points = Object.values(candidate), pad = 46;
    const crowded = points.some((a, i) => points.slice(i + 1).some(b => Math.abs(a.x - b.x) < CARD_W + pad && Math.abs(a.y - b.y) < CARD_H + pad));
    map.layout = crowded ? separate(candidate, 68) : candidate;
}
let upstreamLayoutsPromise = null;
async function loadUpstreamLayouts() {
    if (!upstreamLayoutsPromise)
        upstreamLayoutsPromise = fetch('./templates/upstream-layouts.json', { cache: 'no-store' }).then(r => { if (!r.ok)
            throw new Error('Layout catalog unavailable'); return r.json(); }).catch(error => { upstreamLayoutsPromise = null; throw error; });
    return upstreamLayoutsPromise;
}
function matchPackPresets(pack, layouts) {
    const pool = Object.values(layouts?.templates ?? {}).flat(), used = new Set();
    return pack.maps.map(map => {
        const key = map.name + '\0' + map.connections.length + '\0' + map.zones.map(z => String(z.id)).join('\0');
        const index = pool.findIndex((preset, i) => !used.has(i) && (preset.name + '\0' + preset.connections + '\0' + preset.ids.join('\0')) === key);
        if (index < 0)
            return null;
        used.add(index);
        return pool[index];
    });
}
async function openFile(file) {
    if (!file)
        return;
    const token = ++store.loadToken;
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!/\.(h3t|txt)$/i.test(file.name))
            throw new Error(translateText('Unsupported file type. Choose a .txt (SoD) or .h3t (HotA) template.'));
        if (bytes.some(b => b === 0) || bytes.slice(0, 4096).some(b => b < 9 || (b > 13 && b < 32)))
            throw new Error(translateText('The file contains binary data and is not a text SoD/HotA template.'));
        const pack = parseBytes(bytes, { filename: file.name });
        if (token !== store.loadToken)
            return;
        let presetLayouts = null;
        try {
            presetLayouts = matchPackPresets(pack, await loadUpstreamLayouts());
        }
        catch (error) {
            console.warn('Canonical layout catalog unavailable:', error);
        }
        if (token !== store.loadToken)
            return;
        setPack(pack, bytes, null, presetLayouts);
        const total = pack.maps.reduce((s, m) => s + m.zones.length, 0);
        toast(message('opened_pack', file.name, pack.maps.length, total));
    }
    catch (e) {
        modal(translateText('Open failed'), `<p>${esc(e?.message || e)}</p><p>${esc(translateText('Text templates SoD, HotA 1.7.x and HotA 1.8.x are supported.'))}</p>`);
    }
}
function setPack(pack, bytes = null, builtinId = null, presetLayouts = null) {
    $('canvas-legend').open = false;
    store.pack = pack;
    store.builtinId = builtinId;
    store.presetLayouts = presetLayouts;
    templatePicker.setValue(builtinId || '');
    store.mapIndex = 0;
    store.selected = { kind: 'map', index: 0 };
    store.tab = 'general';
    store.inspectorView = 'selection';
    store.undo = [];
    store.redo = [];
    store.connectMode = false;
    store.connectFrom = null;
    store.fileKey = fileSignature(bytes ?? new TextEncoder().encode(pack.filename), pack.filename);
    restoreLayout(0);
    store.loaded = true;
    $('export-format').value = pack.format;
    renderAll();
    requestAnimationFrame(() => fitView(true));
    status(message('loaded', `${pack.filename} (${upper(pack.format)})`));
}
async function initializeCatalog() {
    const select = $('built-in-select');
    try {
        const response = await fetch('./templates/catalog.json', { cache: 'no-store' });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const catalog = await response.json();
        if (!Array.isArray(catalog.templates) || catalog.count !== catalog.templates.length)
            throw new Error('Invalid built-in catalog.');
        templatePicker.setItems(catalog.templates.map(entry => ({ id: entry.id, name: entry.name, file: entry.file })));
        templatePicker.setDisabled(false);
        select.setAttribute('aria-label', translateText('Built-in templates'));
        $('builtin-count').textContent = `${catalog.count} SoD`;
    }
    catch (error) {
        console.warn('Built-in catalog unavailable:', error);
        templatePicker.setDisabled(true);
        toast('Built-in template list unavailable: ' + error.message);
    }
}
async function loadBuiltin(id) {
    const entry = templatePicker.entries.find(item => item.id === id);
    if (!id || !entry) {
        templatePicker.setValue(store.builtinId || '');
        return;
    }
    if (store.pack?.dirty && !confirm(translateText('Unsaved changes will be lost. Continue?'))) {
        templatePicker.setValue(store.builtinId || '');
        return;
    }
    const token = ++store.loadToken;
    templatePicker.setDisabled(true);
    try {
        const response = await fetch('./templates/' + encodeURIComponent(entry.file), { cache: 'no-store' });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (token !== store.loadToken)
            return;
        const pack = parseBytes(bytes, { filename: entry.name + '.txt' });
        let presetLayouts = null;
        try {
            const layouts = await loadUpstreamLayouts();
            presetLayouts = layouts.templates[id] || null;
        }
        catch (error) {
            console.warn('Upstream layout unavailable, using browser layout:', error);
        }
        setPack(pack, bytes, id, presetLayouts);
    }
    catch (e) {
        if (token !== store.loadToken)
            return;
        templatePicker.setValue(store.builtinId || '');
        toast('Cannot open built-in template: ' + e.message);
    }
    finally {
        templatePicker.setDisabled(false);
    }
}
function selectMap(index) {
    if (!store.pack?.maps[index])
        return;
    $('canvas-legend').open = false;
    persistLayout();
    store.mapIndex = index;
    restoreLayout(index);
    store.selected = { kind: 'map', index };
    store.tab = 'general';
    store.inspectorView = 'selection';
    store.connectMode = false;
    store.connectFrom = null;
    $('sidebar').classList.remove('open');
    renderAll();
    requestAnimationFrame(() => fitView(true));
}
function renderAll() { renderSidebar(); renderToolbar(); renderCanvas(); renderLegend(); renderInspector(); renderStatus(); }
function renderSidebar() {
    const pack = store.pack;
    $('package-name').textContent = pack?.metadata?.name || pack?.filename || 'New pack';
    $('current-format').textContent = pack ? upper(pack.format) : '—';
    $('map-count').textContent = message('template_count', pack?.maps.length || 0);
    const filter = $('map-search').value.toLocaleLowerCase();
    $('map-list').innerHTML = pack?.maps.map((m, i) => m.name.toLocaleLowerCase().includes(filter) ? `<button type="button" class="map-item ${i === store.mapIndex ? 'active' : ''}" data-map-index="${i}" title="${esc(m.name)}"><span class="map-number">${i + 1}</span><span class="map-text"><strong>${esc(m.name || 'Untitled')}</strong><small>${message('template_stats', m.zones.length, renderableConnectionCount(m))}</small></span></button>` : '').join('') || '<div class="field-note empty-list-note">' + esc(translateText('No templates found.')) + '</div>';
}
$('map-list').addEventListener('click', e => { const btn = e.target.closest('[data-map-index]'); if (btn)
    selectMap(+btn.dataset.mapIndex); });
$('map-search').addEventListener('input', renderSidebar);
function renderToolbar() {
    const map = current();
    $('toolbar-format').textContent = store.pack ? upper(store.pack.format) : '—';
    $('map-title').textContent = map?.name || translateText('No template selected');
    $('map-title').setAttribute('aria-label', $('map-title').textContent);
    hideMapTitle();
    $('map-stats').textContent = map ? message('template_stats', map.zones.length, renderableConnectionCount(map)) : '';
    for (const id of ['add-zone-btn', 'add-conn-btn', 'undo-btn', 'redo-btn', 'save-btn', 'convert-btn'])
        $(id).disabled = !store.pack || (id === 'undo-btn' && !store.undo.length) || (id === 'redo-btn' && !store.redo.length) || (id === 'add-zone-btn' && !map) || (id === 'add-conn-btn' && !map);
    $('add-conn-btn').style.background = store.connectMode ? 'var(--accent-bg)' : '';
}
const fullTitleTooltip = $('map-title-tooltip');
function showMapTitle() {
    const title = $('map-title'), rect = title.getBoundingClientRect();
    if (title.scrollWidth <= title.clientWidth + 2) {
        fullTitleTooltip.hidden = true;
        return;
    }
    fullTitleTooltip.textContent = title.textContent;
    fullTitleTooltip.style.width = Math.min(540, window.innerWidth - 24) + 'px';
    fullTitleTooltip.hidden = false;
    const w = fullTitleTooltip.getBoundingClientRect().width;
    fullTitleTooltip.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - w - 12)) + 'px';
    const h = fullTitleTooltip.getBoundingClientRect().height;
    fullTitleTooltip.style.top = (rect.bottom + h + 12 < window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - h - 8)) + 'px';
}
function hideMapTitle() { fullTitleTooltip.hidden = true; }
$('map-title').addEventListener('mouseenter', showMapTitle);
$('map-title').addEventListener('mouseleave', hideMapTitle);
$('map-title').addEventListener('focus', showMapTitle);
$('map-title').addEventListener('blur', hideMapTitle);
window.addEventListener('resize', hideMapTitle);
function renderStatus() {
    const map = current();
    $('status-zones').textContent = message('count_zones', map?.zones.length || 0);
    $('status-conns').textContent = message('count_connections', renderableConnectionCount(map));
    $('dirty-indicator').textContent = translateText(store.pack?.dirty ? '● Modified' : '✓ Saved');
    $('dirty-indicator').style.color = store.pack?.dirty ? 'var(--treasure)' : 'var(--soft)';
    $('zoom-value').textContent = Math.round(store.scale * 100) + '%';
}
function bounds(map = current()) {
    const p = Object.values(map?.layout ?? {});
    if (!p.length)
        return { x: 0, y: 0, w: 620, h: 430 };
    const minX = Math.min(...p.map(v => v.x)) - 145, minY = Math.min(...p.map(v => v.y)) - 70, maxX = Math.max(...p.map(v => v.x + CARD_W)) + 145, maxY = Math.max(...p.map(v => v.y + CARD_H)) + 70;
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}
function fitView(initial = false) {
    const m = current();
    if (!m || !m.zones.length)
        return;
    const box = $('canvas').getBoundingClientRect();
    store.viewport = { w: box.width || 700, h: box.height || 500 };
    let b = bounds(m);
    const fit = Math.min(2.3, Math.max(.12, Math.min((store.viewport.w - 36) / b.w, (store.viewport.h - 92) / b.h)));
    // Initial load and Fit must display every node and every endpoint label.
    store.scale = fit;
    store.tx = (store.viewport.w - b.w * store.scale) / 2 - b.x * store.scale;
    store.ty = (store.viewport.h - b.h * store.scale) / 2 - b.y * store.scale;
    finishCanvasTransform();
}
// Keep pointer events cheap: draw at most once per animation frame. A CSS transform
// lets the browser composite the cached SVG layer instead of repainting all icons
// and SVG drop shadows for every high-frequency pointer event.
let canvasFrame = 0;
let renderedZoom = null;
let dragRect = null;
function flushCanvasTransform() {
    canvasFrame = 0;
    const css = `translate3d(${store.tx}px, ${store.ty}px, 0) scale(${store.scale})`;
    const svg = `translate(${store.tx} ${store.ty}) scale(${store.scale})`;
    for (const id of ['canvas-content', 'drag-preview']) {
        const layer = $(id);
        layer.style.transform = css;
        // Preserve the SVG transform attribute for serialization, inspection and
        // browsers that fall back from compositor-backed CSS transforms.
        layer.setAttribute('transform', svg);
    }
}
function updateZoomIndicator() {
    const zoom = Math.round(store.scale * 100), label = zoom + '%';
    if (zoom !== renderedZoom || $('zoom-value').textContent !== label) {
        $('zoom-value').textContent = label;
        renderedZoom = zoom;
    }
}
function transformCanvas() { updateZoomIndicator(); if (!canvasFrame)
    canvasFrame = requestAnimationFrame(flushCanvasTransform); }
function finishCanvasTransform() { if (canvasFrame) {
    cancelAnimationFrame(canvasFrame);
    canvasFrame = 0;
} flushCanvasTransform(); updateZoomIndicator(); }
function zoomAt(factor, x = store.viewport.w / 2, y = store.viewport.h / 2) {
    const old = store.scale, ne = Math.max(.14, Math.min(3.5, old * factor));
    store.tx = x - (x - store.tx) * ne / old;
    store.ty = y - (y - store.ty) * ne / old;
    store.scale = ne;
    finishCanvasTransform();
}
const world = ({ x, y }) => ({ x: (x - store.tx) / store.scale, y: (y - store.ty) / store.scale });
const mousePos = e => { const b = dragRect ?? $('canvas').getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
const touchPoints = new Map();
let pinch = null;
const pinchGeometry = () => { const [a, b] = [...touchPoints.values()]; return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
const zoneType = z => flag(z.human_start) || flag(z.computer_start) ? 'start' : flag(z.treasure) || flag(z.junction) ? 'treasure' : 'neutral';
const swordCount = zone => ({ weak: 1, avg: 2, average: 2, normal: 2, strong: 3 })[String(zone.monster_strength ?? '').trim().toLowerCase()] || Math.min(3, Math.max(0, parseInt(zone.monster_strength) || 0));
// The icon symbols are shipped with the page, so diagram and PNG export stay offline.
const GLYPH_COLORS = { chest: '#cc9957', swords: '#ccd2dd' };
const svgIcon = (name, x, y, size, color = '') => `<use class="h3-icon h3-icon-${esc(name)}" href="#h3-${esc(String(name).toLowerCase())}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
const BORDER_GUARD_ICON_SIZE = 18;
function connectionLabelMetrics(connection) {
    const visual = connectionAppearance(connection);
    const label = connectionDisplayLabel(connection);
    const valueText = visual.border ? label.replace(/^┃\s?/, '') : label;
    if (!label) {
        return { label: '', valueText: '', width: 0, border: visual.border };
    }
    const width = visual.border
        ? Math.max(44, (valueText ? valueText.length * 14 + 44 : 38))
        : Math.max(44, valueText.length * 14 + 20);
    return { label, valueText, width, border: visual.border };
}
function renderConnectionLabel(path, connection, visual) {
    const metrics = connectionLabelMetrics(connection);
    if (!metrics.label) {
        return '';
    }
    const rect = `<rect class="conn-label-bg" x="${path.x - metrics.width / 2}" y="${path.y - 18}" width="${metrics.width}" height="36" rx="8"/>`;
    if (!metrics.border) {
        return `${rect}<text class="conn-label" x="${path.x}" y="${path.y}">${esc(metrics.valueText)}</text>`;
    }
    if (!metrics.valueText) {
        return `${rect}<use class="conn-label-icon" href="#h3-keymaster-tent" x="${path.x - BORDER_GUARD_ICON_SIZE / 2}" y="${path.y - BORDER_GUARD_ICON_SIZE / 2}" width="${BORDER_GUARD_ICON_SIZE}" height="${BORDER_GUARD_ICON_SIZE}"/>`;
    }
    const left = path.x - metrics.width / 2;
    const iconX = left + 10;
    const textX = iconX + BORDER_GUARD_ICON_SIZE + 6;
    return `${rect}<use class="conn-label-icon" href="#h3-keymaster-tent" x="${iconX}" y="${path.y - BORDER_GUARD_ICON_SIZE / 2}" width="${BORDER_GUARD_ICON_SIZE}" height="${BORDER_GUARD_ICON_SIZE}"/><text class="conn-label conn-label-value" x="${textX}" y="${path.y}">${esc(metrics.valueText)}</text>`;
}
// The source artwork has different transparent padding inside the same 40x40 slot.
// Shift it so the visible bottoms line up at y+32, keeping one consistent gap to
// the number below. This also fixes the low crystal/sulfur/ore/fort artwork.
const SLOT_ICON_DY = { wood: -2.5, mercury: -1, ore: -3, sulfur: -4.5, crystal: -5.5, gems: -2.5, gold: 0 };
const slotIconDy = symbol => { const key = String(symbol).toLowerCase(); return key.startsWith('fort-') ? -4.5 : key.startsWith('village-') ? 0 : (SLOT_ICON_DY[key] ?? 0); };
function smallSlot(kind, name, entry, x, y, owner = '0') {
    const label = compactExact(entry.min) + entry.suffix, raw = entry.min + (entry.density ? ' / ' + entry.density : '');
    const colored = kind === 'town' && entry.faction === 'player' && +owner >= 1 && +owner <= 8;
    const symbol = kind === 'town' ? (name === 'castle' ? 'fort' : 'village') + '-' + (colored ? owner : 'neutral') : name;
    const metadata = kind === 'mine' ? `data-resource="${esc(entry.resource)}"` : `data-faction="${esc(entry.faction)}" data-building="${esc(name)}"`;
    return `<g class="h3-slot h3-slot-${kind} ${Number(entry.min) === 0 ? 'optional' : ''}" ${metadata} data-count-raw="${esc(entry.min)}" data-density-raw="${esc(entry.density)}">
    <title>${esc((kind === 'mine' ? entry.resource : entry.faction + ' ' + name) + ': ' + raw)}</title>
    ${svgIcon(symbol, x, y + slotIconDy(symbol), 40)}<text class="h3-slot-count ${label.length > 5 ? 'count-condensed' : ''}" x="${x + 20}" y="${y + 44}" text-anchor="middle">${esc(label)}</text></g>`;
}
function canvasMarkup(map) {
    const nodesById = new Map(map.zones.map(z => [z.id.trim(), z]));
    const zoneIds = new Set(nodesById.keys());
    const visibleIndexes = map.connections
        .map((connection, index) => ({ connection, index }))
        .filter(({ connection }) => isRenderableConnection(connection, zoneIds))
        .map(({ index }) => index);
    const geometry = connectionGeometry(map.connections, map.layout, { width: CARD_W, height: CARD_H,
        labelWidths: map.connections.map(c => connectionLabelMetrics(c).width) });
    const edges = visibleIndexes.map(i => {
        const c = map.connections[i], visual = connectionAppearance(c), path = geometry[i];
        if (!path)
            return '';
        const className = `connection ${store.selected.kind === 'connection' && store.selected.index === i ? 'selected' : ''} ${visual.wide ? 'conn-wide' : ''} ${visual.fictive ? 'conn-fictive' : ''} ${visual.roadRequired ? 'conn-road-required' : ''} ${visual.roadForbidden ? 'conn-roadless' : ''} ${visual.border ? 'conn-border' : ''} ${visual.type === 'teleport' ? 'conn-teleport' : ''}`;
        const raw = strVal(c.value).trim();
        const aria = message('connection_aria', c.zone1, c.zone2, raw || '0');
        const details = message('connection_title', c.zone1, c.zone2, raw || '0', '', '', '');
        return `<g class="${className}" data-conn-index="${i}" data-parallel-count="${path.total || 1}" data-lane="${path.lane ?? 0}" data-value-raw="${esc(raw)}" aria-label="${esc(aria)}"><title>${esc(details)}</title>
    <path class="conn-line" d="${path.d}"/>${visual.roadRequired ? `<path class="conn-road-overlay" d="${path.d}"/>` : ''}<path class="conn-hit" d="${path.d}"/>
    ${renderConnectionLabel(path, c, visual)}</g>`;
    }).join('');
    const zones = map.zones.map((z, i) => {
        const p = map.layout[z.id] ?? { x: 110 + i * 240, y: 120 }, appearance = zoneAppearance(z), selected = store.selected.kind === 'zone' && store.selected.index === i;
        const owner = appearance.owner || '0', towns = townEntries(z), mines = mineEntries(z), strength = String(z.monster_strength ?? '').trim().toLowerCase();
        const swords = swordCount(z);
        // Keep factions distinct (player-colored roofs versus neutral-gray roofs).
        const playerTowns = towns.filter(t => t.faction === 'player'), neutralTowns = towns.filter(t => t.faction === 'neutral');
        const townRow = (playerTowns.length ? `<text class="node-section-caption" x="9" y="85">P:</text>` + playerTowns.map((entry, j) => smallSlot('town', entry.kind, entry, 32 + j * 44, 70, owner)).join('') : '') +
            (neutralTowns.length ? `<text class="node-section-caption" x="${playerTowns.length ? 117 : 9}" y="85">N:</text>` + neutralTowns.map((entry, j) => smallSlot('town', entry.kind, entry, (playerTowns.length ? 138 : 32) + j * 44, 70)).join('') : '');
        const mineStart = towns.length ? 120 : 79;
        const mineRow = mines.map((entry, j) => smallSlot('mine', entry.resource, entry, 7 + (j % 5) * 44, mineStart + Math.floor(j / 5) * 43)).join('');
        const placement = String(z.zone_options?.placement ?? '').trim().toLowerCase();
        const groundIcon = ['ground', 'underground'].includes(placement) ? `<text class="node-placement" x="${CARD_W - 50}" y="58">${placement === 'ground' ? '↑' : '↓'}</text>` : '';
        const modified = Boolean(String(z.zone_options?.objects ?? '').trim());
        return `<g class="node ${selected ? 'selected' : ''}" data-zone-index="${i}" data-owner="${owner}" data-richness="${appearance.richness}" data-junction="${appearance.junction ? 'true' : 'false'}" transform="translate(${p.x} ${p.y})" role="button" tabindex="0" aria-label="${esc(appearance.owner ? message('zone_aria_player', z.id, appearance.owner, appearance.score) : message('zone_aria_neutral', z.id, appearance.score))}">
    <title>${esc(message('zone_title', z.id, appearance.score, z.base_size || '—') + ' | ' + mines.map(m => m.resource + ' ' + m.min + (m.density ? '/' + m.density : '')).join(', '))}</title>
    <rect class="node-border" width="${CARD_W}" height="${CARD_H}" rx="8"/>
    ${appearance.junction ? `<rect class="node-junction-rim" width="${CARD_W - 14}" height="${CARD_H - 14}" x="7" y="7" rx="5"/>` : ''}
    <g class="node-head">${svgIcon('chest', 6, 3, 43)}<text class="node-treasure" x="55" y="35" ${String(compactExact(appearance.score)).length > 4 ? 'style="font-size:24px"' : String(compactExact(appearance.score)).length > 3 ? 'style="font-size:29px"' : ''}>${esc(compactExact(appearance.score))}${modified ? '*' : ''}</text>
    ${Array.from({ length: swords }, (_, j) => svgIcon('swords', CARD_W - 7 - (j + 1) * 30, 7, 30)).join('')}
    <text class="node-size" x="11" y="62">S ${esc(z.base_size || '—')}</text>${appearance.computer ? `<text class="node-cpu" x="${CARD_W - 14}" y="61" text-anchor="end">CPU</text>` : ''}</g>
    ${townRow}
    ${mineRow}${groundIcon}
    <text class="node-id-label" x="${CARD_W - 10}" y="${CARD_H - 9}" text-anchor="end">${esc(z.id)}</text></g>`;
    }).join('');
    return edges + zones;
}
const strVal = v => String(v ?? '');
// The canvas legend describes only symbols present in the selected map. It intentionally
// lives outside the SVG so it remains readable regardless of the current zoom.
const legendIcon = name => `<svg class="legend-icon" viewBox="0 0 64 64" aria-hidden="true"><use href="#h3-${esc(name)}" width="64" height="64"/></svg>`;
const legendSwatch = color => `<span class="legend-swatch" style="background:${color}"></span>`;
const legendItem = (symbol, description) => `<div class="legend-item">${symbol}<span>${esc(description)}</span></div>`;
const legendSection = (name, items) => items.length ? `<section class="legend-section"><h3>${esc(name)}</h3>${items.join('')}</section>` : '';
const legendLine = (cls = '') => `<svg class="legend-conn ${cls}" viewBox="0 0 36 24" aria-hidden="true"><line x1="2" y1="12" x2="34" y2="12"/>${cls === 'road-required' ? '<line class="overlay" x1="2" y1="12" x2="34" y2="12"/>' : ''}</svg>`;
const legendBorderGuardIcon = () => `<svg class="legend-border-guard" viewBox="0 0 64 64" aria-hidden="true"><use href="#h3-keymaster-tent" width="64" height="64"/></svg>`;
const legendValue = value => `<span class="legend-example">${esc(value)}</span>`;
function renderLegend() {
    const panel = $('canvas-legend');
    const content = $('legend-content');
    const map = current();
    panel.hidden = !map?.zones.length;
    if (panel.hidden) {
        content.replaceChildren();
        return;
    }
    $('legend-heading').textContent = translateText('Legend');
    const zones = map.zones;
    const zoneIds = new Set(zones.map(zone => String(zone.id).trim()));
    const links = map.connections.filter(connection => zoneIds.has(String(connection.zone1 ?? '').trim()) &&
        zoneIds.has(String(connection.zone2 ?? '').trim()));
    const looks = zones.map(zoneAppearance);
    const owners = [...new Set(looks.map(appearance => appearance.owner).filter(Boolean))]
        .sort((a, b) => Number(a) - Number(b));
    const palette = ['#e64d4d', '#7083e7', '#c8ac84', '#79c662', '#e47f16', '#a878b3', '#55c0c3', '#db98a7'];
    const ownerNames = ['Red', 'Blue', 'Tan', 'Green', 'Orange', 'Purple', 'Teal', 'Pink'];
    const zoneRows = owners.map(id => legendItem(legendSwatch(palette[Number(id) - 1]), `${translateText('Player start:')} ${translateText(ownerNames[Number(id) - 1])}`));
    const richnessRows = [
        ['low', 'var(--neutral-low)', 'Neutral: low richness'],
        ['mid', 'linear-gradient(135deg,#9fa6b2 0%,#eef2f6 36%,#a4acb7 67%,#d9dee5 100%)', 'Neutral: rich'],
        ['high', 'linear-gradient(135deg,#d5a448 0%,#fff0b7 37%,#d5a147 66%,#ffe4a0 100%)', 'Neutral: very rich']
    ];
    for (const [kind, paint, label] of richnessRows) {
        if (looks.some(appearance => !appearance.owner && appearance.richness === kind)) {
            zoneRows.push(legendItem(legendSwatch(paint), translateText(label)));
        }
    }
    if (looks.some(appearance => appearance.junction)) {
        zoneRows.push(legendItem('<span class="legend-rim"></span>', translateText('Thick gray border: junction zone')));
    }
    if (store.selected.kind === 'zone' && zones[store.selected.index]) {
        zoneRows.push(legendItem('<span class="legend-rim legend-selected-rim"></span>', translateText('Blue border: selected zone')));
    }
    if (looks.some(appearance => appearance.computer)) {
        zoneRows.push(legendItem(legendValue('CPU'), translateText('Computer-only start')));
    }
    if (zones.some(zone => String(zone.zone_options?.placement ?? '').trim().toLowerCase() === 'ground')) {
        zoneRows.push(legendItem(legendValue('↑'), translateText('Surface-only zone')));
    }
    if (zones.some(zone => String(zone.zone_options?.placement ?? '').trim().toLowerCase() === 'underground')) {
        zoneRows.push(legendItem(legendValue('↓'), translateText('Underground-only zone')));
    }
    const hasCustomObjects = zones.some(zone => String(zone.zone_options?.objects ?? '').trim());
    zoneRows.push(legendItem(legendIcon('chest'), translateText('Number: zone richness') + (hasCustomObjects ? translateText('; * marks custom object settings') : '')));
    const sizedZone = zones.find(zone => String(zone.base_size ?? '').trim());
    if (sizedZone) {
        zoneRows.push(legendItem(legendValue(`S ${esc(sizedZone.base_size)}`), translateText('S: relative base zone size')));
    }
    zoneRows.push(legendItem(legendValue(`#${esc(zones[0].id)}`), translateText('Zone ID at the bottom right')));
    const guardLabels = [
        'Unguarded objects',
        'Weak object guards',
        'Average object guards',
        'Strong object guards'
    ];
    const swords = [...new Set(zones.map(swordCount))].sort((a, b) => a - b);
    const guardRows = swords.map(count => legendItem(count ? Array.from({ length: count }, () => legendIcon('swords')).join('') : '<span class="legend-example">—</span>', translateText(guardLabels[count])));
    const townKinds = new Set(zones.flatMap(townEntries).map(entry => `${entry.faction}:${entry.kind}`));
    const townRows = [];
    if ([...townKinds].some(kind => kind.startsWith('player:'))) {
        townRows.push(legendItem(legendValue('P:'), translateText('Player towns')));
    }
    if ([...townKinds].some(kind => kind.startsWith('neutral:'))) {
        townRows.push(legendItem(legendValue('N:'), translateText('Neutral towns')));
    }
    for (const faction of ['player', 'neutral']) {
        for (const kind of ['castle', 'town']) {
            if (!townKinds.has(`${faction}:${kind}`)) {
                continue;
            }
            const owner = owners[0] || 'neutral';
            const symbol = `${kind === 'castle' ? 'fort' : 'village'}-${faction === 'player' ? owner : 'neutral'}`;
            const label = faction === 'player'
                ? (kind === 'castle' ? 'Player castle' : 'Player village')
                : (kind === 'castle' ? 'Neutral castle' : 'Neutral village');
            townRows.push(legendItem(legendIcon(symbol), translateText(label)));
        }
    }
    if (townRows.length) {
        townRows.push(legendItem(legendValue('1/3'), translateText('Below icons: minimum count / extra density')));
    }
    const resourceNames = {
        Wood: 'Wood',
        Mercury: 'Mercury',
        Ore: 'Ore',
        Sulfur: 'Sulfur',
        Crystal: 'Crystal',
        Gems: 'Gems',
        Gold: 'Gold',
        Airship: 'Airship shipyards'
    };
    const present = new Set(zones.flatMap(mineEntries).map(entry => entry.resource));
    const mineRows = Object.entries(resourceNames)
        .filter(([name]) => present.has(name))
        .map(([name, label]) => legendItem(name === 'Airship' ? legendValue('✦') : legendIcon(name.toLowerCase()), translateText(label) + translateText(' — mine count/density')));
    const appearance = links.map(connectionAppearance);
    const connectionRows = [];
    if (links.length) {
        if (appearance.some(item => !item.wide && !item.fictive && !['teleport', 'monolith'].includes(item.type))) {
            connectionRows.push(legendItem(legendLine(), translateText('Normal zone connection')));
        }
        if (appearance.some(item => item.wide)) {
            connectionRows.push(legendItem(legendLine('wide'), translateText('Wide, unguarded connection')));
        }
        if ([...connectionBundles(links).values()].some(rows => rows.length > 1)) {
            connectionRows.push(legendItem(legendLine('multi'), translateText('Parallel lines are separate connections between the same two zones, each with its own guard value')));
        }
        if (appearance.some(item => item.fictive)) {
            connectionRows.push(legendItem(legendLine('fictive'), translateText('Fictive link (affects zone placement)')));
        }
        if (appearance.some(item => item.roadRequired)) {
            connectionRows.push(legendItem(legendLine('road-required'), translateText('Required road through connection')));
        }
        if (appearance.some(item => item.roadForbidden)) {
            connectionRows.push(legendItem(legendLine('no-road'), translateText('Road forbidden')));
        }
        if (appearance.some(item => ['teleport', 'monolith'].includes(item.type))) {
            connectionRows.push(legendItem(legendLine('teleport'), translateText('Teleport/monolith connection')));
        }
        if (appearance.some(item => item.border)) {
            connectionRows.push(legendItem(legendBorderGuardIcon(), translateText('Border Guard connection')));
        }
        if (store.selected.kind === 'connection') {
            const selectedLink = map.connections[store.selected.index];
            if (selectedLink && zoneIds.has(String(selectedLink.zone1 ?? '').trim()) && zoneIds.has(String(selectedLink.zone2 ?? '').trim())) {
                connectionRows.push(legendItem(legendLine('selected'), translateText('Selected connection')));
            }
        }
        const guarded = links.find(connection => String(connection.value ?? '').trim() !== '' && Number(connection.value) > 0);
        if (guarded) {
            connectionRows.push(legendItem(legendValue(compactExact(guarded.value)), translateText('Connection guard value, abbreviated display')));
        }
        if (links.some(connection => (!String(connection.value ?? '').trim() || Number(connection.value) === 0) && !connectionAppearance(connection).border)) {
            connectionRows.push(legendItem(legendValue('—'), translateText('No number: unguarded connection')));
        }
    }
    content.innerHTML =
        legendSection(translateText('Zones'), zoneRows) +
            legendSection(translateText('Object guards'), guardRows) +
            legendSection(translateText('Towns'), townRows) +
            legendSection(translateText('Resources'), mineRows) +
            legendSection(translateText('Connections'), connectionRows);
}
function renderCanvas() {
    const map = current();
    $('canvas-content').innerHTML = map ? canvasMarkup(map) : '';
    $('empty-hint').classList.toggle('hidden', !!map?.zones.length);
    $('empty-add-btn').hidden = !store.pack;
    transformCanvas();
}
function select(kind, index) {
    store.selected = { kind, index };
    store.tab = 'general';
    store.inspectorView = 'selection';
    store.connectMode = false;
    $('inspector').classList.add('open');
    renderAll();
}
function captureCanvasPointer(pointerId) {
    // Some synthetic pointer events have no active pointer in the browser; do not
    // let them crash unrelated click-away handlers or leave a drag half-started.
    try {
        $('canvas').setPointerCapture(pointerId);
    }
    catch (error) {
        if (error.name !== 'NotFoundError' && error.name !== 'InvalidStateError')
            throw error;
    }
}
function releaseCanvasPointer(pointerId) { try {
    $('canvas').releasePointerCapture(pointerId);
}
catch { } }
function resetTouchGesture() {
    touchPoints.clear();
    pinch = null;
    store.drag = null;
    dragRect = null;
    $('canvas').classList.remove('canvas-panning');
    $('drag-preview').innerHTML = '';
    finishCanvasTransform();
}
function handleCanvasDown(e) {
    if (e.button !== 0 && e.button !== 1)
        return;
    dragRect = $('canvas').getBoundingClientRect();
    const btn = e.target.closest('[data-zone-index]'), conn = e.target.closest('[data-conn-index]'), p = mousePos(e);
    if (e.pointerType === 'touch') {
        // A primary touch means the browser sees no older active contact. If our map
        // still has one (for example after a PWA pointercancel/lost capture), it is stale.
        if (e.isPrimary && touchPoints.size)
            resetTouchGesture();
        touchPoints.set(e.pointerId, p);
        captureCanvasPointer(e.pointerId);
        if (touchPoints.size === 2) {
            const g = pinchGeometry();
            pinch = { startDistance: Math.max(1, g.distance), startScale: store.scale, anchor: world(g) };
            store.drag = null;
            $('drag-preview').innerHTML = '';
            $('canvas').classList.add('canvas-panning');
            e.preventDefault();
            return;
        }
        if (touchPoints.size > 2) {
            e.preventDefault();
            return;
        }
    }
    if (conn && !btn) {
        dragRect = null;
        select('connection', +conn.dataset.connIndex);
        return;
    }
    if (btn) {
        const i = +btn.dataset.zoneIndex, z = current()?.zones[i];
        if (!z)
            return;
        if (store.connectMode) {
            if (!store.connectFrom) {
                store.connectFrom = z.id;
                toast('Select the second zone');
            }
            else {
                let from = store.connectFrom;
                store.connectFrom = null;
                store.connectMode = false;
                commit('Connection added', () => { current().connections.push(freshConnection(store.pack.format, from, z.id)); store.selected = { kind: 'connection', index: current().connections.length - 1 }; });
            }
            dragRect = null;
            return;
        }
        store.drag = { type: e.altKey ? 'connect' : 'zone', index: i, from: z.id, initial: current().layout[z.id] ? { ...current().layout[z.id] } : { x: 0, y: 0 }, moved: false, at: p, snapshot: capture() };
        if (!e.altKey) {
            store.selected = { kind: 'zone', index: i };
            store.inspectorView = 'selection';
        }
        if (e.pointerType !== 'touch')
            $('inspector').classList.add('open');
        renderInspector();
        renderCanvas();
    }
    else {
        if (store.connectMode) {
            store.connectMode = false;
            store.connectFrom = null;
            toast('Connection creation canceled.');
            renderToolbar();
        }
        store.drag = { type: 'pan', at: p, initial: { x: store.tx, y: store.ty } };
        $('canvas').classList.add('canvas-panning');
    }
    e.preventDefault();
    captureCanvasPointer(e.pointerId);
}
function handleCanvasMove(e) {
    if (e.pointerType === 'touch' && touchPoints.has(e.pointerId))
        touchPoints.set(e.pointerId, mousePos(e));
    if (pinch && touchPoints.size >= 2) {
        const g = pinchGeometry();
        store.scale = Math.max(.14, Math.min(3.5, pinch.startScale * g.distance / pinch.startDistance));
        store.tx = g.x - pinch.anchor.x * store.scale;
        store.ty = g.y - pinch.anchor.y * store.scale;
        transformCanvas();
        e.preventDefault();
        return;
    }
    const d = store.drag;
    if (!d)
        return;
    const p = mousePos(e), dx = p.x - d.at.x, dy = p.y - d.at.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2)
        d.moved = true;
    if (d.type === 'pan') {
        store.tx = d.initial.x + dx;
        store.ty = d.initial.y + dy;
        transformCanvas();
    }
    else if (d.type === 'zone') {
        const z = current()?.zones[d.index];
        if (!z)
            return;
        current().layout[z.id] = { x: Math.round(d.initial.x + dx / store.scale), y: Math.round(d.initial.y + dy / store.scale) };
        renderCanvas();
    }
    else if (d.type === 'connect') {
        const from = world(d.at), to = world(p);
        $('drag-preview').innerHTML = `<path stroke="var(--accent)" stroke-dasharray="7 5" stroke-width="2" fill="none" d="M${from.x} ${from.y}L${to.x} ${to.y}"/>`;
    }
}
function handleCanvasUp(e) {
    if (e.pointerType === 'touch')
        touchPoints.delete(e.pointerId);
    releaseCanvasPointer(e.pointerId);
    if (pinch) {
        if (touchPoints.size < 2) {
            pinch = null;
            $('canvas').classList.remove('canvas-panning');
            dragRect = null;
            finishCanvasTransform();
        }
        store.drag = null;
        return;
    }
    const d = store.drag;
    if (!d) {
        dragRect = null;
        return;
    }
    store.drag = null;
    $('drag-preview').innerHTML = '';
    dragRect = null;
    finishCanvasTransform();
    $('canvas').classList.remove('canvas-panning');
    if (d.type === 'zone' && !d.moved && e.pointerType === 'touch') {
        $('inspector').classList.add('open');
        renderInspector();
    }
    if (d.type === 'zone' && d.moved) {
        const m = current();
        if (store.undo.at(-1)?.snapshot !== d.snapshot) {
            store.undo.push({ snapshot: d.snapshot, selection: { kind: 'zone', index: d.index }, tab: store.tab, label: 'Zone moved' });
        }
        if (store.undo.length > 50)
            store.undo.shift();
        store.redo = [];
        m.layoutDirty = true;
        store.pack.dirty = true;
        persistLayout();
        renderAll();
        status('Zone position changed');
    }
    else if (d.type === 'connect' && d.moved) {
        const elements = document.elementsFromPoint(e.clientX, e.clientY), target = elements.map(el => el.closest?.('[data-zone-index]')).find(Boolean);
        if (target && +target.dataset.zoneIndex !== d.index) {
            const z2 = current()?.zones[+target.dataset.zoneIndex];
            commit('Connection created', () => {
                current().connections.push(freshConnection(store.pack.format, d.from, z2.id));
                store.selected = { kind: 'connection', index: current().connections.length - 1 };
            });
        }
        else
            toast('Drag to a different zone to create a connection.');
    }
}
$('canvas').addEventListener('pointerdown', handleCanvasDown);
$('canvas').addEventListener('pointermove', handleCanvasMove);
$('canvas').addEventListener('pointerup', handleCanvasUp);
$('canvas').addEventListener('pointercancel', e => { releaseCanvasPointer(e.pointerId); resetTouchGesture(); });
$('canvas').addEventListener('lostpointercapture', e => { if (e.pointerType === 'touch' && touchPoints.has(e.pointerId))
    resetTouchGesture(); });
window.addEventListener('blur', resetTouchGesture);
document.addEventListener('visibilitychange', () => { if (document.hidden)
    resetTouchGesture(); });
$('canvas').addEventListener('wheel', e => { e.preventDefault(); let p = mousePos(e); zoomAt(Math.exp(-e.deltaY * .00125), p.x, p.y); }, { passive: false });
$('zoom-in').onclick = () => zoomAt(1.25);
$('zoom-out').onclick = () => zoomAt(.8);
$('zoom-fit').onclick = () => fitView();
$('canvas').addEventListener('keydown', e => { const n = e.target.closest?.('[data-zone-index]'); if (n && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    select('zone', +n.dataset.zoneIndex);
} });
try {
    new ResizeObserver(() => { let b = $('canvas').getBoundingClientRect(); store.viewport = { w: b.width || 700, h: b.height || 500 }; }).observe($('canvas'));
}
catch { }
// Every form field is schema-backed and updated without implicit conversions.
// Numeric schema fields accept decimal digits only. Values remain strings so serialization stays byte-compatible.
const isNumericField = path => /^(?:id|base_size|ownership|min_size|max_size|max_battle_rounds|zone1|zone2|value)$/.test(path) ||
    /^(?:positions)\.(?:min_human|max_human|min_total|max_total)$/.test(path) ||
    /^(?:player_towns|neutral_towns)\.(?:min_towns|min_castles|town_density|castle_density)$/.test(path) ||
    /^treasure_tiers\.\d+\.(?:low|high|density)$/.test(path) ||
    /^(?:min_mines|mine_density)\.[^.]+$/.test(path) || /^field_counts\.[^.]+$/.test(path) ||
    /^zone_options\.(?:min_objects|zone_repulsion|monsters_joining_percentage|min_airship_shipyards|airship_shipyard_density|max_block_value)$/.test(path);
const digitsOnly = value => String(value ?? '').replace(/[^0-9]/g, '');
const f = (path, label, value, { hint = '', multiline = false, select = null, placeholder = '' } = {}) => {
    const attr = `data-path="${esc(path)}"`, v = strVal(value);
    let elem;
    if (select) {
        const opts = [...select];
        if (!opts.some(x => x[1] === v))
            opts.push([v, v || '(empty)']);
        elem = `<select ${attr}>${opts.map(([name, val]) => `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>`;
    }
    else if (multiline)
        elem = `<textarea ${attr} rows="3">${esc(v)}</textarea>`;
    else {
        const numeric = isNumericField(path);
        elem = `<input type="text" ${attr} ${numeric ? 'data-numeric="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off"' : 'spellcheck="false"'} value="${esc(v)}" placeholder="${esc(placeholder)}">`;
    }
    return `<div class="field"><label>${esc(label)}</label>${elem}${hint ? `<small class="field-note">${esc(hint)}</small>` : ''}</div>`;
};
const check = (path, label, value) => `<div class="field row-field"><label for="${esc(path)}">${esc(label)}</label><input id="${esc(path)}" type="checkbox" data-path="${esc(path)}" ${flag(value) ? 'checked' : ''}></div>`;
const group = (title, body) => `<section class="prop-group"><h3>${esc(title)}</h3>${body}</section>`;
const pair = (arr) => `<div class="form-grid">${arr.join('')}</div>`;
const kv = (prefix, obj, entries) => entries.map(([field, label]) => f(`${prefix}.${field}`, label, obj?.[field]));
const posLabels = [['min_human', 'Min. human players'], ['max_human', 'Max. human players'], ['min_total', 'Min. total players'], ['max_total', 'Max. total players']];
const factions = schema => schema.towns.map(s => s === 'Elemental' ? 'Conflux' : s);
function inspectorSelection() { return store.inspectorView === 'map' ? { kind: 'map', index: store.mapIndex } : store.selected; }
function selectedModel() {
    const pack = store.pack, map = current(), s = inspectorSelection();
    return s.kind === 'zone' ? map?.zones[s.index] : s.kind === 'connection' ? map?.connections[s.index] : s.kind === 'pack' ? pack : map;
}
function tabsFor(kind) { return kind === 'zone' ? ['General', 'Towns', 'Content', 'Terrain', 'Monsters', ...(store.pack.format !== 'sod' ? ['HotA'] : [])] : kind === 'connection' ? ['General', ...(store.pack.format !== 'sod' ? ['HotA'] : [])] : kind === 'pack' ? ['Pack'] : ['Template', ...(store.pack.format !== 'sod' ? ['HotA'] : [])]; }
function zoneProps(z, t) {
    const sch = SCHEMA.formats[store.pack.format];
    if (t === 'General')
        return group('Zone type', check('human_start', 'Player start zone', z.human_start) + check('computer_start', 'Computer start zone', z.computer_start) + check('treasure', 'Treasure zone', z.treasure) + check('junction', 'Junction', z.junction)) +
            group('Identifier and size', pair([f('id', 'Zone ID', z.id), f('base_size', 'Base size', z.base_size)])) +
            group('Placement restrictions', pair(kv('positions', z.positions, posLabels))) +
            group('Ownership', f('ownership', 'Player / owner', z.ownership));
    if (t === 'Towns')
        return group('Player towns', pair(kv('player_towns', z.player_towns, [['min_towns', 'Min. towns'], ['min_castles', 'Min. castles'], ['town_density', 'Town density'], ['castle_density', 'Castle density']]))) +
            group('Neutral towns', pair(kv('neutral_towns', z.neutral_towns, [['min_towns', 'Min. towns'], ['min_castles', 'Min. castles'], ['town_density', 'Town density'], ['castle_density', 'Castle density']]))) +
            group('Allowed factions', check('towns_same_type', 'Towns of same type', z.towns_same_type) + `<div class="flag-grid">${factions(sch).map(name => check(`town_types.${name}`, name, z.town_types[name])).join('')}</div>`);
    if (t === 'Content')
        return group('Treasure', z.treasure_tiers.map((tier, i) => `<div class="eyebrow tier-heading">${message('tier', i + 1)}</div>` + `<div class="form-grid">${['low', 'high', 'density'].map(k => f(`treasure_tiers.${i}.${k}`, k === 'low' ? 'Minimum' : k === 'high' ? 'Maximum' : 'Density', tier[k])).join('')}</div>`).join('')) +
            group('Minimum mines', pair(SCHEMA.resources.map(k => f(`min_mines.${k}`, k, z.min_mines[k])))) +
            group('Mine density', pair(SCHEMA.resources.map(k => f(`mine_density.${k}`, k, z.mine_density[k]))));
    if (t === 'Terrain')
        return group('Terrains', check('terrain_match', 'Match town', z.terrain_match) + `<div class="flag-grid">${sch.terrains.map(k => check(`terrains.${k}`, k, z.terrains[k])).join('')}</div>`);
    if (t === 'Monsters')
        return group('Guards', f('monster_strength', 'Strength', z.monster_strength, { select: [['Empty', ''], ['No monsters', 'none'], ['Weak', 'weak'], ['Average (avg)', 'avg'], ['Average', 'average'], ['Strong', 'strong'], ['Legacy: normal', 'normal']] }) + check('monster_match', 'Match town', z.monster_match)) +
            group('Allowed factions', `<div class="flag-grid">${sch.monsters.map(k => check(`monster_factions.${k}`, k, z.monster_factions[k])).join('')}</div>`);
    if (t === 'HotA')
        return group('Additional HotA settings', SCHEMA.zoneOptionFields.map(name => f(`zone_options.${name}`, name.replace(/_/g, ' '), z.zone_options[name], { hint: name === 'image_settings' ? 'HotA editor coordinates. Moving a zone will update these when the file is saved.' : '' })).join(''));
    return '';
}
function connectionProps(c, t) {
    return t === 'HotA' ? group('Additional HotA fields', [
        ['road', 'Road'], ['conn_type', 'Type'], ['fictive', 'Fictive'], ['portal_repulsion', 'Portal repulsion']
    ].map(([key, label]) => f(key, label, c[key])).join('')) :
        group('Between zones', pair([f('zone1', 'Zone 1', c.zone1), f('zone2', 'Zone 2', c.zone2), f('value', 'Guard value', c.value)])) +
            group('Parameters', check('wide', 'Wide', c.wide) + check('border_guard', 'Border guard', connectionAppearance(c).border ? 'x' : '')) +
            group('Restrictions', pair(kv('positions', c.positions, posLabels)));
}
function mapProps(m, t) {
    const isHota = store.pack.format !== 'sod';
    return t === 'HotA' ? group('Additional template options', [
        ['artifacts', 'Artifacts'], ['combo_arts', 'Combination artifacts'], ['spells', 'Spells'], ['secondary_skills', 'Secondary skills'], ['objects', 'Objects'], ['rock_blocks', 'Rock blocks'], ['zone_sparseness', 'Zone sparseness'], ['special_weeks_disabled', 'Disable special weeks'], ['spell_research', 'Spell research'], ['anarchy', 'Anarchy']
    ].map(([k, l]) => f(`options.${k}`, l, m.options[k])).join('')) : group('Template', f('name', 'Name', m.name) + pair([f('min_size', 'Minimum size', m.min_size), f('max_size', 'Maximum size', m.max_size)])) +
        group('Statistics', `<div class="alert-info">${message('template_stats', m.zones.length, m.connections.length)}<br>${translateText(isHota ? 'Coordinates can be saved to image_settings.' : 'Diagram positions are saved in the browser and can be exported as JSON.')}</div>`);
}
function packProps(p) {
    if (p.format === 'sod')
        return group('SoD pack', `<div class="alert-info">${esc(translateText('SoD has no pack metadata. Edit each template individually or convert the pack to HotA.'))}</div>`);
    return group('Pack metadata', [
        ['name', 'Name'], ['description', 'Description'], ['town_selection', 'Town selection'], ['heroes', 'Heroes'], ['mirror', 'Mirror'], ['tags', 'Tags'], ['max_battle_rounds', 'Max battle rounds'], ['forbid_hiring_heroes', 'Forbid hiring heroes']
    ].map(([name, label]) => f(`metadata.${name}`, label, p.metadata[name], { multiline: name === 'description' })).join('')) +
        group('Field counts', pair([['town', 'Towns'], ['terrain', 'Terrains'], ['zone_type', 'Zone types'], ['pack_new', 'Pack fields'], ['map_new', 'Template fields'], ['zone_new', 'Zone fields'], ['connection_new', 'Connection fields']].map(([name, label]) => f(`field_counts.${name}`, label, p.field_counts[name]))));
}
function renderInspector() {
    const p = store.pack, m = current(), s = inspectorSelection();
    if (!p) {
        $('inspector-context-tabs').innerHTML = `<button type="button" data-inspector-view="map" role="tab" disabled>${esc(translateText('Template properties'))}</button>`;
        $('inspector-body').innerHTML = `<div class="inspector-empty">${esc(translateText('Open a template to begin.'))}</div>`;
        return;
    }
    let obj = selectedModel();
    if (!obj) {
        store.selected = { kind: 'map', index: store.mapIndex };
        return renderInspector();
    }
    const kind = s.kind;
    const picked = store.selected.kind;
    const viewTabs = [['map', translateText('Template properties')]];
    if (picked === 'zone' || picked === 'connection')
        viewTabs.push(['selection', picked === 'zone' ? message('zone_number', current().zones[store.selected.index]?.id) : message('connection_pair', current().connections[store.selected.index]?.zone1 ?? '', current().connections[store.selected.index]?.zone2 ?? '')]);
    if (picked === 'pack')
        viewTabs.push(['selection', 'Pack properties']);
    $('inspector-context-tabs').innerHTML = viewTabs.map(([view, text]) => `<button type="button" data-inspector-view="${view}" role="tab" aria-selected="${(store.inspectorView === 'map' ? 'map' : 'selection') === view}" title="${esc(text)}">${esc(text)}</button>`).join('');
    const label = kind === 'zone' ? message('zone_number', obj.id) : kind === 'connection' ? message('connection_pair', obj.zone1, obj.zone2) : kind === 'pack' ? translateText('Pack properties') : translateText('Template properties');
    $('inspector-title').textContent = label;
    $('inspector-subtitle').textContent = kind === 'zone' ? 'Selected zone properties' : kind === 'connection' ? 'Connection properties' : kind === 'pack' ? p.filename : m.name;
    const tabs = tabsFor(kind);
    if (!tabs.includes(store.tab))
        store.tab = tabs[0];
    $('inspector-tabs').innerHTML = tabs.map(t => `<button type="button" data-tab="${esc(t)}" class="${t === store.tab ? 'active' : ''}">${esc(t)}</button>`).join('');
    $('inspector-body').innerHTML = kind === 'zone' ? zoneProps(obj, store.tab) : kind === 'connection' ? connectionProps(obj, store.tab) : kind === 'pack' ? packProps(p) : mapProps(obj, store.tab);
    $('inspector-footer').innerHTML = kind === 'zone' ? `<button class="btn btn-subtle" data-inspector-action="duplicate">${icon('copy', 15)} ${translateText('Duplicate')}</button><button class="btn btn-subtle danger" data-inspector-action="delete">${icon('trash', 15)} ${translateText('Delete')}</button>` :
        kind === 'connection' ? `<button class="btn btn-subtle danger" data-inspector-action="delete">${icon('trash', 15)} ${translateText('Delete connection')}</button>` :
            kind === 'map' ? `<button class="btn btn-subtle" data-inspector-action="duplicate">${icon('copy', 15)} ${translateText('Duplicate template')}</button><button class="btn btn-subtle danger" data-inspector-action="delete">${icon('trash', 15)} ${translateText('Delete template')}</button>` : '';
}
$('inspector-context-tabs').addEventListener('click', e => { const button = e.target.closest('[data-inspector-view]'); if (!button || button.disabled)
    return; store.inspectorView = button.dataset.inspectorView; store.tab = store.inspectorView === 'map' ? 'Template' : 'General'; renderInspector(); });
$('inspector-tabs').addEventListener('click', e => { const el = e.target.closest('[data-tab]'); if (el) {
    store.tab = el.dataset.tab;
    renderInspector();
} });
// Live preview updates the model on each keystroke, but expensive diagram updates
// are coalesced to one animation frame and one undo entry per editing session.
const liveEdits = new WeakMap();
let liveRefreshId = 0;
function scheduleInspectorPreview() {
    if (liveRefreshId)
        return;
    liveRefreshId = requestAnimationFrame(() => {
        liveRefreshId = 0;
        renderSidebar();
        renderToolbar();
        renderCanvas();
        renderLegend();
        renderStatus();
    });
}
$('inspector-body').addEventListener('beforeinput', e => {
    const field = e.target.closest?.('[data-numeric="1"]');
    if (!field || e.isComposing || !e.inputType?.startsWith('insert') || e.data == null)
        return;
    if (/[^0-9]/.test(e.data))
        e.preventDefault();
});
$('inspector-body').addEventListener('input', e => {
    const field = e.target.closest('[data-path]');
    if (!field || field.type === 'checkbox' || field.tagName === 'SELECT' || e.isComposing)
        return;
    if (field.dataset.numeric === '1') {
        const clean = digitsOnly(field.value);
        if (clean !== field.value)
            field.value = clean;
    }
    const selection = inspectorSelection(), path = field.dataset.path.split('.'), model = selectedModel();
    if (!model)
        return;
    // Renaming a zone must atomically update all links, layout keys and object hints.
    if (selection.kind === 'zone' && path.length === 1 && path[0] === 'id')
        return;
    let obj = model;
    for (let i = 0; i < path.length - 1; i++) {
        if (obj[path[i]] == null)
            obj[path[i]] = {};
        obj = obj[path[i]];
    }
    const key = path.at(-1), value = field.value;
    if (obj[key] === value)
        return;
    if (!liveEdits.has(field))
        liveEdits.set(field, { snapshot: capture(), selection: { ...store.selected }, tab: store.tab, label: 'Updated: ' + path.join(' / ') });
    obj[key] = value;
    store.pack.dirty = true;
    scheduleInspectorPreview();
});
function finishLiveEdit(field) {
    const edit = liveEdits.get(field);
    if (!edit)
        return false;
    liveEdits.delete(field);
    if (edit.snapshot !== capture()) {
        store.undo.push(edit);
        if (store.undo.length > (store.pack.maps.length > 90 ? 18 : 50))
            store.undo.shift();
        store.redo = [];
        store.pack.dirty = true;
        persistLayout();
        if (liveRefreshId) {
            cancelAnimationFrame(liveRefreshId);
            liveRefreshId = 0;
        }
        renderAll();
        status(edit.label);
    }
    return true;
}
$('inspector-body').addEventListener('change', e => {
    const field = e.target.closest('[data-path]');
    if (!field)
        return;
    if (finishLiveEdit(field))
        return;
    if (field.dataset.numeric === '1') {
        const clean = digitsOnly(field.value);
        if (clean !== field.value)
            field.value = clean;
    }
    const path = field.dataset.path.split('.'), selected = selectedModel();
    if (!selected)
        return;
    const value = field.type === 'checkbox' ? (field.checked ? 'x' : '') : field.value;
    let obj = selected;
    for (let i = 0; i < path.length - 1; i++) {
        if (obj[path[i]] == null)
            obj[path[i]] = {};
        obj = obj[path[i]];
    }
    const key = path.at(-1), before = obj[key];
    if (before === value)
        return;
    if (inspectorSelection().kind === 'zone' && path.length === 1 && key === 'id') {
        const zone = selected, newId = value.trim();
        if (!newId) {
            toast('Zone ID cannot be empty.');
            field.value = before;
            return;
        }
        if (current().zones.some(z => z !== zone && z.id.trim() === newId)) {
            toast('That zone ID already exists.');
            field.value = before;
            return;
        }
        const oldId = zone.id;
        commit('Zone ID changed', () => {
            for (const conn of current().connections) {
                if (conn.zone1.trim() === oldId.trim())
                    conn.zone1 = newId;
                if (conn.zone2.trim() === oldId.trim())
                    conn.zone2 = newId;
            }
            const idMapping = Object.fromEntries(current().zones.map(z => [z.id.trim(), z.id.trim()]));
            idMapping[oldId.trim()] = newId;
            const warnings = [];
            for (const z of current().zones)
                for (const name of ['town_hint', 'terrain_hint', 'faction_hint'])
                    if (z.zone_options?.[name]) {
                        const result = remapHintRefsDetailed(z.zone_options[name], idMapping);
                        if (result.warning)
                            warnings.push(`Zone ${z.id}, ${name}: ${result.warning}`);
                        z.zone_options[name] = result.value;
                    }
            if (warnings.length)
                store.pack.warnings.push(...warnings);
            current().layout[newId] = current().layout[oldId];
            delete current().layout[oldId];
            zone.id = newId;
        });
    }
    else
        commit(message('changed', path.join(' / ')), () => { obj[key] = value; });
});
$('inspector-footer').addEventListener('click', e => {
    const btn = e.target.closest('[data-inspector-action]');
    if (!btn)
        return;
    const action = btn.dataset.inspectorAction, s = inspectorSelection();
    if (action === 'duplicate') {
        if (s.kind === 'zone')
            commit('Zone duplicated', () => {
                const map = current(), source = map.zones[s.index], copy = structuredClone(source), id = String(Math.max(0, ...map.zones.map(z => Number(z.id) || 0)) + 1);
                copy.id = id;
                map.zones.push(copy);
                map.layout[id] = { x: (map.layout[source.id]?.x ?? 100) + 215, y: (map.layout[source.id]?.y ?? 100) + 145 };
                store.selected = { kind: 'zone', index: map.zones.length - 1 };
            });
        else if (s.kind === 'map')
            duplicateMap();
    }
    else if (action === 'delete') {
        const name = s.kind === 'zone' ? `${translateText('Zone')} ${current().zones[s.index]?.id}` : s.kind === 'connection' ? translateText('selected connection') : translateText('selected template');
        confirmAction(translateText('Confirm deletion'), message('delete_with_undo', esc(name)), () => {
            if (s.kind === 'zone')
                commit('Zone deleted', () => { const map = current(), zone = map.zones[s.index]; map.zones.splice(s.index, 1); map.connections = map.connections.filter(c => c.zone1 !== zone.id && c.zone2 !== zone.id); delete map.layout[zone.id]; store.selected = { kind: 'map', index: store.mapIndex }; });
            else if (s.kind === 'connection')
                commit('Connection deleted', () => { current().connections.splice(s.index, 1); store.selected = { kind: 'map', index: store.mapIndex }; });
            else
                removeMap();
        });
    }
});
function addMap() {
    if (!store.pack)
        return;
    commit('Template created', () => {
        const m = { name: `New Template ${store.pack.maps.length + 1}`, min_size: '36', max_size: '144', options: SCHEMA.formats[store.pack.format].isHota ? Object.fromEntries(['artifacts', 'combo_arts', 'spells', 'secondary_skills', 'objects', 'rock_blocks', 'zone_sparseness', 'special_weeks_disabled', 'spell_research', 'anarchy'].map(k => [k, ''])) : {}, zones: [], connections: [], layout: {} };
        store.pack.maps.push(m);
        store.mapIndex = store.pack.maps.length - 1;
        store.selected = { kind: 'map', index: store.mapIndex };
    });
    renderAll();
}
function duplicateMap() { commit('Template duplicated', () => { const map = structuredClone(current()); map.name += ' (copy)'; store.pack.maps.splice(store.mapIndex + 1, 0, map); store.mapIndex++; store.selected = { kind: 'map', index: store.mapIndex }; }); fitView(); }
function removeMap() {
    if (store.pack.maps.length <= 1) {
        toast('The pack must contain at least one template.');
        return;
    }
    commit('Template deleted', () => { store.pack.maps.splice(store.mapIndex, 1); store.mapIndex = Math.max(0, store.mapIndex - 1); store.selected = { kind: 'map', index: store.mapIndex }; });
    fitView();
}
function addZone() {
    if (!current())
        return;
    commit('Zone added', () => {
        const map = current(), id = String(Math.max(0, ...map.zones.map(z => Number(z.id) || 0)) + 1), z = freshZone(store.pack.format, id);
        z.terrains.Dirt = 'x';
        z.monster_factions.Neutral = 'x';
        map.zones.push(z);
        const points = Object.values(map.layout);
        let i = map.zones.length - 1;
        map.layout[id] = { x: 130 + (i % 6) * 230, y: 130 + Math.floor(i / 6) * 190 };
        if (points.length) {
            const cx = points.reduce((a, p) => a + p.x, 0) / points.length, cy = points.reduce((a, p) => a + p.y, 0) / points.length;
            map.layout[id] = { x: cx + 235, y: cy + 70 };
        }
        store.selected = { kind: 'zone', index: i };
        store.tab = 'General';
    });
}
function addConnection() {
    if (!current()?.zones.length || current().zones.length < 2) {
        toast('At least two zones are needed to create a connection.');
        return;
    }
    store.connectMode = true;
    store.connectFrom = null;
    renderToolbar();
    toast('Click the first zone, then the second; or Alt + drag between them.');
}
function doLayout() { commit('Layout generated', () => { const map = current(); map.layout = recommendedLayout(map, store.mapIndex); map.layoutDirty = true; }); fitView(); }
function changeSpread(factor) { commit(factor > 1 ? 'Zones spread' : 'Zones brought closer', () => { resizeLayout(current(), factor); current().layoutDirty = true; }); fitView(); }
function doReid(sort) {
    const warnings = [];
    commit('Zones renumbered', () => renumberMap(current(), { sort, warnings }));
    if (warnings.length)
        modal(translateText('Zone hint validation'), `<p>${esc(translateText('Some HotA hints were not updated because their syntax or references are unknown:'))}</p><div class="issues">${warnings.slice(0, 30).map(w => `<div class="issue badge-warning">${esc(w)}</div>`).join('')}</div>`);
}
function createFreshPack(format) {
    const pack = freshPack(format);
    pack.maps.push({ name: 'New Template', min_size: '36', max_size: '144', options: Object.fromEntries(['artifacts', 'combo_arts', 'spells', 'secondary_skills', 'objects', 'rock_blocks', 'zone_sparseness', 'special_weeks_disabled', 'spell_research', 'anarchy'].map(k => [k, ''])), zones: [freshZone(format, '1')], connections: [], layout: {} });
    pack.maps[0].zones[0].terrains.Dirt = 'x';
    pack.maps[0].zones[0].monster_factions.Neutral = 'x';
    setPack(pack);
}
function newPackDialog() { modal('New template', `<div class="field"><label>${esc(translateText('New pack format'))}</label><select id="new-pack-format"><option value="hota18">HotA 1.8.x</option><option value="hota17">HotA 1.7.x</option><option value="sod">Shadow of Death</option></select></div><p class="field-note">${esc(translateText('Unsaved changes to the current pack will be lost.'))}</p>`, [{ label: 'Cancel' }, { label: 'Create', primary: true, handler: () => createFreshPack($('new-pack-format').value) }]); }
function download(bytes, filename, mime = 'application/octet-stream') {
    const blob = new Blob([bytes], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function fileName(format) { const original = store.pack.filename ?? 'template', base = original.replace(/\.(h3t|txt)$/i, ''); return base + (format === 'sod' ? '.txt' : '.h3t'); }
async function performSave(format) {
    if (!store.pack)
        return;
    const source = store.pack;
    try {
        const converted = format === source.format ? structuredClone(source) : convertPack(source, format, { packName: source.filename.replace(/\.[^.]+$/, '') });
        if (SCHEMA.formats[format].isHota)
            for (const m of converted.maps)
                if (m.layoutDirty)
                    saveImagePositions(m);
        const output = serializePack(converted), name = fileName(format);
        // showSaveFilePicker must run directly in a user gesture; do not await before invoking it.
        if (typeof window.showSaveFilePicker !== 'function') {
            modal('Save as', `<p>${esc(translateText('Your browser does not support the native Save as picker. Click Download to explicitly allow the download, or use Chrome/Edge on desktop.'))}</p>`, [
                { label: getLanguage() === 'ru' ? 'Cancel' : 'Cancel' },
                { label: translateText('Download'), primary: true, handler: () => { download(output.bytes, name); status(translateText('Download requested:') + ' ' + name); } }
            ]);
            return;
        }
        const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: format === 'sod' ? 'SoD template' : 'HotA template', accept: { 'application/octet-stream': [format === 'sod' ? '.txt' : '.h3t'] } }] });
        const writer = await handle.createWritable();
        try {
            await writer.write(output.bytes);
            await writer.close();
        }
        catch (error) {
            try {
                await writer.abort();
            }
            catch { }
            throw error;
        }
        if (format === source.format) {
            if (SCHEMA.formats[format].isHota)
                for (let i = 0; i < source.maps.length; i++)
                    if (source.maps[i].layoutDirty) {
                        source.maps[i].zones.forEach((z, j) => { z.zone_options.image_settings = converted.maps[i].zones[j].zone_options.image_settings; });
                        source.maps[i].layoutDirty = false;
                    }
            source.originalBytes = output.bytes;
            source.dirty = false;
        }
        renderAll();
        status(`Saved: ${handle.name || name} (${upper(format)})`);
        toast(message('saved', handle.name || name));
        if (output.warnings.some(w => /replaced/i.test(w)))
            modal('Encoding warning', output.warnings.filter(w => /replaced/i.test(w)).map(esc).join('<br>'));
    }
    catch (error) {
        if (error?.name === 'AbortError') {
            status(translateText('Save cancelled.'));
            return;
        }
        console.error('Save failed:', error);
        toast(translateText('Save failed:') + (error?.message || error));
    }
}
function askSave(format) {
    if (!store.pack)
        return;
    let converted;
    try {
        converted = format === store.pack.format ? store.pack : convertPack(store.pack, format);
    }
    catch (e) {
        toast(e.message);
        return;
    }
    const losses = converted.warnings.filter(w => w.toLowerCase().includes('conversion loss'));
    const issues = validatePack(store.pack).filter(x => x.level === 'error');
    if (issues.length) {
        modal('Validation error', `<p>${esc(translateText('Review the following problems:'))}</p><div class="issues">${issues.slice(0, 20).map(x => `<div class="issue error">${esc(x.text)}</div>`).join('')}</div>`, [{ label: 'Cancel' }, { label: 'Save anyway', primary: true, handler: () => performSave(format) }]);
        return;
    }
    if (losses.length) {
        modal('Warning: data loss', `<p>${esc(translateText('The target format does not support some fields:'))}</p><div class="issues">${losses.slice(0, 15).map(w => `<div class="issue badge-warning">${esc(w)}</div>`).join('')}</div><p>${esc(translateText('The source file will remain unchanged.'))}</p>`, [{ label: 'Cancel' }, { label: 'Convert anyway', primary: true, handler: () => performSave(format) }]);
        return;
    }
    performSave(format);
}
function saveLayout() {
    if (!store.pack)
        return;
    persistLayout();
    const maps = store.pack.maps.map(m => {
        const ids = m.zones.map(z => z.id), missing = ids.some(id => !Number.isFinite(m.layout?.[id]?.x) || !Number.isFinite(m.layout?.[id]?.y));
        return { ...m, layout: missing ? { ...autoLayout(m), ...m.layout } : m.layout };
    });
    const payload = createSidecar({ ...store.pack, maps });
    const count = Object.keys(payload.maps).length;
    if (!count) {
        toast(translateText('No positions to save.'));
        return;
    }
    const filename = store.pack.filename + '.h3tc-layout.json';
    download(new TextEncoder().encode(JSON.stringify(payload, null, 2) + '\n'), filename, 'application/json');
    toast(message('positions_saved', count));
}
async function importLayout(file) {
    try {
        const payload = JSON.parse(await file.text()), positions = readSidecar(payload, store.pack, store.mapIndex);
        commit('Positions imported', () => {
            for (const [i, valid] of positions) {
                const map = store.pack.maps[i];
                Object.assign(map.layout, valid);
                map.layoutDirty = true;
                try {
                    localStorage.setItem(layoutStorageKey(i), JSON.stringify(map.layout));
                }
                catch { }
            }
        });
        fitView();
        toast(message('positions_restored', positions.size));
    }
    catch (e) {
        toast('Layout import failed: ' + e.message);
    }
}
function svgStyles() {
    const root = getComputedStyle(document.documentElement), v = name => root.getPropertyValue('--' + name).trim();
    const colors = ['red', 'blue', 'tan', 'green', 'orange', 'purple', 'teal', 'pink'];
    const owners = colors.map((name, i) => `.node[data-owner="${i + 1}"] .node-border{fill:${v('player-' + name)}}`).join('');
    return `${owners}.node[data-owner="0"][data-richness="low"] .node-border{fill:${v('neutral-low')}}.node[data-owner="0"][data-richness="mid"] .node-border{fill:url(#zone-silver)}.node[data-owner="0"][data-richness="high"] .node-border{fill:url(#zone-gold)}
  .node-border{stroke:${v('card-edge')};stroke-width:1.7}.node .node-junction-rim{stroke:#707780;stroke-width:10;fill:none}.node text{font-family:Arial,sans-serif;fill:${v('zone-text')};font-weight:700}
  .node-treasure{font-size:32px;font-weight:850}.node-size{font-size:15px}.node-id-label{font-size:23px}.h3-slot-count{font-size:14px;font-weight:850}.h3-slot-count.count-condensed{font-size:11px}.node-section-caption{font-size:14px}.node-cpu,.node-placement{font-size:12px;font-weight:800}
  .conn-line{fill:none;stroke:${v('soft')};stroke-width:2}.conn-hit{display:none}.conn-wide .conn-line{stroke-width:6}.conn-fictive .conn-line{stroke-dasharray:2 9}.conn-roadless .conn-line{stroke-dasharray:11 7}.conn-road-overlay{fill:none;stroke:white;stroke-width:1;stroke-dasharray:5 6}.conn-teleport .conn-line{stroke:${v('accent')};stroke-dasharray:6 4}.dangling .conn-line{stroke:${v('error')};stroke-dasharray:6 5}
  .conn-label-bg{fill:${v('conn-label-bg')};stroke:${v('line')}}.conn-label{fill:${v('conn-label')};font:750 24px Arial;text-anchor:middle;dominant-baseline:middle}.conn-label-value{text-anchor:start}.conn-label-icon{fill:${v('conn-label')};color:${v('conn-label')}}`;
}
async function exportPNG() {
    if (!current()?.zones.length)
        return;
    const map = current(), b = bounds(map), pad = 54, w = Math.ceil(b.w + pad * 2), h = Math.ceil(b.h + pad * 2), cs = getComputedStyle(document.documentElement);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${document.querySelector('.sprite').innerHTML}</defs><style>${svgStyles()}</style><rect width="100%" height="100%" fill="${cs.getPropertyValue('--canvas').trim()}"/><g transform="translate(${pad - b.x} ${pad - b.y})">${canvasMarkup(map)}</g></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), img = new Image();
    try {
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(w, 9000);
        canvas.height = Math.min(h, 9000);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob)
            throw new Error('PNG encoding failed.');
        download(new Uint8Array(await blob.arrayBuffer()), `${map.name.replace(/[\\/:*?"<>|]/g, '_')}.png`, 'image/png');
        toast(translateText('PNG diagram exported.'));
    }
    catch (e) {
        toast('PNG export failed: ' + e.message);
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
function validateDialog() {
    if (!store.pack)
        return;
    const issues = validatePack(store.pack), warnings = store.pack.warnings;
    modal('Template validation', `<p><strong>${message('validation_summary', store.pack.maps.length, issues.length, warnings.length)}</strong></p>${!issues.length ? `<p>${esc(translateText('No semantic problems found.'))}</p>` : `<div class="issues">${issues.slice(0, 70).map(x => `<div class="issue ${x.level === 'error' ? 'error' : 'badge-warning'}">${esc(x.text)}</div>`).join('')}${issues.length > 70 ? `<p>${esc(message('more_issues', issues.length - 70))}</p>` : ''}</div>`}${warnings.length ? `<details><summary>${esc(message('source_warnings', warnings.length))}</summary><div class="issues">${warnings.slice(0, 35).map(x => `<div class="issue">${esc(x)}</div>`).join('')}</div></details>` : ''}<p class="field-note">${esc(translateText('Validation never modifies the template.'))}</p>`, [{ label: 'Close' }]);
}
function helpDialog() {
    const tr = text => esc(translateText(text));
    modal(translateText('Help · H3 Template Studio'), `
        <p><strong>${tr('All processing is local:')}</strong> ${tr('your templates stay on your device.')}</p>
        <h3>${tr('Files')}</h3>
        <ul>
            <li>${tr('Open HotA 1.7/1.8 .h3t or SoD .txt using Open or drag a file onto the canvas.')}</li>
            <li>${tr('Save writes the current format. To convert, select the target version and click Convert.')}</li>
            <li>${tr('Export a .h3tc-layout.json sidecar for SoD; moved HotA zones update image_settings when saved.')}</li>
        </ul>
        <h3>${tr('Canvas')}</h3>
        <ul>
            <li>${tr('Scroll or use −/+ to zoom. Drag the background to pan; use Fit to see all zones.')}</li>
            <li>${tr('Drag zones to reposition them. Alt + drag from one zone to another, or select Connection and then click two zones.')}</li>
            <li>${tr('Click a zone or connection to edit its full properties in the right panel.')}</li>
        </ul>
        <h3>${tr('Keyboard shortcuts')}</h3>
        <ul>
            <li>${tr('Ctrl+O Open; Ctrl+S Save; Ctrl+Z / Ctrl+Y Undo / Redo.')}</li>
            <li>${tr('Delete removes the selected item after confirmation. Ctrl+0 fits the graph, Ctrl+Shift++/- changes spacing; Esc cancels link mode.')}</li>
        </ul>
        <h3>${tr('Installation')}</h3>
        <p>${tr('Open this site over HTTPS and choose Install in Chrome or Edge. On iPhone/iPad, choose Share → Add to Home Screen. Resources are cached for offline use.')}</p>
        <p class="field-note">${tr('A separate browser implementation based on MIT-licensed sokie/heroes3-template-util.')}</p>
    `, [{ label: translateText('Close') }]);
}
async function installApp() {
    if (store.installPrompt) {
        const prompt = store.installPrompt;
        store.installPrompt = null;
        try {
            await prompt.prompt();
            const result = await prompt.userChoice;
            if (result?.outcome === 'accepted') {
                toast(translateText('App installation is in progress.'));
            }
            return;
        }
        catch (error) {
            console.info('Native install prompt already consumed or unavailable:', error);
        }
    }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (standalone) {
        toast(translateText('This app is already running in installed mode.'));
        return;
    }
    const tr = text => esc(translateText(text));
    modal(translateText('Install application'), `
        <p>${tr("Open this app over HTTPS (for example, on GitHub Pages) and use your browser's install menu.")}</p>
        <ul>
            <li><b>Chrome / Edge:</b> ${tr('choose Install app in the ⋮ menu or use the address-bar install icon.')}</li>
            <li><b>iPhone / iPad (Safari):</b> ${tr('Share → Add to Home Screen.')}</li>
            <li><b>Android:</b> ${tr('accept the browser installation, then check your app drawer. Some launchers require you to add the installed app to the home screen manually.')}</li>
            <li><b>Firefox:</b> ${tr('desktop PWA installation may not be supported. Use Add to Home Screen on supported mobile devices.')}</li>
        </ul>
        <p>${tr('After the first load, you can work offline with local template files.')}</p>
    `, [{ label: translateText('Close') }]);
}
// Allow Chrome to show its own install banner. The user may also use our Install
// button while the saved event remains promptable; never claim that an icon is installed.
window.addEventListener('beforeinstallprompt', event => { store.installPrompt = event; $('install-btn').title = 'Install app'; });
window.addEventListener('appinstalled', () => { store.installPrompt = null; toast(translateText('App installed. On Android, find the app in the app drawer and add its icon to your home screen if needed.')); });
function runAction(action) {
    $('more-menu').classList.add('hidden');
    if (!current())
        return;
    if (action === 'layout')
        doLayout();
    else if (action === 'spread')
        changeSpread(1.17);
    else if (action === 'compact')
        changeSpread(.84);
    else if (action.startsWith('reid-'))
        doReid(action.slice(5));
    else if (action === 'duplicate-map')
        duplicateMap();
    else if (action === 'remove-map')
        confirmAction('Delete template', message('delete_template', esc(current().name)), removeMap);
    else if (action === 'png')
        exportPNG();
    else if (action === 'export-layout')
        saveLayout();
    else if (action === 'import-layout')
        $('layout-input').click();
}
$('more-menu').addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b)
    runAction(b.dataset.action); });
$('more-btn').onclick = () => $('more-menu').classList.toggle('hidden');
document.addEventListener('pointerdown', e => {
    if (!e.target.closest('#more-menu,#more-btn'))
        $('more-menu').classList.add('hidden');
    if (!e.target.closest('#canvas-legend'))
        $('canvas-legend').open = false;
    if (window.matchMedia('(max-width:970px)').matches && $('inspector').classList.contains('open') &&
        !e.target.closest('#inspector,#canvas [data-zone-index],#canvas [data-conn-index]'))
        $('inspector').classList.remove('open');
}, true);
$('open-btn').onclick = () => $('file-input').click();
$('file-input').onchange = e => { openFile(e.target.files[0]); e.target.value = ''; };
$('layout-input').onchange = e => { if (e.target.files[0])
    importLayout(e.target.files[0]); e.target.value = ''; };
$('save-btn').onclick = () => askSave(store.pack?.format);
$('convert-btn').onclick = () => askSave($('export-format').value);
$('add-map-btn').onclick = addMap;
$('add-zone-btn').onclick = addZone;
$('empty-add-btn').onclick = addZone;
$('add-conn-btn').onclick = addConnection;
$('undo-btn').onclick = undo;
$('redo-btn').onclick = redo;
$('pack-props-btn').onclick = () => { store.selected = { kind: 'pack', index: 0 }; store.inspectorView = 'selection'; store.tab = 'Pack'; renderInspector(); $('inspector').classList.add('open'); $('sidebar').classList.remove('open'); };
$('validate-btn').onclick = validateDialog;
$('new-pack-btn').onclick = newPackDialog;
$('language-select').onchange = event => { setLanguage(event.target.value); templatePicker.refreshLanguage(); renderAll(); };
initializeLanguage();
$('theme-btn').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; setTheme(t); };
function setTheme(t) {
    document.documentElement.dataset.theme = t;
    $('theme-btn').innerHTML = icon(t === 'dark' ? 'sun' : 'moon');
    renderCanvas();
    document.querySelector('meta[name="theme-color"]').content = t === 'dark' ? '#111827' : '#ffffff';
    try {
        localStorage.setItem('h3tc-theme', t);
    }
    catch { }
}
$('install-btn').onclick = installApp;
$('help-btn').onclick = helpDialog;
$('sidebar-toggle').onclick = () => $('sidebar').classList.toggle('open');
document.addEventListener('pointerdown', event => { if ($('sidebar').classList.contains('open') && !event.target.closest('#sidebar,#sidebar-toggle'))
    $('sidebar').classList.remove('open'); });
$('inspector-close').onclick = () => $('inspector').classList.remove('open');
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault();
    dragDepth++;
    $('drop-hint').classList.remove('hidden');
} });
window.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
} });
window.addEventListener('dragleave', e => { if (e.dataTransfer?.types?.includes('Files')) {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth)
        $('drop-hint').classList.add('hidden');
} });
window.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('drop-hint').classList.add('hidden'); if (e.dataTransfer?.files?.[0])
    openFile(e.dataTransfer.files[0]); });
document.addEventListener('keydown', e => {
    if ($('modal').open)
        return;
    const editing = e.target.matches('input,textarea,select,[contenteditable]');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        $('file-input').click();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        askSave(store.pack?.format);
    }
    if ((e.ctrlKey || e.metaKey) && !editing && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
    }
    if ((e.ctrlKey || e.metaKey) && !editing && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        fitView();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !editing && e.key === '+') {
        e.preventDefault();
        if (current())
            changeSpread(1.17);
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !editing && e.key === '_') {
        e.preventDefault();
        if (current())
            changeSpread(.84);
    }
    if (e.key === 'Escape') {
        store.connectMode = false;
        store.connectFrom = null;
        $('canvas-legend').open = false;
        $('more-menu').classList.add('hidden');
        $('sidebar').classList.remove('open');
        $('inspector').classList.remove('open');
        renderToolbar();
    }
    if (!editing && (e.key === 'Delete' || e.key === 'Backspace') && ['zone', 'connection'].includes(store.selected.kind)) {
        e.preventDefault();
        $('inspector-footer').querySelector('[data-inspector-action="delete"]')?.click();
    }
});
window.addEventListener('beforeunload', e => { if (store.pack?.dirty && store.pack.originalBytes) {
    e.preventDefault();
    e.returnValue = '';
} });
try {
    setTheme(localStorage.getItem('h3tc-theme') === 'light' ? 'light' : 'dark');
}
catch {
    setTheme('dark');
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    let reloadingForWorker = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !reloadingForWorker) {
            reloadingForWorker = true;
            location.reload();
        }
    });
    const registerServiceWorker = async () => {
        try {
            // External locale modules can finish after the window load event. Register
            // immediately when that happened instead of waiting for an event that has passed.
            const registration = await navigator.serviceWorker.register('./sw.js?v=1.5.5', { scope: './', updateViaCache: 'none' });
            await registration.update();
            if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
        }
        catch (error) {
            console.warn('Service worker unavailable:', error);
        }
    };
    if (document.readyState === 'complete') {
        registerServiceWorker();
    }
    else {
        window.addEventListener('load', registerServiceWorker, { once: true });
    }
}
renderAll();
initializeCatalog();
