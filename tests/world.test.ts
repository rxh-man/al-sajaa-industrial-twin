/**
 * The rendered world (src/data/abudhabi.ts: baseline + expansion + corrections) matches the world that
 * scripts/validate-world.py checks, and the rail is grade-separated at its four underpasses.
 * Run scripts/build-world-fixes.py after changing the corrections; it records the fingerprint used here.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ad: any, rail: any, fixes: any, scape: any;

before(async () => {
  server = await createServer({
    root: new URL('..', import.meta.url).pathname,
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
  });
  [ad, rail, fixes, scape] = await Promise.all([
    server.ssrLoadModule('/src/data/abudhabi.ts'),
    server.ssrLoadModule('/src/three/RailTrain.tsx'),
    server.ssrLoadModule('/src/data/alsajaa-fixes.json'),
    server.ssrLoadModule('/src/data/streetscapeData.ts'),
  ]);
});

after(async () => {
  await server?.close();
});

const r3 = (v: number) => Math.round(v * 1000) / 1000;

test('the TypeScript world merge matches the corrected world the Python checks validated', () => {
  const { AD } = ad;
  const e = fixes.default.meta.expect;
  assert.equal(AD.roads.length, e.roads);
  assert.equal(AD.buildings.length, e.buildings);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(AD.roads.reduce((s: number, r: any) => s + r.p.length, 0), e.roadPoints);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roadSum = AD.roads.reduce((s: number, r: any) => s + r.p.reduce((t: number, p: number[]) => t + p[0] + 2 * p[1], 0), 0);
  assert.ok(Math.abs(roadSum - e.roadSum) < 0.05, `road coordinates differ: ${r3(roadSum)} vs ${e.roadSum}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boxSum = AD.buildings.reduce((s: number, b: any) => s + b.b.reduce((t: number, q: number[]) => t + q[0] + q[1] + q[2] + q[3], 0), 0);
  assert.ok(Math.abs(boxSum - e.boxSum) < 0.05, `footprints differ: ${r3(boxSum)} vs ${e.boxSum}`);
  const palmSum = AD.palms.reduce((s: number, p: number[]) => s + p[0] + p[1], 0);
  assert.ok(Math.abs(palmSum - e.palmSum) < 0.05, `palms differ: ${r3(palmSum)} vs ${e.palmSum}`);
});

test('building ids and order are unchanged by the corrections (picking and roofs index by position)', () => {
  const { AD, AD_BASE } = ad;
  AD_BASE.buildings.forEach((b: { id: number }, i: number) => assert.equal(AD.buildings[i].id, b.id));
});

test('the rail has at most four crossings, each on a raised deck', () => {
  const g = rail.railGeometry();
  assert.ok(g.crossS.length >= 1, 'the line should be crossed somewhere');
  const places = g.crossS.filter((s: number, i: number, a: number[]) => i === 0 || s - a[i - 1] > 4);
  assert.ok(places.length <= 4, `rail crossed at ${places.length} places`);
  for (const s of g.crossS) assert.equal(g.height(s), rail.RAIL_BRIDGE_H, `crossing at ${s} is not on the deck`);
  // the line is at ground level away from the underpasses (by the station)
  const mid = g.spans.length > 1 ? (g.spans[0][1] + g.spans[1][0]) / 2 : g.total / 2;
  assert.equal(g.height(mid), 0);
});

test('streetscape items stay off carriageways and out of buildings', async () => {
  const sp = await server.ssrLoadModule('/src/data/spatial.ts');
  const { STREETSCAPE } = scape;
  assert.ok(STREETSCAPE.parked.length > 200, `only ${STREETSCAPE.parked.length} parked vehicles`);
  for (const c of STREETSCAPE.parked) {
    assert.ok(sp.kerbDistance(c.x, c.z) > 0, `parked ${c.kind} at ${c.x},${c.z} is on a carriageway`);
    assert.ok(!sp.inBuilding(c.x, c.z), `parked ${c.kind} at ${c.x},${c.z} is inside a building`);
  }
  for (const s of STREETSCAPE.stops) {
    assert.ok(sp.kerbDistance(s.x, s.z) > 0.1, `bus stop at ${s.x},${s.z} is on a carriageway`);
    assert.ok(!sp.inBuilding(s.x, s.z), `bus stop at ${s.x},${s.z} is inside a building`);
  }
  // nothing on the rail corridor (z = -50.5 in the core)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onRail = (x: number, z: number) => x > -152 && x < 120 && Math.abs(z + 50.5) < 0.7;
  for (const c of STREETSCAPE.parked) assert.ok(!onRail(c.x, c.z), `parked ${c.kind} on the rail at ${c.x},${c.z}`);
  for (const l of STREETSCAPE.lots) assert.ok(!(l.z0 < -49.8 && l.z1 > -51.2 && l.x1 > -152 && l.x0 < 120), `lot over the rail ${JSON.stringify(l)}`);
  for (const t of STREETSCAPE.trees) assert.ok(sp.kerbDistance(t.x, t.z) > 0.2 && !sp.inBuilding(t.x, t.z), `tree at ${t.x},${t.z}`);
  // the precomputed layout is current (rerun scripts/build-streetscape.mjs when this fails)
  const { buildStreetscape } = await server.ssrLoadModule('/src/data/streetscape.ts');
  const fresh = buildStreetscape();
  for (const k of Object.keys(fresh)) assert.equal(STREETSCAPE[k].length, fresh[k].length, `streetscape ${k} is stale`);
  // no two parked vehicles share a spot
  const keys = new Set(STREETSCAPE.parked.map((c: { x: number; z: number }) => `${Math.round(c.x * 4)}:${Math.round(c.z * 4)}`));
  assert.equal(keys.size, STREETSCAPE.parked.length);
});

test('no street lamp stands on a carriageway or on the rail corridor', async () => {
  const [{ LAMPS }, sp, { AD }] = await Promise.all([
    server.ssrLoadModule('/src/data/lamps.ts'),
    server.ssrLoadModule('/src/data/spatial.ts'),
    server.ssrLoadModule('/src/data/abudhabi.ts'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rail = AD.roads.find((r: any) => r.c === 'rail');
  for (const l of LAMPS) {
    assert.ok(sp.kerbDistance(l.x, l.z) > 0.05, `lamp at ${l.x},${l.z} is on a carriageway`);
    for (let i = 1; i < rail.p.length; i++) {
      const d = sp.segDist(l.x, l.z, { ax: rail.p[i - 1][0], az: rail.p[i - 1][1], bx: rail.p[i][0], bz: rail.p[i][1] });
      assert.ok(d >= 0.75, `lamp at ${l.x},${l.z} is on the rail corridor`);
    }
  }
});

test('Al Sajaa Lagoons: villas, cars and trees stay off the roads and out of the water, and it joins the road network', async () => {
  const [sp, { AD, LAGOONS, inLagoonWater }] = await Promise.all([server.ssrLoadModule('/src/data/spatial.ts'), server.ssrLoadModule('/src/data/abudhabi.ts')]);
  assert.ok(LAGOONS.villas.length > 500, `${LAGOONS.villas.length} villas`);
  for (const v of LAGOONS.villas) {
    assert.ok(sp.kerbDistance(v.x, v.z) > 0.4, `villa at ${v.x},${v.z} is on a road`);
    assert.ok(!inLagoonWater(v.x, v.z), `villa at ${v.x},${v.z} is in the water`);
  }
  for (const c of LAGOONS.cars) assert.ok(sp.kerbDistance(c.x, c.z) > 0, `car at ${c.x},${c.z} is on a carriageway`);
  for (const t of LAGOONS.trees) assert.ok(sp.kerbDistance(t.x, t.z) > 0.3 && !inLagoonWater(t.x, t.z), `tree at ${t.x},${t.z}`);
  // the gates share node ids with the South Road, so traffic can drive in
  const ids = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of AD.roads) if (r.n === 'Al Sajaa South Road') r.k.forEach((k: string) => ids.add(k));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gates = LAGOONS.roads.filter((r: any) => r.n.startsWith('Lagoons Gate'));
  assert.equal(gates.length, 3);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const g of gates) assert.ok(ids.has(g.k[0]), `${g.n} does not meet the South Road at a shared node`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.ok(AD.places.some((p: any) => p.n === 'Al Sajaa Lagoons'));
});
