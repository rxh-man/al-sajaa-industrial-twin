/**
 * City realism and spatial correctness: solar panels and buildings never sit on carriageways, the factory
 * equipment stays on its own roof or facade, EV chargers stand in real bays, and the expanded vehicle catalogue
 * builds and is used. Run in Node through the project's Vite toolchain.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let M: any;

before(async () => {
  server = await createServer({ root: new URL('..', import.meta.url).pathname, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  await server.ssrLoadModule('/src/store/useTwinStore.ts');
  const [ad, spatial, details, fac, ev, streets, vehicles, roofs] = await Promise.all([
    server.ssrLoadModule('/src/data/abudhabi.ts'),
    server.ssrLoadModule('/src/data/spatial.ts'),
    server.ssrLoadModule('/src/three/FactoryDetails.tsx'),
    server.ssrLoadModule('/src/sustainability/facilities.ts'),
    server.ssrLoadModule('/src/data/evCharging.ts'),
    server.ssrLoadModule('/src/data/streetscapeData.ts'),
    server.ssrLoadModule('/src/three/vehicles/vehicleModels.ts'),
    server.ssrLoadModule('/src/data/climateAgents.ts'),
  ]);
  M = { ad, spatial, details, fac, ev, streets, vehicles, roofs };
});
after(async () => {
  await server?.close();
});

/** sample a box on a grid, inset from its edges */
function samples([x0, z0, x1, z1]: number[], step = 0.5, inset = 0.15) {
  const out: [number, number][] = [];
  for (let x = Math.min(x0, x1) + inset; x <= Math.max(x0, x1) - inset; x += step) for (let z = Math.min(z0, z1) + inset; z <= Math.max(z0, z1) - inset; z += step) out.push([x, z]);
  return out;
}

test('no solar panel (ground fields or warehouse roofs) stands over a carriageway', () => {
  const fields = M.ad.AD.buildings.filter((b: { n: string }) => b.n === 'Solar panel field');
  assert.ok(fields.length > 0);
  const bad: string[] = [];
  for (const f of fields) for (const box of f.b) for (const [x, z] of samples(box)) if (M.spatial.kerbDistance(x, z, 2) < 0) bad.push(`field ${f.id} @${x.toFixed(1)},${z.toFixed(1)}`);
  for (const r of M.roofs.WAREHOUSE_ROOF_RECORDS) for (const box of r.boxes) for (const [x, z] of samples(box)) if (M.spatial.kerbDistance(x, z, 2) < 0) bad.push(`roof ${r.id} @${x.toFixed(1)},${z.toFixed(1)}`);
  assert.deepEqual(bad.slice(0, 10), []);
});

test('industrial buildings stay off the carriageways', () => {
  const bad: string[] = [];
  for (const f of M.fac.FACILITIES) for (const box of f.boxes) for (const [x, z] of samples(box, 0.6, 0.2)) if (M.spatial.kerbDistance(x, z, 2) < -0.05) bad.push(`#${f.id} ${f.name}`);
  assert.deepEqual([...new Set(bad)].slice(0, 10), []);
});

test('factory equipment stays on its own roof; dock doors sit on a facade, off the road', () => {
  const d = M.details.factoryDetailsFor(M.fac.FACILITIES);
  assert.ok(d.stacks.length > 100 && d.hvac.length > 500 && d.doors.length > 500);
  const roofOf = (x: number, z: number) => M.fac.FACILITIES.some((f: { boxes: number[][] }) => f.boxes.some(([x0, z0, x1, z1]) => x >= Math.min(x0, x1) - 1e-6 && x <= Math.max(x0, x1) + 1e-6 && z >= Math.min(z0, z1) - 1e-6 && z <= Math.max(z0, z1) + 1e-6));
  for (const it of [...d.stacks, ...d.tanks, ...d.hvac]) assert.ok(roofOf(it.x, it.z), `equipment at ${it.x},${it.z} is on a roof`);
  for (const door of d.doors) assert.ok(M.spatial.kerbDistance(door.x, door.z, 2) > -0.01, `door at ${door.x},${door.z} is off the road`);
  // only categories that burn fuel or emit process CO2 get stacks; storage and logistics never do
  const ids = new Set(M.fac.FACILITIES.filter((f: { category: { group: string } }) => f.category.group !== 'factory').map((f: { x: number; z: number }) => `${f.x},${f.z}`));
  for (const s of d.stacks) assert.ok(!ids.has(`${s.x},${s.z}`));
});

test('EV chargers stand in real parking bays, not on roads or in buildings', () => {
  assert.ok(M.ev.EV_BAYS.length >= 50);
  for (const b of M.ev.EV_BAYS) {
    const inLot = M.streets.STREETSCAPE.lots.some((l: { x0: number; z0: number; x1: number; z1: number }) => b.x >= l.x0 - 1e-6 && b.x <= l.x1 + 1e-6 && b.z >= l.z0 - 1e-6 && b.z <= l.z1 + 1e-6);
    assert.ok(inLot, 'inside a lot');
    assert.ok(M.spatial.kerbDistance(b.px, b.pz, 2) > 0, 'post off the carriageway');
    assert.equal(M.spatial.inBuilding(b.px, b.pz, 0), false, 'post not in a building');
  }
});

test('the vehicle catalogue includes sports cars, a supercar and an EV, and they are parked in the city', () => {
  for (const k of ['supercar', 'sportsGt', 'evSedan', 'luxurySedan', 'largeSuv', 'taxi', 'bus', 'ambulance', 'fireEngine']) {
    const g = M.vehicles.vehicleGeometry(k);
    assert.ok(g.getAttribute('position').count > 100, k);
    assert.ok(M.vehicles.VEHICLE_LENGTH[k] > 0, k);
  }
  const kinds = new Set(M.streets.STREETSCAPE.parked.map((p: { kind: string }) => p.kind));
  for (const k of ['supercar', 'sportsGt', 'evSedan']) assert.ok(kinds.has(k), `${k} is parked somewhere`);
  // the supercar is the lowest car in the catalogue
  const h = (k: string) => {
    const g = M.vehicles.vehicleGeometry(k);
    g.computeBoundingBox();
    return g.boundingBox.max.y;
  };
  assert.ok(h('supercar') < h('sedan') && h('supercar') < h('coupe'));
});
