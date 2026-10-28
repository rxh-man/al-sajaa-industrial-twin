import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBuildingPick, ROOF_ZONE_EPS } from '../src/data/warehouseRoofs.ts';

// a warehouse whose box top is at y = 0.3 + 6 = 6.3 scene units
const wh = { id: 42, n: 'Logistics warehouse', y: 0.3, h: 6 };
const top = wh.y + wh.h;
const villa = { id: 7, n: 'Villa', y: 0, h: 3 };

test('a hit at or above the roof line is the roof, whatever the face tilt', () => {
  assert.deepEqual(classifyBuildingPick(wh, top), { kind: 'roof', id: 'WH-42' }); // flat top
  assert.deepEqual(classifyBuildingPick(wh, top + 0.3), { kind: 'roof', id: 'WH-42' }); // dome shoulder, gable slope, parapet rim
  assert.deepEqual(classifyBuildingPick(wh, top - ROOF_ZONE_EPS / 2), { kind: 'roof', id: 'WH-42' }); // float tolerance at the eave
});

test('a hit below the roof line is the building: walls, canopies and bays', () => {
  assert.deepEqual(classifyBuildingPick(wh, top - 0.5), { kind: 'building' }); // wall
  assert.deepEqual(classifyBuildingPick(wh, wh.y + 0.3 * wh.h), { kind: 'building' }); // canopy top on the front
  assert.deepEqual(classifyBuildingPick(wh, top - ROOF_ZONE_EPS - 0.001), { kind: 'building' }); // just under the eave
});

test('other buildings are never roof, even high up', () => {
  assert.deepEqual(classifyBuildingPick(villa, 3), { kind: 'building' });
  assert.deepEqual(classifyBuildingPick(villa, 50), { kind: 'building' });
});

test('missing or invalid points are the building, never the roof', () => {
  assert.deepEqual(classifyBuildingPick(wh, undefined), { kind: 'building' });
  assert.deepEqual(classifyBuildingPick(wh, Number.NaN), { kind: 'building' });
  assert.deepEqual(classifyBuildingPick(wh, Number.POSITIVE_INFINITY), { kind: 'building' });
});
