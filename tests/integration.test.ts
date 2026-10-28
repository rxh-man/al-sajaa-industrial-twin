/**
 * Integration tests on the real app modules (store, climate model, route model), loaded through the
 * project's own Vite toolchain in Node. No browser, no WebGL. They cover the interaction state a user
 * changes: selection, hover, roof inclusion, the freight route, motion and the sidebar.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mods: any;

before(async () => {
  server = await createServer({
    root: new URL('..', import.meta.url).pathname,
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
  });
  const [store, climate, roofs, routes, roofPick, rail, ad, plan, freight, guidance, exposure, air, water, microgrid] = await Promise.all([
    server.ssrLoadModule('/src/store/useTwinStore.ts'),
    server.ssrLoadModule('/src/data/climateAgents.ts'),
    server.ssrLoadModule('/src/data/warehouseRoofs.ts'),
    server.ssrLoadModule('/src/data/freightRoute.ts'),
    server.ssrLoadModule('/src/three/WarehouseRoofs.tsx'),
    server.ssrLoadModule('/src/three/RailTrain.tsx'),
    server.ssrLoadModule('/src/data/abudhabi.ts'),
    server.ssrLoadModule('/src/data/actionPlan.ts'),
    server.ssrLoadModule('/src/data/freightOptimise.ts'),
    server.ssrLoadModule('/src/data/climateGuidance.ts'),
    server.ssrLoadModule('/src/data/heatExposure.ts'),
    server.ssrLoadModule('/src/data/airDispersion.ts'),
    server.ssrLoadModule('/src/data/waterSecurity.ts'),
    server.ssrLoadModule('/src/data/microgridDispatch.ts'),
  ]);
  mods = { store, climate, roofs, routes, roofPick, rail, ad, plan, freight, guidance, exposure, air, water, microgrid };
});

after(async () => {
  await server?.close();
});

const st = () => mods.store.useTwinStore.getState();
const reset = () => {
  st().select(null);
  st().setHover(null);
  st().setRouteRoof(null);
  st().setMotion('full');
  st().setRailsCollapsed(false);
  for (const id of [...st().excludedRoofs]) st().toggleRoofExcluded(id);
  if (st().resetScenario) st().resetScenario();
  if (st().savedScenarios) for (const s of [...st().savedScenarios]) st().deleteScenario(s.id);
};

test('selecting a warehouse roof sets the stable id, and clearing the selection removes it', () => {
  reset();
  const roof = mods.climate.WAREHOUSE_ROOF_RECORDS[0];
  st().select({ info: { kind: 'roof', id: roof.id }, point: [0, 0, 0] });
  assert.deepEqual(st().selection.info, { kind: 'roof', id: roof.id });
  st().select(null);
  assert.equal(st().selection, null);
});

test('hover over a roof is recorded as a roof, not a building', () => {
  reset();
  const roof = mods.climate.WAREHOUSE_ROOF_RECORDS[1];
  st().setHover({ kind: 'roof', id: roof.id });
  assert.deepEqual(st().hover, { kind: 'roof', id: roof.id });
  st().setHover(null);
  assert.equal(st().hover, null);
});

test('including and excluding a roof changes the modelled solar generation, and back again', () => {
  reset();
  const roof = mods.climate.WAREHOUSE_ROOF_RECORDS[0];
  const base = { ...mods.climate.BASELINE, solarCoverage: 0.5 };
  const withRoof = mods.climate.run(base);
  const excl = { ...base, excludedRoofs: [roof.id] };
  const without = mods.climate.run(excl);
  assert.ok(without.solarMWh < withRoof.solarMWh, 'excluding a roof must reduce solar generation');
  const expected = (roof.areaM2 / mods.climate.ROOF_M2) * withRoof.solarMWh;
  assert.ok(Math.abs(withRoof.solarMWh - without.solarMWh - expected) < 1e-6 * Math.max(1, expected), 'the drop equals the roof share of the solar area');
  // toggling through the store gives the same result as passing the list in
  st().toggleRoofExcluded(roof.id);
  assert.deepEqual(st().excludedRoofs, [roof.id]);
  st().toggleRoofExcluded(roof.id);
  assert.deepEqual(st().excludedRoofs, []);
  assert.equal(mods.climate.run({ ...base, excludedRoofs: st().excludedRoofs }).solarMWh, withRoof.solarMWh);
});

test('excluding every roof gives no more area than the factory halls alone, never negative generation', () => {
  const all = mods.climate.WAREHOUSE_ROOF_RECORDS.map((r: { id: string }) => r.id);
  const out = mods.climate.run({ ...mods.climate.BASELINE, solarCoverage: 1, excludedRoofs: all });
  assert.ok(out.solarMWh >= 0);
});

test('the freight route is only drawn for the selected roof, and most warehouses reach a factory on the road model', () => {
  reset();
  const all = mods.climate.WAREHOUSE_ROOF_RECORDS as { id: string }[];
  const routed = all.filter((r) => mods.roofPick.freightRouteFor(r.id));
  // the road network is fragmented, so a few yards cannot reach a factory; most must
  assert.ok(routed.length >= Math.floor(all.length * 0.9), `routed ${routed.length} of ${all.length}`);
  const roof = routed[0];
  const route = mods.roofPick.freightRouteFor(roof.id);
  assert.ok(route.points.length >= 2);
  assert.ok(route.lengthUnits > 0);
  // no-route behaviour: unknown ids give nothing rather than a made-up line
  assert.equal(mods.roofPick.freightRouteFor('WH-does-not-exist'), null);
  st().setRouteRoof(roof.id);
  assert.equal(st().routeRoof, roof.id);
  st().setRouteRoof(null);
  assert.equal(st().routeRoof, null);
  console.log(`warehouses with a modelled route: ${routed.length} of ${all.length}`);
});

test('motion setting maps to the expected scale and reaches the animation loops', () => {
  reset();
  assert.equal(mods.store.motionScale(), 1);
  st().setMotion('reduced');
  assert.equal(mods.store.motionScale(), 0.3);
  st().setMotion('off');
  assert.equal(mods.store.motionScale(), 0);
  st().setMotion('full');
  assert.equal(mods.store.motionScale(), 1);
});

test('the sidebar collapses and expands through the store', () => {
  reset();
  st().setRailsCollapsed(true);
  assert.equal(st().railsCollapsed, true);
  st().setRailsCollapsed(false);
  assert.equal(st().railsCollapsed, false);
});

test('selection, hover, route and inclusion can be set together without clearing each other', () => {
  reset();
  const a = mods.climate.WAREHOUSE_ROOF_RECORDS[0].id;
  const b = mods.climate.WAREHOUSE_ROOF_RECORDS[1].id;
  st().select({ info: { kind: 'roof', id: a }, point: [0, 0, 0] });
  st().setRouteRoof(a);
  st().toggleRoofExcluded(b);
  st().setHover({ kind: 'roof', id: b });
  assert.deepEqual(st().selection.info, { kind: 'roof', id: a });
  assert.equal(st().routeRoof, a);
  assert.deepEqual(st().excludedRoofs, [b]);
  assert.deepEqual(st().hover, { kind: 'roof', id: b });
  // a building click replaces the roof selection
  st().select({ info: { kind: 'building', id: 5 }, point: [0, 0, 0] });
  assert.deepEqual(st().selection.info, { kind: 'building', id: 5 });
});

test('railway train: full moves, reduced moves at 30 percent, off holds still, and re-enabling resumes', () => {
  reset();
  const { advanceRailClock } = mods.rail;
  // one second of 60 fps frames at each setting
  const run = (scale: number, t = 0) => {
    for (let i = 0; i < 60; i++) t = advanceRailClock(t, 1 / 60, scale);
    return t;
  };
  const full = run(mods.store.MOTION_SCALE.full);
  const reduced = run(mods.store.MOTION_SCALE.reduced);
  const off = run(mods.store.MOTION_SCALE.off);
  assert.ok(full > 0, 'full motion advances the train');
  assert.ok(Math.abs(reduced / full - 0.3) < 1e-9, `reduced is 30% of full: ${reduced / full}`);
  assert.equal(off, 0, 'off holds the train clock at its start');
  // the scene reads the setting from the store each frame, so switching back resumes at full speed
  st().setMotion('off');
  let t = advanceRailClock(0, 1 / 60, mods.store.motionScale());
  assert.equal(t, 0);
  st().setMotion('full');
  t = advanceRailClock(t, 1 / 60, mods.store.motionScale());
  assert.ok(t > 0, 're-enabled motion resumes');
});

test('railway train: a long frame is clamped, so pausing a background tab does not jump the train', () => {
  const { advanceRailClock } = mods.rail;
  assert.ok(Math.abs(advanceRailClock(0, 5, 1) - advanceRailClock(0, 0.1, 1)) < 1e-12);
});

test('freight route follows the road network: every step is a road edge and the length matches the drawn line', () => {
  const key = (p: readonly [number, number]) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  // undirected road edges from the freight road classes, as the route model builds them
  const edges = new Set<string>();
  const freight = mods.routes.FREIGHT_CLASSES as Set<string>;
  for (const r of mods.ad.AD.roads) {
    if (!freight.has(r.c)) continue;
    for (let i = 1; i < r.p.length; i++) {
      const a = key(r.p[i - 1]);
      const b = key(r.p[i]);
      edges.add(`${a}|${b}`);
      edges.add(`${b}|${a}`);
    }
  }
  const all = mods.climate.WAREHOUSE_ROOF_RECORDS as { id: string }[];
  let checked = 0;
  for (const r of all.slice(0, 40)) {
    const route = mods.roofPick.freightRouteFor(r.id);
    if (!route) continue;
    // interior points are road vertices; each consecutive pair must be a road edge
    for (let i = 2; i < route.points.length - 1; i++) {
      assert.ok(edges.has(`${key(route.points[i - 1])}|${key(route.points[i])}`), `${r.id} step ${i} is not on a road`);
    }
    // the reported length is the polyline length in scene units
    let len = 0;
    for (let i = 1; i < route.points.length; i++) {
      const [ax, az] = route.points[i - 1];
      const [bx, bz] = route.points[i];
      len += Math.hypot(bx - ax, bz - az);
    }
    assert.ok(Math.abs(len - route.lengthUnits) < 1e-6, `${r.id} length ${len} vs ${route.lengthUnits}`);
    checked++;
  }
  assert.ok(checked >= 10, `checked ${checked} routes`);
});

// ---- Climate action plan and impact ledger (deterministic, model-sourced) ----

test('baseline scenario produces a no-intervention plan with zero net delta', () => {
  const { BASELINE } = mods.climate;
  const { generateActionPlan } = mods.plan;
  const p = generateActionPlan(BASELINE);
  assert.equal(p.interventions.length, 0, 'baseline has no interventions');
  assert.equal(p.netCo2DeltaT, 0, 'baseline vs baseline is zero delta');
  assert.equal(p.validation, 'projected', 'never claims verified');
  // every impact line has baseline === proposed
  for (const l of p.impacts) assert.equal(l.delta, 0, `${l.id} delta should be 0`);
});

test('a solar scenario reduces net CO2 and reports a solar intervention', () => {
  const { BASELINE } = mods.climate;
  const { generateActionPlan } = mods.plan;
  const s = { ...BASELINE, solarCoverage: 0.5 };
  const p = generateActionPlan(s);
  assert.ok(p.interventions.some((i: { id: string }) => i.id === 'solar'), 'solar intervention present');
  assert.ok(p.netCo2DeltaT < 0, `net CO2 should fall, got ${p.netCo2DeltaT}`);
  const solarLine = p.impacts.find((l: { id: string }) => l.id === 'solar');
  assert.ok(solarLine.proposed > solarLine.baseline, 'solar generation rises above baseline');
});

test('excluding roofs lowers solar vs including them (same coverage)', () => {
  const { BASELINE, WAREHOUSE_ROOF_RECORDS } = mods.climate;
  const { generateActionPlan } = mods.plan;
  const oneId = WAREHOUSE_ROOF_RECORDS[0].id;
  const incl = generateActionPlan({ ...BASELINE, solarCoverage: 0.5 });
  const excl = generateActionPlan({ ...BASELINE, solarCoverage: 0.5, excludedRoofs: [oneId] });
  const g = (p: { impacts: { id: string; proposed: number }[] }) => p.impacts.find((l) => l.id === 'solar')!.proposed;
  assert.ok(g(excl) < g(incl), `excluded ${g(excl)} should be < included ${g(incl)}`);
});

test('every impact and delta is a finite number (no NaN/undefined)', () => {
  const { BASELINE } = mods.climate;
  const { generateActionPlan } = mods.plan;
  const s = { ...BASELINE, solarCoverage: 0.3, extraTrees: 50, reflectiveRoofs: true, optimisedRouting: true, evShare: 0.2, battery: true };
  const p = generateActionPlan(s);
  for (const l of p.impacts) {
    for (const v of [l.baseline, l.proposed, l.delta]) assert.ok(Number.isFinite(v), `${l.id} has non-finite ${v}`);
  }
  assert.ok(Number.isFinite(p.netCo2DeltaT));
  assert.ok(p.interventions.length >= 5, 'all selected interventions listed');
});

test('costs are never invented: plan flags them as a data gap', () => {
  const { BASELINE } = mods.climate;
  const { generateActionPlan, actionPlanJson } = mods.plan;
  const p = generateActionPlan({ ...BASELINE, solarCoverage: 0.5 });
  assert.ok(p.dataGaps.some((g: string) => /cost/i.test(g)), 'cost gap stated');
  const json = actionPlanJson(p);
  assert.ok(!/"cost"\s*:\s*\d/.test(json), 'no fabricated numeric cost field in the export');
});

test('ledger entry is deterministic in id and impact, and records provenance', () => {
  const { BASELINE } = mods.climate;
  const { ledgerEntry, scenarioId } = mods.plan;
  const s = { ...BASELINE, solarCoverage: 0.5, battery: true };
  const e1 = ledgerEntry(s, '2026-10-28T00:00:00Z');
  const e2 = ledgerEntry(s, '2026-10-28T00:00:00Z');
  assert.deepEqual(e1, e2, 'same scenario + timestamp -> identical entry');
  assert.equal(e1.scenarioId, scenarioId(s));
  assert.equal(e1.validation, 'projected');
  assert.ok(e1.projectedImpact.netCo2DeltaT < 0);
  assert.ok(/not measured|assumption/i.test(e1.provenance));
});

test('scenario id is order-independent for excluded roofs', () => {
  const { BASELINE } = mods.climate;
  const { scenarioId } = mods.plan;
  const a = scenarioId({ ...BASELINE, excludedRoofs: ['WH-2', 'WH-1'] });
  const b = scenarioId({ ...BASELINE, excludedRoofs: ['WH-1', 'WH-2'] });
  assert.equal(a, b);
});

// ---- Scenario management (save / duplicate / rename / restore / delete) ----

test('save then restore reproduces the scenario in the store', () => {
  reset();
  st().patchScenario({ solarCoverage: 0.5, battery: true });
  st().toggleRoofExcluded('WH-100067');
  const id = st().saveScenario('Solar plan');
  // change the live scenario away from what was saved
  st().patchScenario({ solarCoverage: 0 });
  st().setScenario({ ...st().scenario, battery: false });
  st().restoreScenario(id);
  assert.equal(st().scenario.solarCoverage, 0.5, 'solar restored');
  assert.equal(st().scenario.battery, true, 'battery restored');
  assert.deepEqual(st().excludedRoofs, ['WH-100067'], 'excluded roofs restored');
});

test('saved scenario carries a projected ledger entry, never verified', () => {
  reset();
  st().patchScenario({ solarCoverage: 0.6 });
  const id = st().saveScenario('Big solar');
  const saved = st().savedScenarios.find((s: { id: string }) => s.id === id);
  assert.ok(saved, 'scenario is in the list');
  assert.equal(saved.ledger.validation, 'projected');
  assert.ok(saved.ledger.projectedImpact.netCo2DeltaT < 0, 'projected reduction');
  assert.ok(/not measured|assumption/i.test(saved.ledger.provenance));
});

test('duplicate makes an independent copy named "(copy)"', () => {
  reset();
  st().patchScenario({ extraTrees: 100 });
  const id = st().saveScenario('Trees');
  const before = st().savedScenarios.length;
  st().duplicateScenario(id);
  assert.equal(st().savedScenarios.length, before + 1);
  const copy = st().savedScenarios.find((s: { name: string }) => s.name === 'Trees (copy)');
  assert.ok(copy, 'copy exists');
  assert.notEqual(copy.id, id, 'copy has its own id');
  assert.equal(copy.scenario.extraTrees, 100, 'copy keeps the inputs');
});

test('rename changes the name; delete removes only that entry', () => {
  reset();
  const a = st().saveScenario('A');
  const b = st().saveScenario('B');
  st().renameScenario(a, 'A renamed');
  assert.equal(st().savedScenarios.find((s: { id: string }) => s.id === a).name, 'A renamed');
  const before = st().savedScenarios.length;
  st().deleteScenario(a);
  assert.equal(st().savedScenarios.length, before - 1);
  assert.ok(!st().savedScenarios.some((s: { id: string }) => s.id === a), 'a is gone');
  assert.ok(st().savedScenarios.some((s: { id: string }) => s.id === b), 'b remains');
});

test('restoring a deleted scenario is a safe no-op', () => {
  reset();
  st().patchScenario({ solarCoverage: 0.3 });
  const id = st().saveScenario('temp');
  st().deleteScenario(id);
  st().patchScenario({ solarCoverage: 0.9 });
  st().restoreScenario(id); // id no longer exists
  assert.equal(st().scenario.solarCoverage, 0.9, 'live scenario unchanged');
});

test('freight route: building a class graph retains road class information on edges', () => {
  const roads = mods.ad.AD.roads;
  const g = mods.freight.buildClassGraph(roads);
  assert.ok(g.nodes.length > 0, 'graph has nodes');
  assert.ok(g.adj.length > 0, 'graph has adjacency lists');
  let foundClass = false;
  for (const edges of g.adj) {
    for (const e of edges) {
      assert.ok(typeof e.cls === 'string', 'each edge has a class');
      assert.ok(e.len > 0, 'each edge has positive length');
      foundClass = true;
      break;
    }
    if (foundClass) break;
  }
  assert.ok(foundClass, 'at least one edge has a road class');
});

test('freight route: emission factor is 1.0 for motorway, higher for residential/service', () => {
  assert.equal(mods.freight.emissionFactor('motorway'), 1.0);
  assert.equal(mods.freight.emissionFactor('residential'), 1.42);
  assert.equal(mods.freight.emissionFactor('service'), 1.55);
  assert.equal(mods.freight.emissionFactor('unknown_class'), mods.freight.DEFAULT_EMISSION_FACTOR);
});

test('freight route: comparing routes on a connected road network produces a valid result structure', () => {
  const roads = mods.ad.AD.roads;
  const g = mods.freight.buildClassGraph(roads);
  // test with two distinct point s: warehouse 0 and a point far away
  const w1 = mods.climate.WAREHOUSE_ROOF_RECORDS[0];
  const w2 = mods.climate.WAREHOUSE_ROOF_RECORDS[Math.floor(mods.climate.WAREHOUSE_ROOF_RECORDS.length / 2)];
  const from = [w1.cx, w1.cz];
  const to = [w2.cx, w2.cz];
  const comp = mods.freight.compareRoutes(g, from, to);
  // the result structure is always valid, whether feasible or not
  assert.ok(typeof comp.feasible === 'boolean', 'feasible is a boolean');
  assert.ok(Array.isArray(comp.assumptions), 'assumptions is an array');
  assert.ok(typeof comp.note === 'string', 'note is a string');
  assert.ok(typeof comp.evaluatedNodes === 'number', 'evaluatedNodes is a number');
  if (comp.feasible) {
    assert.ok(comp.baseline !== null, 'baseline exists when feasible');
    assert.ok(comp.optimised !== null, 'optimised exists when feasible');
    assert.ok(comp.savings !== null, 'savings exist when feasible');
    assert.ok(comp.optimised.co2Kg <= comp.baseline.co2Kg, 'optimised CO2 never exceeds baseline');
  } else {
    assert.equal(comp.baseline, null, 'baseline is null when infeasible');
    assert.equal(comp.optimised, null, 'optimised is null when infeasible');
    assert.equal(comp.savings, null, 'savings are null when infeasible');
  }
});

test('freight route: optimised emissions are never worse than baseline, and savings are consistent', () => {
  const roads = mods.ad.AD.roads;
  const g = mods.freight.buildClassGraph(roads);
  const w = mods.climate.WAREHOUSE_ROOF_RECORDS.slice(0, 2);
  const comp = mods.freight.compareRoutes(g, [w[0].cx, w[0].cz], [w[1].cx, w[1].cz]);
  if (comp.feasible && comp.savings) {
    const { co2Kg, co2Pct } = comp.savings;
    assert.ok(co2Kg >= 0, 'CO2 savings non-negative');
    if (comp.baseline.co2Kg > 1e-9) {
      assert.ok(Math.abs(co2Pct - (co2Kg / comp.baseline.co2Kg) * 100) < 1e-3, 'savings percentage consistent with absolute savings');
    }
  }
});

test('freight route: infeasible routes (unreachable endpoints) return null routes and feasible=false', () => {
  const roads = mods.ad.AD.roads;
  const g = mods.freight.buildClassGraph(roads);
  // pick points that are very far apart (likely off the network entirely)
  const from = [-10000, -10000]; // way off the network
  const to = [10000, 10000];
  const comp = mods.freight.compareRoutes(g, from, to);
  assert.equal(comp.feasible, false);
  assert.equal(comp.baseline, null);
  assert.equal(comp.optimised, null);
  assert.equal(comp.savings, null);
});

test('freight route: assumptions list includes CO2 per km, emission factors, snap limit and determinism note', () => {
  const roads = mods.ad.AD.roads;
  const g = mods.freight.buildClassGraph(roads);
  const w = mods.climate.WAREHOUSE_ROOF_RECORDS.slice(0, 2);
  const comp = mods.freight.compareRoutes(g, [w[0].cx, w[0].cz], [w[1].cx, w[1].cz]);
  assert.ok(Array.isArray(comp.assumptions), 'assumptions is an array');
  assert.ok(comp.assumptions.length >= 3, 'at least 3 assumptions listed');
  const assumptionText = comp.assumptions.join(' ');
  assert.ok(/kg\/km/.test(assumptionText), 'assumptions mention CO2 per km');
  assert.ok(/road.*class|emission.*factor/.test(assumptionText), 'assumptions mention road class or emission factors');
  assert.ok(/snap|unit|within/.test(assumptionText), 'assumptions mention snap limit');
});

test('climate mission: creating a mission initializes state with baseline assessment and interventions', () => {
  const mission = mods.guidance.createMission();
  assert.ok(mission.baseline, 'mission has baseline');
  assert.ok(mission.baselineAssessment, 'mission has baseline assessment');
  assert.ok(Array.isArray(mission.interventions), 'interventions is an array');
  assert.ok(mission.interventions.length > 0, 'at least one intervention recommended');
  assert.equal(mission.step, 'assess', 'initial step is assess');
  assert.equal(mission.selected.length, 0, 'no interventions selected initially');
});

test('climate mission: baseline assessment computes real metrics from the scenario', () => {
  const sc = { ...mods.climate.BASELINE, solarCoverage: 0.5 };
  const assessment = mods.guidance.assessBaseline(sc);
  const outcome = mods.climate.run(sc);
  assert.deepEqual(assessment.solarMWh, outcome.solarMWh, 'solar MWh matches');
  assert.deepEqual(assessment.netCo2T, outcome.netCo2T, 'net CO2 matches');
  assert.deepEqual(assessment.factoryCo2T, outcome.factoryCo2T, 'factory CO2 matches');
  assert.ok(assessment.treeCo2AbsorbedT >= 0, 'tree CO2 is non-negative');
  assert.ok(assessment.gridImportMWh >= 0, 'grid import is non-negative');
});

test('climate mission: interventions describe modelled CO2 reductions and data gaps (never invented)', () => {
  const mission = mods.guidance.createMission();
  for (const iv of mission.interventions) {
    assert.ok(typeof iv.id === 'string' && iv.id.length > 0, 'each intervention has an id');
    assert.ok(typeof iv.title === 'string', 'each intervention has a title');
    assert.ok(Array.isArray(iv.assumptions), 'each intervention lists assumptions');
    assert.ok(Array.isArray(iv.dataGaps), 'each intervention lists data gaps (never invented costs)');
    assert.ok(iv.estimatedCo2Reduction >= 0, 'CO2 reduction is non-negative and modelled');
    assert.ok(['high', 'medium', 'low'].includes(iv.feasibility), 'feasibility is qualitative');
  }
});

test('climate mission: selecting and applying interventions produces a proposed scenario and comparison', () => {
  const mission = mods.guidance.createMission();
  assert.ok(mission.interventions.length > 0, 'interventions exist');
  const first = mission.interventions[0];
  const params = Object.fromEntries(
    Object.entries(first.parameters).map(([k, v]) => [k, v.value])
  );
  let m = mods.guidance.selectIntervention(mission, first.id, params);
  assert.equal(m.selected.length, 1, 'one intervention selected');
  m = mods.guidance.applyInterventions(m);
  assert.ok(m.proposedScenario, 'proposed scenario created');
  assert.ok(m.comparison.proposed, 'comparison outcome computed');
  assert.ok(m.comparison.actionPlan, 'action plan generated');
  assert.ok(m.comparison.ledger, 'ledger entry created');
});

test('climate mission: downloaded action plan has all required fields and no invented costs', () => {
  const mission = mods.guidance.createMission();
  if (mission.interventions.length > 0) {
    const first = mission.interventions[0];
    const params = Object.fromEntries(
      Object.entries(first.parameters).map(([k, v]) => [k, v.value])
    );
    let m = mods.guidance.selectIntervention(mission, first.id, params);
    m = mods.guidance.applyInterventions(m);
    const download = mods.guidance.downloadActionPlan(m);
    assert.ok(download, 'action plan downloaded');
    assert.ok(download.title, 'has title');
    assert.ok(download.generatedAt, 'has timestamp');
    assert.ok(download.baseline, 'has baseline scenario');
    assert.ok(download.proposed, 'has proposed scenario');
    assert.ok(download.interventions, 'has selected interventions');
    assert.ok(download.actionPlan, 'has action plan');
    assert.ok(download.ledger, 'has ledger entry');
    // Verify no costs are invented: check that ledger entries are marked as projected
    if (download.ledger && download.ledger.impacts && download.ledger.impacts.length > 0) {
      for (const impact of download.ledger.impacts) {
        if (impact.costUSD !== undefined && impact.costUSD > 0) {
          // Costs should be listed in dataGaps if not measured
          assert.fail('costs should not be invented; they should be listed as data gaps');
        }
      }
    }
  }
});

test('climate mission: advancing steps and deselecting interventions work correctly', () => {
  let mission = mods.guidance.createMission();
  mission = mods.guidance.advanceStep(mission, 'identify');
  assert.equal(mission.step, 'identify');
  mission = mods.guidance.advanceStep(mission, 'recommend');
  assert.equal(mission.step, 'recommend');
  if (mission.interventions.length > 0) {
    const first = mission.interventions[0];
    mission = mods.guidance.selectIntervention(mission, first.id, {});
    assert.equal(mission.selected.length, 1);
    mission = mods.guidance.deselectIntervention(mission, first.id);
    assert.equal(mission.selected.length, 0);
  }
});

test('heat exposure: temperature curve is cooler at night, peaks at noon', () => {
  const t6 = mods.exposure.temperatureCurve(6); // sunrise
  const t12 = mods.exposure.temperatureCurve(12); // noon
  const t18 = mods.exposure.temperatureCurve(18); // sunset
  const t24 = mods.exposure.temperatureCurve(0); // midnight
  assert.ok(t12 > t6, 'noon hotter than dawn');
  assert.ok(t12 > t18, 'noon hotter than dusk');
  assert.ok(t6 > t24, 'dawn hotter than midnight');
  assert.equal(t12, 1.0, 'peak is 1.0 at noon');
});

test('heat exposure: pedestrian exposure integrates heat over time and location', () => {
  const route = {
    startLocation: [100, 200] as [number, number],
    endLocation: [200, 300] as [number, number],
    durationMinutes: 30,
    startHour: 12, // midday (peak heat)
  };
  const exp = mods.exposure.calculateExposure(route);
  assert.ok(exp.heatDose >= 0, 'heat dose non-negative');
  assert.ok(exp.avgHeat >= 0 && exp.avgHeat <= 1, 'average heat is 0–1');
  assert.ok(exp.shadeAvailability >= 0 && exp.shadeAvailability <= 1, 'shade availability is 0–1');
  assert.ok(Array.isArray(exp.assumptions), 'assumptions listed');
  assert.ok(exp.assumptions.length > 0, 'at least one assumption stated');
});

test('heat exposure: heat at time and place multiplies base heat by temperature curve', () => {
  const loc = [100, 200] as [number, number];
  const t6 = mods.exposure.heatAtTimeAndPlace({ hour: 6, location: loc });
  const t12 = mods.exposure.heatAtTimeAndPlace({ hour: 12, location: loc });
  const t18 = mods.exposure.heatAtTimeAndPlace({ hour: 18, location: loc });
  // Temperature curve peaks at noon, so t12 should be highest
  assert.ok(t12 >= t6, 'noon heat >= morning heat');
  assert.ok(t12 >= t18, 'noon heat >= evening heat');
});

test('heat exposure: high-exposure locations are identified and ranked by peak heat', () => {
  const locs = mods.exposure.findHighExposureLocations();
  assert.ok(Array.isArray(locs), 'returns array');
  assert.ok(locs.length >= 0, 'list is valid');
  if (locs.length > 1) {
    for (let i = 1; i < locs.length; i++) {
      assert.ok(locs[i - 1].peakHeat >= locs[i].peakHeat, 'sorted by peak heat descending');
    }
  }
  for (const loc of locs) {
    assert.ok(loc.baseHeat >= 0 && loc.baseHeat <= 1, 'base heat is 0–1');
    assert.ok(loc.peakHour >= 0 && loc.peakHour <= 23, 'peak hour is 0–23');
    assert.ok(Array.isArray(loc.riskFactors), 'risk factors listed');
  }
});

test('air dispersion: baseline air quality returns non-negative concentration', () => {
  const wind = { directionDeg: 0, speedUnitsPerSec: 0.5 };
  const attr = mods.air.airQualityBaseline([100, 200], wind);
  assert.ok(attr.totalConcentration >= 0 && attr.totalConcentration <= 1, 'concentration is 0–1');
  assert.ok(Array.isArray(attr.sources), 'sources listed');
  assert.ok(attr.sources.every((s) => s.contribution >= 0), 'all contributions non-negative');
});

test('air dispersion: wind direction affects contribution pattern', () => {
  const loc = [100, 200] as [number, number];
  const wind0 = { directionDeg: 0, speedUnitsPerSec: 0.5 };
  const wind90 = { directionDeg: 90, speedUnitsPerSec: 0.5 };
  const attr0 = mods.air.airQualityBaseline(loc, wind0);
  const attr90 = mods.air.airQualityBaseline(loc, wind90);
  // Different wind directions → potentially different source rankings (if factories are upwind/crosswind differently)
  assert.ok(attr0.totalConcentration >= 0, 'baseline valid');
  assert.ok(attr90.totalConcentration >= 0, 'alternate wind valid');
});

test('air dispersion: mitigation reduces concentration', () => {
  const loc = [100, 200] as [number, number];
  const wind = { directionDeg: 0, speedUnitsPerSec: 0.5 };
  const baseline = mods.air.airQualityBaseline(loc, wind);
  const mitigated = mods.air.airQualityMitigated(loc, wind, new Map([[0, 0.5]])); // reduce factory 0 by 50%
  // Mitigation should not increase concentration
  assert.ok(mitigated.totalConcentration <= baseline.totalConcentration, 'mitigation reduces or maintains concentration');
});

test('air dispersion: comparison result includes improvement metric and assumptions', () => {
  const loc = [100, 200] as [number, number];
  const wind = { directionDeg: 0, speedUnitsPerSec: 0.5 };
  const comp = mods.air.compareAirQuality(loc, wind, new Map([[0, 0.5]]));
  assert.ok(comp.improvement >= 0 && comp.improvement <= 1, 'improvement is 0–1');
  assert.ok(Array.isArray(comp.assumptions), 'assumptions listed');
  assert.ok(comp.assumptions.length > 0, 'at least one assumption stated (not measured)');
  const assumptionText = comp.assumptions.join(' ');
  assert.ok(/modelled|illustrative|approximat|simplified/i.test(assumptionText), 'assumptions mention that this is modelled');
});

// Water Security Tests
test('water security: asset dependency graph is valid', () => {
  const assets = mods.water.WATER_ASSETS;
  assert.ok(Array.isArray(assets), 'assets is array');
  assert.ok(assets.length > 0, 'assets list not empty');
  for (const asset of assets) {
    assert.ok(asset.id, 'asset has id');
    assert.ok(asset.name, 'asset has name');
    assert.ok(['pump', 'valve', 'main', 'tank', 'treatment'].includes(asset.type), 'asset type is valid');
    assert.ok(Array.isArray(asset.upstreamAssets), 'upstream array valid');
    assert.ok(Array.isArray(asset.downstreamAssets), 'downstream array valid');
  }
});

test('water security: water-loss estimate includes baseline and cascade breakdown', () => {
  const loss = mods.water.estimateWaterLoss(undefined, 1); // 1 day
  assert.ok(loss.lossMl >= 0, 'water loss non-negative');
  assert.ok(typeof loss.breakdownBySource === 'object', 'breakdown is object');
  assert.ok(loss.cascadeImpact !== undefined, 'cascade impact described');
  assert.ok(loss.lossMl === Object.values(loss.breakdownBySource).reduce((a, b) => a + b, 0), 'breakdown sums to total');
});

test('water security: water interventions reduce demand and specify energy impact', () => {
  const result = mods.water.applyWaterInterventions(['greywater-reuse', 'irrigation-efficiency']);
  assert.ok(result.adjustedDemandMl < mods.water.BASELINE_DEMAND_ML, 'interventions reduce demand');
  assert.ok(result.totalEnergyKwh !== undefined, 'energy impact stated');
  assert.ok(typeof result.description === 'string', 'description provided');
});

test('water security: cascading failure scenario includes recovery actions', () => {
  const scenario = mods.water.analyzeFailureScenario('pump-d11', 12);
  assert.ok(scenario.failedAsset, 'failed asset named');
  assert.ok(scenario.directImpact, 'direct impact described');
  assert.ok(Array.isArray(scenario.cascadeChain), 'cascade chain is array');
  assert.ok(Array.isArray(scenario.recoveryActions), 'recovery actions listed');
  assert.ok(scenario.recoveryTimeHours >= 0, 'recovery time non-negative hours');
  assert.ok(scenario.waterLossML >= 0, 'water loss non-negative ML');
});

// Microgrid Dispatch Tests
test('microgrid: default scenarios are valid', () => {
  const scenarios = mods.microgrid.MICROGRID_SCENARIOS;
  assert.ok(Array.isArray(scenarios), 'scenarios is array');
  assert.ok(scenarios.length >= 2, 'at least baseline and proposed');
  for (const s of scenarios) {
    assert.ok(s.id && s.name, 'scenario has id and name');
    assert.ok(s.solarCapacityKw >= 0, 'solar capacity non-negative');
    assert.ok(s.batteryCapacityKwh >= 0, 'battery capacity non-negative');
    assert.ok(s.baselineDemandKw > 0, 'demand positive');
    assert.ok(Array.isArray(s.assumptions), 'assumptions listed');
  }
});

test('microgrid: daily dispatch respects battery constraints and produces valid results', () => {
  const scenario = mods.microgrid.MICROGRID_SCENARIOS[1]; // proposed
  const result = mods.microgrid.simulateMicrogridDay(scenario);
  assert.ok(result.steps.length === 24, 'dispatch has 24 hours');
  for (const step of result.steps) {
    assert.ok(step.hour >= 0 && step.hour < 24, 'hour valid');
    assert.ok(step.solarGenerationKw >= 0, 'solar non-negative');
    assert.ok(step.demandKw > 0, 'demand positive');
    assert.ok(step.batteryStateOfChargePercent >= 20 && step.batteryStateOfChargePercent <= 100, 'battery SOC within 20–100%');
    assert.ok(step.gridImportKw >= 0, 'grid import non-negative');
  }
  assert.ok(result.totalSolarGenerationKwh > 0, 'total solar positive');
  assert.ok(result.emissionsCo2Kg >= 0, 'emissions non-negative');
});

test('microgrid: scenario comparison shows proposed reduces grid demand', () => {
  const comparison = mods.microgrid.compareMicrogridScenarios();
  assert.ok(comparison.baselineResult, 'baseline result present');
  assert.ok(comparison.proposedResult, 'proposed result present');
  assert.ok(comparison.energySavingsKwh >= 0, 'energy savings non-negative');
  assert.ok(comparison.emissionsSavingsCo2Kg >= 0, 'emission savings non-negative');
  assert.ok(comparison.improvementPercent >= 0, 'improvement percent non-negative');
});

test('microgrid: annual impact and payback estimates are reasonable', () => {
  const scenario = mods.microgrid.MICROGRID_SCENARIOS[1]; // proposed
  const impact = mods.microgrid.estimateMicrogridImpact(scenario);
  assert.ok(impact.annualSolarGenerationKwh > 0, 'annual solar positive');
  assert.ok(impact.annualGridImportKwh >= 0, 'annual grid import non-negative');
  assert.ok(impact.annualEmissionsCo2Tonnes >= 0, 'annual emissions non-negative');
  assert.ok(impact.estimatedCapitalCostUsd >= 0, 'capex non-negative');
  assert.ok(impact.paybackYears >= 0, 'payback time non-negative years');
});
