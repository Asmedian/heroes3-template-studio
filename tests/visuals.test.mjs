import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionDisplayLabel, isRenderableConnection } from '../src/visuals.js';

test('Border Guard connections display both the flag and their numeric value', () => {
    assert.equal(connectionDisplayLabel({ value: '9000', border_guard: 'x' }), '┃ 9k');
    assert.equal(connectionDisplayLabel({ value: '8501', border_guard: 'x' }), '┃ 8501');
    assert.equal(connectionDisplayLabel({ value: '', border_guard: 'x' }), '┃');
    assert.equal(connectionDisplayLabel({ value: '45000', border_guard: '1' }), '┃ 45k');
    assert.equal(connectionDisplayLabel({ value: '9000', border_guard: '' }), '9k');
});

test('connections with missing or unknown endpoints are not rendered', () => {
    const zoneIds = new Set(['1', '2']);
    assert.equal(isRenderableConnection({ zone1: '1', zone2: '2' }, zoneIds), true);
    assert.equal(isRenderableConnection({ zone1: '', zone2: '' }, zoneIds), false);
    assert.equal(isRenderableConnection({ zone1: '1', zone2: '' }, zoneIds), false);
    assert.equal(isRenderableConnection({ zone1: '1', zone2: '999' }, zoneIds), false);
});
