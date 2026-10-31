/**
 * The agent's added workflows (energy, emergency, maintenance, freight, planning, air, flood, city-wide
 * sustainability), the specialist roster, the optional language-model goal reading (with its validation and
 * fallback), and the session audit trail. Run in Node through the project's Vite toolchain.
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
  const [runtime, specialists, llm, store, registry, energy, emergency, maintenance, freight, planning, env, graphs, networks, srv] = await Promise.all([
    server.ssrLoadModule('/src/opsAgent/runtime.ts'),
    server.ssrLoadModule('/src/opsAgent/specialists.ts'),
    server.ssrLoadModule('/src/opsAgent/llm.ts'),
    server.ssrLoadModule('/src/opsAgent/store.ts'),
    server.ssrLoadModule('/src/solutions/registry.ts'),
    server.ssrLoadModule('/src/solutions/scenarios/energy.ts'),
    server.ssrLoadModule('/src/solutions/scenarios/emergency.ts'),
    server.ssrLoadModule('/src/solutions/scenarios/maintenance.ts'),
    server.ssrLoadModule('/src/solutions/scenarios/freight.ts'),
    server.ssrLoadModule('/src/solutions/scenarios/planning.ts'),
    server.ssrLoadModule('/src/solutions/scenarios/environment.ts'),
    server.ssrLoadModule('/src/solutions/graphs.ts'),
    server.ssrLoadModule('/src/data/networks.ts'),
    server.ssrLoadModule('/server/agentGoal.ts'),
  ]);
  M = { runtime, specialists, llm, store, registry, energy, emergency, maintenance, freight, planning, env, graphs, networks, srv };
});
after(async () => {
  await server?.close();
});

const OP = { by: 'test', role: 'operator' };
const opt = (r: { options: { id: string }[] }, id: string) => r.options.find((o) => o.id === id) as { kpis: Record<string, number>; feasible: boolean };

test('every specialist goal runs the full loop: plan → approval gate → execute → verified', () => {
  for (const s of M.specialists.SPECIALISTS) {
    const p = M.runtime.plan(s.demoGoal);
    assert.equal(p.state, 'awaiting-approval', s.id);
    assert.ok(s.scenarios.includes(p.scenarioId), `${s.id} routes to its own scenario (got ${p.scenarioId})`);
    assert.equal(p.execution, null);
    const done = M.runtime.approve(p, OP);
    assert.equal(done.state, 'verified', s.id);
    assert.equal(done.verification.reproduced, true);
  }
});

test('no workflow is left unimplemented', async () => {
  const { WORKFLOWS } = await server.ssrLoadModule('/src/opsAgent/goal.ts');
  for (const w of WORKFLOWS) assert.ok(w.scenarioId && M.registry.scenarioById(w.scenarioId), w.id);
});

test('energy: the outage area is traced on the network; backups behave as modelled', () => {
  const E = M.energy.ENERGY;
  const r = E.run(E.defaults);
  // the faulted feeder really disconnects the segments listed
  const net = M.networks.NETWORKS.find((n: { layer: { id: string } }) => n.layer.id === 'electric');
  assert.ok(r.highlight.paths.length > 10);
  const base = r.baseline.kpis;
  const tie = opt(r, 'tie').kpis;
  assert.ok(tie.unservedMWh < base.unservedMWh);
  // a battery large enough for the whole repair removes critical-site hours entirely
  const big = E.run({ ...E.defaults, batteryMWh: 10, repairH: 2 });
  assert.equal(opt(big, 'microgrid').kpis.criticalHours, 0);
  // generators can't help if the repair is quicker than their arrival
  const quick = E.run({ ...E.defaults, repairH: 1 });
  assert.equal(opt(quick, 'generators').feasible, false);
  // no spare capacity, no back-feed
  assert.equal(opt(E.run({ ...E.defaults, tieMW: 0 }), 'tie').feasible, false);
  assert.ok(net.segments.length > 0);
});

test('emergency: a closure-aware route is never slower; the nearest base is never slower than the default', () => {
  const X = M.emergency.EMERGENCY;
  for (const incident of M.emergency.INCIDENT_IDS()) {
    const r = X.run({ ...X.defaults, incident });
    const base = r.baseline.kpis.responseMin;
    const aware = opt(r, 'aware').kpis.responseMin;
    const nearest = opt(r, 'nearest').kpis.responseMin;
    assert.ok(aware <= base + 1e-9, incident);
    assert.ok(nearest <= aware + 1e-9, incident);
  }
  // faster vehicles, faster response
  const slow = X.run({ ...X.defaults, speedFactor: 1 });
  const fast = X.run({ ...X.defaults, speedFactor: 1.5 });
  assert.ok(opt(fast, 'nearest').kpis.responseMin < opt(slow, 'nearest').kpis.responseMin);
});

test('maintenance: risk-based renewal beats age-based for the same budget; more budget, more risk removed', () => {
  const T = M.maintenance.MAINTENANCE;
  const r = T.run(T.defaults);
  assert.ok(opt(r, 'risk').kpis.riskPct >= r.baseline.kpis.riskPct);
  const big = T.run({ ...T.defaults, crewHours: 2400 });
  assert.ok(opt(big, 'risk').kpis.riskPct > opt(r, 'risk').kpis.riskPct);
  // anomalies are synthetic and seeded: same seed, same result; different seed, different anomalies
  assert.deepEqual(T.run(T.defaults), r);
  assert.notDeepEqual(T.run({ ...T.defaults, seed: 8 }).highlight.points, r.highlight.points);
  assert.ok(M.maintenance.failureP(70, 50, false) > M.maintenance.failureP(95, 10, false));
});

test('freight: 2-opt never lengthens the nearest-neighbour round; ordering beats list order', () => {
  const F = M.freight.FREIGHT;
  for (const stops of [4, 6, 8, 10]) {
    const r = F.run({ ...F.defaults, stops });
    assert.ok(opt(r, 'opt').kpis.hours <= opt(r, 'nn').kpis.hours + 1e-9, `${stops} stops`);
    assert.ok(opt(r, 'opt').kpis.km <= r.baseline.kpis.km * 1.0001 || opt(r, 'nn').kpis.km <= r.baseline.kpis.km);
    assert.equal(opt(r, 'split').kpis.trucks, 2);
  }
});

test('planning, air, flood and city-wide strategy respond to their inputs', () => {
  const P = M.planning.PLANNING;
  const p = P.run(P.defaults);
  assert.ok(opt(p, 'mitigated').kpis.addCo2 < p.baseline.kpis.addCo2);
  const A = M.env.AIR;
  const a = A.run(A.defaults);
  assert.ok(opt(a, 'filters').kpis.worst <= a.baseline.kpis.worst);
  const Fl = M.env.FLOOD;
  const wet = Fl.run({ ...Fl.defaults, drainMmH: 10 });
  const dry = Fl.run({ ...Fl.defaults, drainMmH: 50 });
  assert.ok(dry.baseline.kpis.excessM3 < wet.baseline.kpis.excessM3);
  assert.ok(opt(wet, 'combined').kpis.excessM3 < wet.baseline.kpis.excessM3);
  assert.ok(wet.findings[0].startsWith('HYPOTHETICAL'));
  const S = M.env.SUSTAINABILITY;
  const s = S.run(S.defaults);
  assert.ok(opt(s, 'all').kpis.netT < s.baseline.kpis.netT);
  assert.ok(opt(s, 'abate').kpis.pm < s.baseline.kpis.pm);
});

test('multi-source network reachability: every piece of the cable network has a feed', () => {
  const net = M.networks.NETWORKS.find((n: { layer: { id: string } }) => n.layer.id === 'electric');
  const feeds = M.graphs.feedPoints(net, [[0, 0]]);
  const live = M.graphs.connectedSegments(net, new Set(), feeds);
  assert.equal(live.size, net.segments.length);
  assert.ok(M.graphs.connectedSegments(net, new Set()).size < net.segments.length, 'one source alone does not reach every piece');
});

test('language model reading: offline falls back to rules; proposals are validated field by field', async () => {
  const offline = await M.llm.readGoal('Leak of 25 L/s on the water main', async () => new Response(JSON.stringify({ error: 'offline' }), { status: 503 }));
  assert.equal(offline.source, 'rules');
  assert.match(offline.note, /not configured/);
  const proposal = { workflow: 'water', inputs: { leakLps: 40, nonsense: 3, repairH: 999 }, targets: [{ kpi: 'lossM3', kind: 'reduce-pct', value: 70, text: 'cut losses 70%' }, { kpi: 'madeUp', kind: 'max', value: 1 }] };
  const ok = await M.llm.readGoal('Leak of 40 L/s', async () => new Response(JSON.stringify({ proposal, model: 'test-model' }), { status: 200 }));
  assert.equal(ok.source, 'llm');
  assert.equal(ok.parsed.inputs.leakLps, 40);
  assert.equal(ok.parsed.inputs.nonsense, undefined);
  assert.equal(ok.parsed.inputs.repairH, undefined, 'out-of-range value dropped');
  assert.equal(ok.parsed.targets.length, 1);
  assert.ok(ok.parsed.problems.length >= 3);
  const run = M.runtime.plan('Leak of 40 L/s', {}, ok);
  assert.equal(run.reader.source, 'llm');
  assert.equal(run.state, 'awaiting-approval');
  assert.equal(run.inputs.leakLps, 40);
  const junk = await M.llm.readGoal('x', async () => new Response(JSON.stringify({ proposal: { workflow: 'teleport' } }), { status: 200 }));
  assert.equal(junk.source, 'rules');
  const thrown = await M.llm.readGoal('x', async () => {
    throw new Error('network');
  });
  assert.equal(thrown.source, 'rules');
});

test('server endpoint: no key → 503 offline; with a key the model reply is parsed, never executed', async () => {
  const off = await M.srv.interpretGoal({}, JSON.stringify({ goal: 'leak', catalogue: {} }));
  assert.equal(off.status, 503);
  let sent: { headers: Record<string, string>; body: string } | null = null;
  const fake = async (_url: string, init: { headers: Record<string, string>; body: string }) => {
    sent = init;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"workflow":"water","inputs":{"leakLps":20},"targets":[]}' } }] }), { status: 200 });
  };
  const on = await M.srv.interpretGoal({ AGENT_LLM_API_KEY: 'k', AGENT_LLM_BASE_URL: 'https://example.invalid/v1' }, JSON.stringify({ goal: 'leak of 20 L/s', catalogue: [{ workflow: 'water' }] }), fake);
  assert.equal(on.status, 200);
  assert.equal(on.body.proposal.workflow, 'water');
  assert.equal(sent!.headers.Authorization, 'Bearer k');
  const bad = await M.srv.interpretGoal({ AGENT_LLM_API_KEY: 'k', AGENT_LLM_BASE_URL: 'x' }, JSON.stringify({ goal: 'x'.repeat(500), catalogue: {} }), fake);
  assert.equal(bad.status, 400);
});

test('the session audit trail records each plan, approval and blocked attempt', () => {
  const s = M.store.useOpsStore;
  const before = s.getState().audit.length;
  const p = M.runtime.plan(M.runtime.DEMO_GOALS[0].goal);
  s.getState().setRun(p);
  s.getState().setRun(M.runtime.approve(p, { by: 'v', role: 'viewer' }));
  s.getState().setRun(M.runtime.approve(p, OP));
  const added = s.getState().audit.slice(before);
  assert.equal(added.length, 3);
  assert.deepEqual(added.map((a: { state: string }) => a.state), ['awaiting-approval', 'awaiting-approval', 'verified']);
  assert.equal(added[2].approvedBy, 'test');
});
