import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadGraph, routeBetween, shortestPath, nearestNode, type RoadLike } from '../src/data/freightRoute.ts';

// A small grid: 0,0 - 10,0 - 20,0 along x, and 10,0 - 10,10 going north.
const roads: RoadLike[] = [
  { c: 'primary', p: [[0, 0], [10, 0], [20, 0]] },
  { c: 'residential', p: [[10, 0], [10, 10]] },
  { c: 'footway', p: [[0, 0], [0, 50]] }, // not a freight class: must be ignored
];

test('graph ignores non-freight classes and joins coincident junction points', () => {
  const g = buildRoadGraph(roads);
  assert.equal(g.nodes.length, 4);
  const j = nearestNode(g, [10, 0]);
  assert.equal(g.adj[j].length, 3);
});

test('shortest path follows the road network and reports its length', () => {
  const g = buildRoadGraph(roads);
  const r = routeBetween(g, [0, 0], [10, 10]);
  assert.ok(r);
  assert.deepEqual(r.points, [[0, 0], [10, 0], [10, 10]]);
  assert.equal(r.lengthUnits, 20);
});

test('unreachable targets return null rather than a fabricated route', () => {
  const g = buildRoadGraph([...roads, { c: 'primary', p: [[100, 100], [110, 100]] }]);
  assert.equal(routeBetween(g, [0, 0], [105, 100]), null);
  assert.equal(shortestPath(g, 0, 999), null);
});

test('empty graph and invalid indices fail cleanly', () => {
  const g = buildRoadGraph([]);
  assert.equal(nearestNode(g, [0, 0]), -1);
  assert.equal(routeBetween(g, [0, 0], [1, 1]), null);
});

test('same start and end gives a zero-length route', () => {
  const g = buildRoadGraph(roads);
  const r = routeBetween(g, [20, 0], [20, 0]);
  assert.ok(r);
  assert.equal(r.lengthUnits, 0);
});
