/**
 * Sustainability Command Centre models (src/sustainability): facility-level emissions, the green inventory, the
 * carbon balance and scenario levers, development siting and impact, and dashboard filters. Run in Node through
 * the project's Vite toolchain.
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
  const [fac, green, model, dev, store, air, spatial, ad, streets, districts] = await Promise.all([
    server.ssrLoadModule('/src/sustainability/facilities.ts'),
    server.ssrLoadModule('/src/sustainability/green.ts'),
    server.ssrLoadModule('/src/sustainability/model.ts'),
    server.ssrLoadModule('/src/sustainability/development.ts'),
    server.ssrLoadModule('/src/sustainability/store.ts'),
    server.ssrLoadModule('/src/data/airClimate.ts'),
    server.ssrLoadModule('/src/data/spatial.ts'),
    server.ssrLoadModule('/src/data/abudhabi.ts'),
    server.ssrLoadModule('/src/data/streetscapeData.ts'),
    server.ssrLoadModule('/src/sustainability/districts.ts'),
  ]);
  M = { fac, green, model, dev, store, air, spatial, ad, streets, districts };
});
after(async () => {
  await server?.close();
});

test('every industrial building is a facility with its own modelled characteristics', () => {
  const F = M.fac.FACILITIES;
  const industrial = M.ad.AD.buildings.filter((b: { n: string; b: unknown[] }) => M.fac.INDUSTRIAL_NAMES.includes(b.n) && b.b.length).length;
  assert.equal(F.length, industrial);
  // not a handful of fixed levels (the old model had 3): hundreds of distinct whole-tonne CO2 values
  assert.ok(new Set(F.map((f: { co2T: number }) => Math.round(f.co2T))).size > 200);
  // CO2 is exactly the sum of its documented parts
  for (const f of F.slice(0, 50)) {
    const p = f.co2Parts;
    assert.ok(Math.abs(f.co2T - (p.electricity + p.fuel + p.process)) < 1e-9);
    assert.ok(Math.abs(p.electricity - f.elecMWh * M.fac.GRID_KG_PER_KWH) < 1e-9);
  }
  // several factory categories are present, each with different intensities
  const cats = new Set(F.filter((f: { category: { group: string } }) => f.category.group === 'factory').map((f: { category: { id: string } }) => f.category.id));
  assert.ok(cats.size >= 8);
  const sig = new Set(M.fac.CATEGORIES.map((c: { elecKwhM2: number; fuelKwhM2: number; processKgM2: number }) => `${c.elecKwhM2}/${c.fuelKwhM2}/${c.processKgM2}`));
  assert.equal(sig.size, M.fac.CATEGORIES.length);
  // the existing air/climate panels now read the same per-factory CO2
  for (const f of M.air.FACTORIES.slice(0, 20)) assert.equal(f.co2T, Math.round(F.find((x: { id: number }) => x.id === f.id).co2T));
});

test('the green inventory counts the trees and palms actually placed in the city; O2 is consistent with CO2', () => {
  const P = M.green.PLANTS;
  const expected = M.streets.STREETSCAPE.trees.length + M.ad.LAGOONS.trees.length + M.ad.LAGOONS.palms.length + M.ad.AD.palms.length;
  assert.equal(P.length, expected);
  const g = M.green.greenSummary();
  assert.ok(Math.abs(g.o2T - g.co2T * (32 / 44)) < 1e-9);
  assert.equal(M.air.SHADE_TREE_COUNT, P.filter((p: { type: string }) => p.type === 'shade').length);
  assert.equal(M.air.O2_KG_PER_TREE_YEAR, Math.round(22 * (32 / 44)));
  // more trees, more uptake and more irrigation
  const g2 = M.green.greenSummary(1000);
  assert.ok(g2.co2T > g.co2T && g2.irrigationM3Day > g.irrigationM3Day);
});

test('carbon balance adds up and never subtracts oxygen', () => {
  const s = M.model.snapshot();
  const c = s.carbon;
  assert.ok(Math.abs(c.emissionsT - (c.industryT + c.buildingsT + c.vehiclesT - c.solarCutT)) < 1e-6);
  assert.ok(Math.abs(c.netT - (c.emissionsT - c.treeUptakeT)) < 1e-6);
  assert.notEqual(c.netT, c.emissionsT - c.treeUptakeT - s.o2T);
  assert.deepEqual(M.model.snapshot(), s, 'deterministic');
  // district totals add up to the city totals they cover
  const indSum = s.byDistrict.reduce((a: number, d: { industryCo2: number }) => a + d.industryCo2, 0);
  assert.ok(indSum <= c.industryT + 1e-6);
});

test('scenario levers move the indicators they should, and only those', () => {
  const B = M.model.BASE_LEVERS;
  const base = M.model.snapshot(B);
  const solar = M.model.snapshot({ ...B, rooftopSolar: 0.7 });
  assert.ok(solar.energy.gridMWh < base.energy.gridMWh && solar.carbon.netT < base.carbon.netT);
  const abate = M.model.snapshot({ ...B, abatement: 1 });
  const pm = (s: { facilities: { pmIdx: number }[] }) => s.facilities.reduce((a, f) => a + f.pmIdx, 0);
  assert.ok(pm(abate) < pm(base));
  assert.ok(Math.abs(abate.carbon.netT - base.carbon.netT) < 1e-6, 'filters do not change CO2');
  const elec = M.model.snapshot({ ...B, electrifyFuel: 0.5 });
  assert.ok(elec.energy.demandMWh > base.energy.demandMWh && elec.energy.fuelMWh < base.energy.fuelMWh);
  const reuse = M.model.snapshot({ ...B, reuse: 0.5 });
  assert.ok(reuse.water.totalM3Day < base.water.totalM3Day);
  const cleanGrid = M.model.snapshot({ ...B, gridKg: 0.2 });
  assert.ok(cleanGrid.carbon.netT < base.carbon.netT);
});

test('proposed developments are sited on vacant, road-accessible land inside the district', () => {
  const r = M.dev.runDevelopment(M.dev.DEV_DEFAULTS);
  assert.ok(r.sites.length > 0);
  const d = M.districts.DISTRICTS.find((x: { id: string }) => x.id === M.dev.DEV_DEFAULTS.district);
  for (const s of r.sites) {
    assert.ok(s.x >= d.box[0] && s.x <= d.box[1] && s.z >= d.box[2] && s.z <= d.box[3], 'inside the district');
    for (const [fx, fz] of [[0, 0], [-0.45, -0.45], [0.45, 0.45], [-0.45, 0.45], [0.45, -0.45]]) {
      const x = s.x + fx * s.w;
      const z = s.z + fz * s.d;
      assert.equal(M.spatial.inBuilding(x, z, 0), false, 'not on a building');
      assert.ok(M.spatial.kerbDistance(x, z, 2) > 0, 'not on a carriageway');
    }
    assert.ok(M.spatial.kerbDistance(s.x, s.z, 12) < Math.max(s.w, s.d) / 2 + 2.6, 'road access');
  }
  // sites never overlap each other
  for (let i = 0; i < r.sites.length; i++)
    for (let j = i + 1; j < r.sites.length; j++) {
      const a = r.sites[i];
      const b = r.sites[j];
      assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2);
    }
});

test('development impact: more load, mitigation lowers it, the lagoons and residential areas are flagged', () => {
  const r = M.dev.runDevelopment(M.dev.DEV_DEFAULTS);
  const [now, plain, mit] = r.states;
  assert.ok(plain.co2T > now.co2T && plain.elecMWh > now.elecMWh && plain.waterM3Day > now.waterM3Day && plain.vehKmDay > now.vehKmDay);
  assert.ok(mit.co2T < plain.co2T);
  assert.ok(mit.trees > now.trees);
  const more = M.dev.runDevelopment({ ...M.dev.DEV_DEFAULTS, count: 25 });
  assert.ok(more.states[1].co2T - now.co2T >= plain.co2T - now.co2T);
  const lagoons = M.dev.runDevelopment({ ...M.dev.DEV_DEFAULTS, district: 'lagoons' });
  assert.equal(lagoons.sites.length, 0);
  assert.ok(lagoons.warnings.some((w: string) => /fully plotted/.test(w)));
  assert.throws(() => M.dev.runDevelopment({ ...M.dev.DEV_DEFAULTS, category: 'fuel-storage' }), /not available/);
  assert.deepEqual(M.dev.runDevelopment(M.dev.DEV_DEFAULTS), r, 'deterministic');
});

test('dashboard filters select exactly the matching facilities', () => {
  const F = M.model.snapshot().facilities;
  const f = { categories: ['metal', 'food'], districts: ['far-north'], mitigation: 'none', minCo2: 50 };
  const out = M.store.applyFilters(F, f);
  assert.ok(out.length > 0);
  for (const x of out) assert.ok(['metal', 'food'].includes(x.category.id) && x.district === 'far-north' && x.mitigation === 'none' && x.co2T >= 50);
  const missed = F.filter((x: { category: { id: string }; district: string; mitigation: string; co2T: number }) => ['metal', 'food'].includes(x.category.id) && x.district === 'far-north' && x.mitigation === 'none' && x.co2T >= 50);
  assert.equal(out.length, missed.length);
  assert.equal(M.store.applyFilters(F, M.store.NO_FILTERS).length, F.length);
});
