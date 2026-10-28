import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warehouseRoofs, roofAssetId, excludedRoofAreaM2, boxesAreaM2, type RoofSource } from '../src/data/warehouseRoofs.ts';

const wh = (id: number, b: RoofSource['b'], y = 0, h = 2): RoofSource => ({ id, n: 'Logistics warehouse', y, h, b });

test('stable ids come from building ids, not array position', () => {
  const a = wh(7, [[0, 0, 2, 2]]);
  const b = wh(3, [[5, 5, 6, 6]]);
  const fwd = warehouseRoofs([a, b]).map((r) => r.id);
  const rev = warehouseRoofs([b, a]).map((r) => r.id);
  assert.deepEqual(fwd, ['WH-3', 'WH-7']);
  assert.deepEqual(rev, fwd);
  assert.equal(roofAssetId(42), 'WH-42');
});

test('non-warehouses, empty footprints and duplicate ids are ignored', () => {
  const factory = { ...wh(1, [[0, 0, 1, 1]]), n: 'Factory hall' };
  const empty = wh(2, []);
  const dup1 = wh(9, [[0, 0, 1, 1]]);
  const dup2 = wh(9, [[4, 4, 5, 5]]);
  const roofs = warehouseRoofs([factory, empty, dup1, dup2]);
  assert.deepEqual(roofs.map((r) => r.id), ['WH-9']);
});

test('roof area uses 1 unit = 10 m, and top height is base plus height', () => {
  const [r] = warehouseRoofs([wh(1, [[0, 0, 2, 3]], 1.5, 2)]);
  assert.equal(r.areaM2, 2 * 10 * 3 * 10);
  assert.equal(r.topY, 3.5);
  assert.deepEqual(r.centre, [1, 1.5]);
});

test('zero-size boxes give zero area without NaN centres', () => {
  assert.equal(boxesAreaM2([[1, 1, 1, 5]]), 0);
  const [r] = warehouseRoofs([wh(4, [[1, 1, 1, 5]])]);
  assert.equal(r.areaM2, 0);
  assert.ok(Number.isFinite(r.centre[0]) && Number.isFinite(r.centre[1]));
});

test('excluded roof area sums only known ids', () => {
  const roofs = warehouseRoofs([wh(1, [[0, 0, 1, 1]]), wh(2, [[0, 0, 2, 2]])]);
  assert.equal(excludedRoofAreaM2(roofs, ['WH-2', 'WH-99']), roofs[1].areaM2);
  assert.equal(excludedRoofAreaM2(roofs, []), 0);
});

import { solarRoofAreaM2 } from '../src/data/warehouseRoofs.ts';

test('solar roof area drops by the excluded roof and never goes negative', () => {
  const roofs = warehouseRoofs([wh(1, [[0, 0, 2, 3]]), wh(2, [[0, 0, 1, 1]])]);
  const total = 5000;
  assert.equal(solarRoofAreaM2(total, roofs, []), total);
  assert.equal(solarRoofAreaM2(total, roofs, ['WH-1']), total - roofs[0].areaM2);
  assert.equal(solarRoofAreaM2(total, roofs, ['WH-1', 'WH-2']), total - roofs[0].areaM2 - roofs[1].areaM2);
  assert.equal(solarRoofAreaM2(10, roofs, ['WH-1', 'WH-2']), 0);
  assert.equal(solarRoofAreaM2(total, roofs, ['WH-404']), total); // unknown id changes nothing
});
