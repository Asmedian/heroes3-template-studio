/** Portable sidecar I/O compatible with upstream h3tc.editor.models.layout_store. */
export function createSidecar(pack) {
    const maps = {};
    for (const map of pack.maps) {
        const zones = {};
        for (const zone of map.zones) {
            const p = map.layout?.[zone.id];
            if (Number.isFinite(p?.x) && Number.isFinite(p?.y))
                zones[zone.id] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
        }
        if (Object.keys(zones).length)
            maps[map.name] = { zones };
    }
    return { version: 1, maps };
}
export function readSidecar(payload, pack, currentIndex = 0) {
    if (!payload || typeof payload !== 'object')
        throw new Error('Invalid layout JSON.');
    const result = new Map();
    if (payload.version === 1 && payload.maps && typeof payload.maps === 'object') {
        pack.maps.forEach((map, index) => {
            const positions = payload.maps[map.name]?.zones;
            if (positions && typeof positions === 'object')
                result.set(index, positions);
        });
    }
    else {
        const positions = payload.positions ?? payload;
        if (positions && typeof positions === 'object' && !Array.isArray(positions)) {
            const index = Number.isInteger(payload.mapIndex) && pack.maps[payload.mapIndex]?.name === payload.map ? payload.mapIndex : currentIndex;
            result.set(index, positions);
        }
    }
    const filtered = new Map();
    for (const [index, positions] of result) {
        const ids = new Set(pack.maps[index].zones.map(z => z.id)), valid = {};
        for (const [id, p] of Object.entries(positions))
            if (ids.has(id) && Number.isFinite(p?.x) && Number.isFinite(p?.y))
                valid[id] = { x: p.x, y: p.y };
        if (Object.keys(valid).length)
            filtered.set(index, valid);
    }
    if (!filtered.size)
        throw new Error('No matching zone positions found.');
    return filtered;
}
