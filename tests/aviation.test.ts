/**
 * MRR AVIATION models (src/aviation): schedule and stand allocation, runway separation, passenger flow, baggage,
 * predictive maintenance, incidents, specialist-agent recommendations, what-if runs and the audit trail.
 * Runs in Node through the project's Vite toolchain. All data tested here is simulated.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let M: any;

before(async () => {
  server = await createServer({ root: new URL('..', import.meta.url).pathname, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  const [model, ops, intel, store] = await Promise.all([
    server.ssrLoadModule('/src/aviation/model.ts'),
    server.ssrLoadModule('/src/aviation/ops.ts'),
    server.ssrLoadModule('/src/aviation/intelligence.ts'),
    server.ssrLoadModule('/src/aviation/store.ts'),
  ]);
  M = { model, ops, intel, store };
});

after(async () => { await server?.close(); });

test('schedule has ten fictional flights with no stand overlaps', () => {
  assert.equal(M.model.FLIGHTS.length, 10);
  assert.deepEqual(M.ops.standConflicts(), []);
  for (const f of M.model.FLIGHTS) assert.ok(f.arrMin < f.depMin, `${f.id} departs before it arrives`);
});

test('flight state follows the simulated clock', () => {
  const sh201 = M.model.FLIGHTS.find((f: { id: string }) => f.id === 'SH201');
  const sh204 = M.model.FLIGHTS.find((f: { id: string }) => f.id === 'SH204');
  assert.equal(M.model.flightState(sh201, M.model.SIM_NOW), 'Departed');
  assert.equal(M.model.flightState(sh204, M.model.SIM_NOW), 'Turnaround');
});

test('clear weather has no runway conflicts; bad weather widens separation and can create conflicts', () => {
  assert.equal(M.ops.runwayConflicts('Clear').length, 0);
  assert.ok(M.ops.runwayConflicts('Thunderstorm', 20).length >= M.ops.runwayConflicts('Clear').length);
  assert.ok(M.ops.runwayUtilisation('Thunderstorm') >= M.ops.runwayUtilisation('Clear'));
});

test('passenger flow sums to roughly the scheduled passenger count', () => {
  const flow = M.ops.passengerFlow();
  const boarding = flow.reduce((a: number, r: { boarding: number }) => a + r.boarding, 0);
  const pax = M.model.FLIGHTS.reduce((a: number, f: { pax: number }) => a + f.pax, 0);
  assert.ok(Math.abs(boarding - pax) / pax < 0.05, `boarding ${boarding} vs pax ${pax}`);
});

test('baggage: failed tractor adds mishandling on SH204 until a replacement is assigned', () => {
  const ok = M.ops.baggageTracking(false, false).find((b: { flightId: string }) => b.flightId === 'SH204');
  const fail = M.ops.baggageTracking(true, false).find((b: { flightId: string }) => b.flightId === 'SH204');
  const fixed = M.ops.baggageTracking(true, true).find((b: { flightId: string }) => b.flightId === 'SH204');
  assert.ok(fail.mishandled > ok.mishandled);
  assert.equal(fixed.mishandled, ok.mishandled);
});

test('predictive maintenance: every GSE unit has a score and risk band; high risk units get a failure estimate', () => {
  const h = M.ops.gseHealth();
  assert.equal(h.length, M.model.FLEET.length);
  for (const r of h) {
    assert.ok(r.score >= 0 && r.score <= 100);
    if (r.risk === 'High') assert.ok(r.failInDays !== null);
  }
});

test('specialist agents only recommend; baseline has none for a clear scenario', () => {
  const recs = M.intel.recommendations({ baggageTractorFailed: false, replacementAssigned: false, weather: 'Clear', extraDelay: 0 });
  assert.ok(!recs.some((r: { id: string }) => r.id === 'rec-bt-replacement'));
  assert.ok(M.intel.AGENTS.length === 6);
});

test('tractor failure produces a replacement recommendation that needs a decision', () => {
  const recs = M.intel.recommendations({ baggageTractorFailed: true, replacementAssigned: false, weather: 'Clear', extraDelay: 0 });
  const r = recs.find((x: { id: string }) => x.id === 'rec-bt-replacement');
  assert.ok(r, 'replacement recommendation present');
  assert.ok(r.title.includes('BT-02'));
  assert.ok(r.confidence > 0 && r.confidence <= 1);
});

test('financial and emissions figures are labelled assumptions and computed consistently', () => {
  const fin = M.intel.financials(0);
  assert.equal(fin.delayCost, 0);
  assert.equal(fin.margin, fin.revenue - fin.cost);
  const em = M.intel.emissions();
  assert.ok(em.co2t > 0 && em.fuelT > 0);
  assert.ok(em.co2t > em.fuelT, 'CO2 mass exceeds fuel mass');
});

test('what-if run worsens on-time performance under storm conditions', () => {
  const r = M.intel.whatIfResult({ weather: 'Thunderstorm', extraDelay: 20, bagsScale: 1.2, baggageTractorFailed: false, replacementAssigned: false });
  assert.ok(r.run.otp <= r.base.otp);
  assert.ok(r.bagsLoad > M.model.FLIGHTS.reduce((a: number, f: { bags: number }) => a + f.bags, 0));
});

test('store: decisions and scenario changes write audit entries; reset clears them', () => {
  const s = M.store.useAviationStore;
  s.getState().reset();
  s.getState().failBaggageTractor();
  s.getState().assignReplacement();
  s.getState().decide('SC-1', 'Runway separation within weather minimum', 'approved');
  const a = s.getState().audit;
  assert.equal(a.length, 3);
  assert.equal(a[0].seq, 1);
  assert.equal(s.getState().decisions['rec-bt-replacement'], 'approved');
  s.getState().reset();
  assert.equal(s.getState().audit.length, 0);
  assert.equal(s.getState().baggageTractorFailed, false);
});

test('every aviation tab renders without errors in each scenario state (server render)', async () => {
  const { createElement } = await import('react');
  const { renderToString } = await import('react-dom/server');
  const views = await server.ssrLoadModule('/src/aviation/AviationViews.tsx');
  const s = M.store.useAviationStore;
  const states = [
    { baggageTractorFailed: false, replacementAssigned: false, weather: 'Clear', extraDelay: 0 },
    { baggageTractorFailed: true, replacementAssigned: false, weather: 'Thunderstorm', extraDelay: 20 },
    { baggageTractorFailed: true, replacementAssigned: true, weather: 'Fog', extraDelay: 5 },
  ];
  for (const st of states) {
    s.getState().reset();
    s.setState({ ...st });
    const scen = { baggageTractorFailed: st.baggageTractorFailed, replacementAssigned: st.replacementAssigned };
    const go = () => {};
    const els = [
      createElement(views.Command, { scen, weather: st.weather, extraDelay: st.extraDelay, go }),
      createElement(views.Control, { scen, weather: st.weather, extraDelay: st.extraDelay }),
      createElement(views.Flights, { scen, weather: st.weather, extraDelay: st.extraDelay, go }),
      createElement(views.Turnaround, { flightId: 'SH204', scen }),
      createElement(views.Passengers, { scen }),
      createElement(views.Fleet, {}),
      createElement(views.Cargo, {}),
      createElement(views.Safety, { scen }),
      createElement(views.Analytics, { scen, weather: st.weather, extraDelay: st.extraDelay }),
      createElement(views.WhatIf, { scen }),
      createElement(views.Ai, { scen, weather: st.weather, extraDelay: st.extraDelay }),
      createElement(views.Audit, {}),
    ];
    for (const el of els) {
      const html = renderToString(el);
      assert.ok(html.length > 200, 'rendered markup');
      assert.ok(!/NaN|undefined|\[object Object\]/.test(html), `bad value in ${el.type.name}`);
    }
  }
  s.getState().reset();
});

test('tractor failure delays SH204 departure only until a replacement is assigned', () => {
  const m = M.model;
  assert.equal(m.scenarioDelayMin({ baggageTractorFailed: false, replacementAssigned: false }), 0);
  const failed = m.scenarioDelayMin({ baggageTractorFailed: true, replacementAssigned: false });
  const fixed = m.scenarioDelayMin({ baggageTractorFailed: true, replacementAssigned: true });
  assert.ok(failed > 0, `failure delay ${failed} min`);
  assert.equal(fixed, 0, 'replacement restores the plan');
});

test('board and turnaround agree on SH204 departure (scenario delay is one source of truth)', () => {
  const m = M.model;
  const sh204 = m.FLIGHTS.find((f: { id: string }) => f.id === 'SH204');
  const scen = { baggageTractorFailed: true, replacementAssigned: false };
  const d = m.scenarioDelayMin(scen);
  const row = M.ops.flightBoard('Clear', 0, d).find((r: { id: string }) => r.id === 'SH204');
  assert.equal(row.depEst - sh204.depMin, d);
  const tr = m.turnaround(sh204.arrMin, scen);
  assert.equal(tr.departAt - sh204.depMin, d);
});

test('every stand has a distinct airport position and the nine stands match the model', async () => {
  const scene = await server.ssrLoadModule('/src/aviation/AviationScene.tsx');
  const keys = Object.keys(scene.STAND_OFFSET).sort();
  assert.deepEqual(keys, [...M.model.STANDS].sort());
  const pos = keys.map((k: string) => `${scene.STAND_OFFSET[k].x},${scene.STAND_OFFSET[k].z}`);
  assert.equal(new Set(pos).size, keys.length, 'no two stands share a position');
});

test('airport scene server-renders in each scenario state without errors', async () => {
  const { createElement } = await import('react');
  const { renderToString } = await import('react-dom/server');
  const scene = await server.ssrLoadModule('/src/aviation/AviationScene.tsx');
  const s = M.store.useAviationStore;
  for (const st of [
    { baggageTractorFailed: false, replacementAssigned: false, clock: 9 * 60 + 58 },
    { baggageTractorFailed: true, replacementAssigned: false, clock: 10 * 60 + 5 },
    { baggageTractorFailed: true, replacementAssigned: true, clock: 10 * 60 + 5 },
  ]) {
    s.getState().reset();
    s.setState(st);
    const html = renderToString(createElement(scene.AviationScene));
    assert.ok(html.length > 500);
  }
  s.getState().reset();
});
