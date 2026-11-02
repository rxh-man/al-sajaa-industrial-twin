/**
 * PARKNEX: multi-facility occupancy, bay and sensor states, revenue, tenant release, events, maintenance,
 * construction cost, ROI/payback, approval criteria, scenarios, the Parking Intelligence agent and the
 * dashboard ↔ 3D state link. Run in Node through the project's Vite toolchain.
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
  const [model, store, answers, runtime, spatial, dev, infill] = await Promise.all([
    server.ssrLoadModule('/src/parknex/model.ts'),
    server.ssrLoadModule('/src/parknex/store.ts'),
    server.ssrLoadModule('/src/parknex/answers.ts'),
    server.ssrLoadModule('/src/opsAgent/runtime.ts'),
    server.ssrLoadModule('/src/data/spatial.ts'),
    server.ssrLoadModule('/src/sustainability/development.ts'),
    server.ssrLoadModule('/src/data/infill.ts'),
  ]);
  M = { model, store, answers, runtime, spatial, dev, infill };
});
after(async () => {
  await server?.close();
});

const ops = (o = {}) => ({ ...M.model.BASE_OPS, maintenance: new Set(), ...o });

test('six named facilities on clear, separate land; bays on their own lot', () => {
  const F = M.model.FACILITIES;
  assert.equal(F.length, 6);
  assert.deepEqual(F.map((f: { name: string }) => f.name), ['PARKNEX Central', 'PARKNEX Business District', 'PARKNEX Residential Hub', 'PARKNEX Event Arena', 'PARKNEX Commercial Zone', 'PARKNEX EV & Premium Parking']);
  for (const f of F) {
    for (const b of f.bays.filter((_: unknown, i: number) => i % 9 === 0)) {
      assert.ok(Math.abs(b.x - f.site.x) <= f.site.w / 2 && Math.abs(b.z - f.site.z) <= f.site.d / 2, 'bay inside the lot');
      assert.ok(M.spatial.kerbDistance(b.x, b.z, 2) > 0, 'bay off the carriageway');
      assert.equal(M.spatial.inBuilding(b.x, b.z, 0), false);
    }
    for (const g of F) if (g !== f) assert.ok(Math.abs(g.site.x - f.site.x) >= (g.site.w + f.site.w) / 2 || Math.abs(g.site.z - f.site.z) >= (g.site.d + f.site.d) / 2);
    for (const n of M.infill.INFILL) assert.ok(Math.abs(n.x - f.site.x) >= (n.w + f.site.w) / 2 || Math.abs(n.z - f.site.z) >= (n.d + f.site.d) / 2, 'clear of the infill buildings');
  }
  assert.equal(new Set(M.model.ALL_BAYS.map((b: { id: string }) => b.id)).size, M.model.ALL_BAYS.length, 'unique bay ids');
});

test('city totals are the sum of facilities and internally consistent; deterministic', () => {
  const k = M.model.cityKpis(ops());
  const sum = (key: string) => k.per.reduce((a: number, p: Record<string, number>) => a + p[key], 0);
  for (const key of ['capacity', 'occupied', 'available', 'reserved', 'revenueToday']) assert.ok(Math.abs(k[key] - sum(key)) < 1e-6, key);
  for (const p of k.per) {
    assert.ok(p.occupied + p.available + p.reserved + p.maintenance <= p.capacity + 1e-9, `${p.id} states fit capacity`);
    assert.ok(p.paidOccupied <= p.occupied);
    assert.ok(p.revenueToday <= p.forecastDay + 1e-6);
    assert.ok(p.occupancy >= 0 && p.occupancy <= 1);
  }
  assert.deepEqual(M.model.cityKpis(ops()), k);
  assert.ok(k.sensorsOffline > 0 && k.sensorsOk > k.sensorsOffline, 'some sensors offline, most fine');
});

test('bay status follows the time of day: business fills by day, residential by night', () => {
  const occ = (id: string, hour: number) => M.model.facilityKpis(M.model.facilityById(id), ops({ hour })).occupancy;
  assert.ok(occ('business', 11) > occ('business', 3));
  assert.ok(occ('residential', 2) > occ('residential', 11) * 0.9);
  // each bay has exactly one of the six states
  const states = new Set(['available', 'occupied', 'reserved', 'maintenance', 'charging', 'restricted']);
  for (const b of M.model.ALL_BAYS.slice(0, 300)) assert.ok(states.has(M.model.bayStatus(b, M.model.facilityById(b.facility), ops())));
});

test('pricing: higher tariff lowers occupancy (elasticity) and changes revenue', () => {
  const f = M.model.facilityById('central');
  const lo = M.model.pricingScenario(f, ops(), 0.8);
  const hi = M.model.pricingScenario(f, ops(), 1.4);
  assert.ok(hi.occupancy < lo.occupancy);
  assert.notEqual(Math.round(hi.forecastDay), Math.round(lo.forecastDay));
});

test('tenant release never exceeds eligible bays and respects the protection buffer', () => {
  const f = M.model.facilityById('residential');
  const r = M.model.tenantRelease(f, { protectPct: 10, maxRelease: 999, visitorDemand: 999, hours: 8, tariff: 4 });
  assert.equal(r.eligible, Math.max(0, r.unused - r.protectedBays));
  assert.ok(r.release <= r.eligible && r.sold <= r.release);
  const tight = M.model.tenantRelease(f, { protectPct: 60, maxRelease: 999, visitorDemand: 999, hours: 8, tariff: 4 });
  assert.ok(tight.release <= r.release);
  assert.equal(M.model.tenantRelease(f, { protectPct: 10, maxRelease: 5, visitorDemand: 999, hours: 8, tariff: 4 }).release, Math.min(5, r.eligible));
  assert.equal(r.extraRevenueDay, r.sold * 4 * 8);
});

test('event demand: vehicles = attendance × rate; placed + shortage = demand', () => {
  const e = { venue: 'event', attendance: 6000, vehPerAttendee: 0.35, startH: 19, durationH: 3, vipBays: 20, reservedBays: 30, tariff: 30 };
  const p = M.model.eventPlan(e, ops());
  assert.equal(p.vehicles, 2100);
  assert.equal(p.placed + p.shortage, p.vehicles);
  assert.equal(p.revenue, p.placed * 30);
  const small = M.model.eventPlan({ ...e, attendance: 300 }, ops());
  assert.equal(small.shortage, 0);
});

test('maintenance: a closed row takes its bays out; impact and best window are computed', () => {
  const f = M.model.facilityById('central');
  const m = M.model.maintenanceImpact(f, 'row', { row: 0, hours: 4, startH: 10 }, ops());
  assert.equal(m.affected, f.bays.filter((b: { row: number }) => b.row === 0).length * f.floors);
  assert.ok(m.revenueAtRisk > 0);
  const night = M.model.maintenanceImpact(f, 'row', { row: 0, hours: 4, startH: m.recommendedStart }, ops());
  assert.ok(night.revenueAtRisk <= m.revenueAtRisk + 1e-9, 'the recommended window risks no more revenue');
  const o = M.store.opsFrom({ ops: { ...M.model.BASE_OPS, hour: 11 }, maint: [{ id: 'x', facility: 'central', scope: 'row', row: 0, startH: 10, hours: 4 }], event: {} });
  const row0 = f.bays.filter((b: { row: number }) => b.row === 0);
  for (const b of row0) assert.equal(M.model.bayStatus(b, f, o), 'maintenance', 'dashboard schedule → 3D bay status');
  const after = M.store.opsFrom({ ops: { ...M.model.BASE_OPS, hour: 15 }, maint: [{ id: 'x', facility: 'central', scope: 'row', row: 0, startH: 10, hours: 4 }], event: {} });
  assert.notEqual(M.model.bayStatus(row0[0], f, after), 'maintenance', 'released after the window');
});

test('construction cost, ROI and payback follow their formulas; scenarios are ordered', () => {
  const c = M.model.COST_DEFAULTS;
  const k = M.model.constructionCost(c);
  assert.ok(Math.abs(k.capex - (k.civil + k.site + k.finishes + k.technology + k.contingency + k.land)) < 1e-6);
  const r = M.model.roi(c, M.model.REV_DEFAULTS);
  assert.ok(Math.abs(r.noi - (r.annual - k.opexYear)) < 1e-6);
  assert.ok(Math.abs(r.roiPct - (r.noi / k.capex) * 100) < 1e-9);
  assert.ok(r.payback !== null && r.payback > k.capex / (r.noi * 1.2) && r.payback < k.capex / r.noi + 0.01);
  const multi = M.model.constructionCost({ ...c, structure: 'multistorey', floors: 3 });
  assert.ok(multi.perBay > k.perBay);
  const cons = M.model.scenarioRoi(c, M.model.REV_DEFAULTS, 'conservative');
  const opt = M.model.scenarioRoi(c, M.model.REV_DEFAULTS, 'optimistic');
  assert.ok(cons.roiPct < r.roiPct && r.roiPct < opt.roiPct);
  assert.equal(M.model.roi({ ...c }, { ...M.model.REV_DEFAULTS, occupancy: 0.01 }).payback, null, 'never pays back at 1 % occupancy');
});

test('approval criteria and the status sequence', () => {
  assert.equal(M.model.authorityDecision({ roiPct: 12, payback: 7, constraints: [], bays: 200 }).approved, true);
  const no = M.model.authorityDecision({ roiPct: 3, payback: 20, constraints: [], bays: 200 });
  assert.equal(no.approved, false);
  assert.ok(no.reasons.length >= 2);
  assert.deepEqual(M.model.STATUSES, ['Opportunity identified', 'Under feasibility review', 'Proposal prepared', 'Submitted for approval', 'Approved', 'Rejected', 'Under construction', 'Operational']);
  assert.equal(M.model.stageAt(0.6), 'Asphalt and markings');
  assert.equal(M.model.stageAt(1), 'Operational');
});

test('development opportunities are ranked, scored and sited on clear land', () => {
  const o = M.model.opportunities();
  assert.ok(o.length >= 3);
  for (let i = 1; i < o.length; i++) assert.ok(o[i - 1].score >= o[i].score);
  for (const x of o.slice(0, 5)) assert.ok(M.spatial.kerbDistance(x.site.x, x.site.z, 2) > 0 && !M.spatial.inBuilding(x.site.x, x.site.z, 0));
});

test('operator questions are answered from state; the Parking agent runs the approval-gated loop', () => {
  const o = ops();
  const k = M.model.cityKpis(o);
  const best = [...k.per].sort((a, b) => b.available - a.available)[0];
  assert.match(M.answers.answer('Which facility has the most available spaces?', o), new RegExp(best.name));
  assert.match(M.answers.answer('How many sensors are currently offline?', o), new RegExp(String(k.sensorsOffline)));
  const run = M.runtime.plan('PARKNEX Central parking is full at peak. Test a 20% more tariff and reduce drivers turned away by 30%.');
  assert.equal(run.scenarioId, 'parking');
  assert.equal(run.state, 'awaiting-approval');
  assert.equal(run.execution, null);
  const done = M.runtime.approve(run, { by: 'op', role: 'operator' });
  assert.equal(done.state, 'verified');
});

test('entrances face a road with an access drive that reaches the kerb', () => {
  for (const f of M.model.FACILITIES) {
    const e = f.entrance;
    assert.ok(M.spatial.kerbDistance(e.roadX, e.roadZ, 2) <= 0.1, `${f.id} drive reaches the carriageway`);
    assert.ok(Math.hypot(e.roadX - e.x, e.roadZ - e.z) <= 4, 'short drive');
    assert.ok(Math.abs(e.x - f.site.x) <= f.site.w / 2 + 1e-6 && Math.abs(e.z - f.site.z) <= f.site.d / 2 + 1e-6, 'entrance on the site edge');
  }
});

test('portfolio insights: financials per facility add up and recommendations cite the numbers', () => {
  const r = M.model.insights(ops());
  assert.equal(r.fin.length, M.model.FACILITIES.length);
  assert.ok(Math.abs(r.totNoi - r.fin.reduce((a: number, x: { noi: number }) => a + x.noi, 0)) < 1e-6);
  for (const x of r.fin) assert.ok(Math.abs(x.roiPct - (x.noi / x.capex) * 100) < 1e-9);
  assert.ok(r.out.some((x: { title: string }) => /best performer/.test(x.title)));
  assert.ok(r.out.every((x: { detail: string }) => /\d/.test(x.detail)));
});
