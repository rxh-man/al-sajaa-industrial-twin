/**
 * Completion sprint 2: external weather (parsing, caching, failure handling), smoke driven by the facility
 * model, air and asset filters, traffic signal heads, parking furniture and loading docks, and the overlay
 * labels that replaced drei <Html>. Run in Node through the project's Vite toolchain.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let M: any;

before(async () => {
  server = await createServer({ root: new URL('..', import.meta.url).pathname, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  await server.ssrLoadModule('/src/store/useTwinStore.ts');
  const [weather, env, plumes, fac, traffic, parking, streets, spatial, details] = await Promise.all([
    server.ssrLoadModule('/src/env/weather.ts'),
    server.ssrLoadModule('/src/env/store.ts'),
    server.ssrLoadModule('/src/three/AirPlumes.tsx'),
    server.ssrLoadModule('/src/sustainability/facilities.ts'),
    server.ssrLoadModule('/src/three/AbuDhabiTraffic.tsx'),
    server.ssrLoadModule('/src/data/parkingFurniture.ts'),
    server.ssrLoadModule('/src/data/streetscapeData.ts'),
    server.ssrLoadModule('/src/data/spatial.ts'),
    server.ssrLoadModule('/src/three/FactoryDetails.tsx'),
  ]);
  M = { weather, env, plumes, fac, traffic, parking, streets, spatial, details };
});
after(async () => {
  await server?.close();
});

const sample = { current: { time: '2026-11-01T10:00', temperature_2m: 31.2, relative_humidity_2m: 48, wind_speed_10m: 4.1, wind_direction_10m: 300, shortwave_radiation: 640 } };
const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test('external weather: parsed, plausibility-checked, cached, and failures never throw', async () => {
  const w = M.weather.parseWeather(sample, 1000);
  assert.equal(w.temperatureC, 31.2);
  assert.equal(w.windFromDeg, 300);
  assert.equal(M.weather.parseWeather({ current: { ...sample.current, temperature_2m: 99 } }), null, 'implausible value rejected');
  assert.equal(M.weather.parseWeather({}), null);
  const store = memStore();
  let calls = 0;
  const ok = async () => {
    calls++;
    return new Response(JSON.stringify(sample), { status: 200 });
  };
  const a = await M.weather.fetchWeather(ok, store, 0);
  assert.equal(a.ok, true);
  assert.equal(a.cached, false);
  const b = await M.weather.fetchWeather(ok, store, 60_000);
  assert.equal(b.cached, true, 'served from cache within 30 min');
  assert.equal(calls, 1);
  const c = await M.weather.fetchWeather(ok, store, 31 * 60_000);
  assert.equal(c.cached, false, 'refetched after expiry');
  const down = await M.weather.fetchWeather(async () => new Response('', { status: 503 }), memStore());
  assert.equal(down.ok, false);
  assert.match(down.reason, /503/);
  const offline = await M.weather.fetchWeather(async () => {
    throw new Error('blocked');
  }, memStore());
  assert.equal(offline.ok, false);
  assert.match(offline.reason, /not reachable/);
  // wind FROM north (0°) blows the plume south: +z in the twin (x east, z south) → direction 90° (cos 0, sin 1)
  assert.equal(M.weather.plumeDirFromMeteo(0), 90);
  assert.equal(M.weather.plumeDirFromMeteo(270), 0, 'from the west → toward the east (+x)');
});

test('smoke strength follows each factory\'s modelled emissions and abatement', () => {
  const F = M.fac.FACILITIES.filter((f: { category: { group: string } }) => f.category.group === 'factory');
  const s = (f: { id: number }) => M.plumes.smokeStrength(f.id);
  for (const f of F) assert.ok(s(f) >= 0 && s(f) <= 1);
  const byLocal = [...F].sort((a, b) => b.pmIdx + b.noxIdx - (a.pmIdx + a.noxIdx));
  assert.ok(s(byLocal[0]) > s(byLocal[byLocal.length - 1]), 'the dirtiest factory has the strongest plume');
  assert.ok(new Set(F.map((f: { id: number }) => s(f).toFixed(3))).size > 50, 'plumes differ between factories');
});

test('air filters select factories by type, CO2 and abatement', () => {
  const F = M.fac.FACILITIES;
  const f = { categories: ['chemical'], minCo2: 100, abatement: 'none' };
  const hit = F.filter((x: object) => M.env.airFilterMatch(x, f));
  for (const x of hit) assert.ok(x.category.id === 'chemical' && x.co2T >= 100 && x.mitigation === 'none');
  assert.equal(F.filter((x: object) => M.env.airFilterMatch(x, M.env.NO_AIR_FILTERS)).length, F.length);
});

test('traffic signal heads show the same phase the cars obey, and stand off the carriageway', () => {
  for (let t = 0; t < 72; t += 0.5)
    for (const axis of [0, 1] as const) {
      const lamp = M.traffic.signalLamp(1, axis, t);
      const other = M.traffic.signalLamp(1, axis === 0 ? 1 : 0, t);
      assert.ok(!(lamp === 'green' && other === 'green'), 'crossing axes are never green together');
    }
  const pts = (a: number[][]) => a;
  const links = [
    { b: 'J', pts: pts([[0, -20], [0, 0]]), hwy: false, elev: false, speed: 2.6 },
    { b: 'J', pts: pts([[-20, 0], [0, 0]]), hwy: false, elev: false, speed: 2.6 },
    { b: 'J', pts: pts([[0, 20], [0, 0]]), hwy: true, elev: false, speed: 2.6 },
    { b: 'J', pts: pts([[20, 0], [0, 0]]), hwy: false, elev: false, speed: 1.3 },
  ];
  const heads = M.traffic.signalHeadPlacements(links, new Map([['J', 0]]), false);
  assert.equal(heads.length, 2, 'no head for grade-separated highway or residential approaches');
  // heading south (+z) the right-hand side is west (−x)
  assert.ok(heads[0].x < 0 && heads[0].z < 0);
});

test('parking furniture: wheel stops inside lots, access aisles left clear, signs off the road', () => {
  const lots = M.streets.STREETSCAPE.lots;
  const inLot = (x: number, z: number) => lots.some((l: { x0: number; z0: number; x1: number; z1: number }) => x >= l.x0 - 1e-6 && x <= l.x1 + 1e-6 && z >= l.z0 - 1e-6 && z <= l.z1 + 1e-6);
  assert.ok(M.parking.WHEEL_STOPS.length > 500);
  for (const w of M.parking.WHEEL_STOPS) assert.ok(inLot(w.x, w.z));
  const aisles = M.parking.ACCESSIBLE.filter((a: { aisle: boolean }) => a.aisle);
  assert.ok(aisles.length >= 20);
  for (const a of aisles) {
    const blocked = M.streets.STREETSCAPE.parked.some((p: { x: number; z: number }) => Math.hypot(p.x - a.x, p.z - a.z) < 0.18);
    assert.equal(blocked, false, `access aisle at ${a.x},${a.z} is clear`);
  }
  for (const s of M.parking.PARKING_SIGNS) assert.ok(M.spatial.kerbDistance(s.x, s.z, 2) > 0);
});

test('loading docks are active across the industrial districts, with forklifts', () => {
  const S = M.streets.STREETSCAPE;
  assert.ok(S.aprons.length >= 50);
  const kinds = (k: string) => S.parked.filter((p: { kind: string }) => p.kind === k).length;
  assert.ok(kinds('forklift') >= 30);
  assert.ok(kinds('boxTruck') + kinds('reefer') + kinds('flatbed') + kinds('serviceVan') >= 60);
});

test('overlay labels no longer use drei <Html> (source of the removeChild error); small rooftop parts have a camera LOD', () => {
  for (const f of ['src/opsAgent/OpsOverlay.tsx', 'src/sustainability/SustainabilityOverlay.tsx']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/<Html\b/.test(src), `${f} uses sprite labels`);
  }
  assert.ok(M.details.SMALL_PARTS_MAX_HEIGHT > 10 && M.details.SMALL_PARTS_MAX_HEIGHT < 70);
});

test('real signal heads on the city road graph: one per signalled approach, none on a carriageway', () => {
  const { links } = M.traffic.buildLinks();
  const heads = M.traffic.signalHeadPlacements(links, M.traffic.junctionNodes(links));
  assert.ok(heads.length > 100 && heads.length < 2500, `${heads.length} heads`);
  for (const h of heads) {
    assert.ok(M.spatial.kerbDistance(h.x, h.z, 2) >= 0.02, 'off the carriageway');
    assert.equal(M.spatial.inBuilding(h.x, h.z, 0.05), false, 'not in a building');
  }
});
