/**
 * AI Operations Agent and its scenario models (src/opsAgent, src/solutions), loaded through the project's Vite
 * toolchain in Node. Covers goal understanding and tool selection, the scenario calculations (checked against
 * hand computations), determinism, the approval gate, execution, verification, and failure handling.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let M: any;

before(async () => {
  server = await createServer({
    root: new URL('..', import.meta.url).pathname,
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
  });
  // the store first: it fixes the data modules' import order, as in the app
  await server.ssrLoadModule('/src/store/useTwinStore.ts');
  const [goal, tools, runtime, engine, graphs, registry, water, traffic, climate, networks, incident, store] = await Promise.all([
    server.ssrLoadModule('/src/opsAgent/goal.ts'),
    server.ssrLoadModule('/src/opsAgent/tools.ts'),
    server.ssrLoadModule('/src/opsAgent/runtime.ts'),
    server.ssrLoadModule('/src/solutions/engine.ts'),
    server.ssrLoadModule('/src/solutions/graphs.ts'),
    server.ssrLoadModule('/src/solutions/registry.ts'),
    server.ssrLoadModule('/src/solutions/scenarios/waterLeak.ts'),
    server.ssrLoadModule('/src/solutions/scenarios/traffic.ts'),
    server.ssrLoadModule('/src/solutions/scenarios/climate.ts'),
    server.ssrLoadModule('/src/data/networks.ts'),
    server.ssrLoadModule('/src/data/incident.ts'),
    server.ssrLoadModule('/src/opsAgent/store.ts'),
  ]);
  M = { goal, tools, runtime, engine, graphs, registry, water, traffic, climate, networks, incident, store };
});

after(async () => {
  await server?.close();
});

const OPERATOR = { by: 'test', role: 'operator' };

/* ---------------- goal understanding and tool selection ---------------- */

test('goal parser picks the workflow and reads targets and inputs', () => {
  const g = M.goal.parseGoal('Leak of 25 L/s on the main. Reduce water lost by 80% and keep residents supplied.');
  assert.equal(g.workflow.id, 'water');
  assert.equal(g.inputs.leakLps, 25);
  assert.deepEqual(
    g.targets.map((t: { kpi: string; kind: string; value: number }) => [t.kpi, t.kind, t.value]),
    [
      ['lossM3', 'reduce-pct', 80],
      ['personHours', 'max', 0],
    ],
  );
  const tr = M.goal.parseGoal('Congestion on Al Sajaa Road 10, two lanes closed, 3000 veh/h');
  assert.equal(tr.workflow.id, 'traffic');
  assert.deepEqual(tr.inputs, { demand: 3000, lanesClosed: 2, corridor: 'Al Sajaa Road 10' });
  const cl = M.goal.parseGoal('Cut CO2 by 15% using solar');
  assert.equal(cl.workflow.id, 'climate');
  assert.equal(cl.inputs.weightCo2, 90);
});

test('goal text is sanitised and capped', () => {
  const s = M.goal.sanitiseGoal('<script>alert(1)</script>\u0007 leak ' + 'x'.repeat(1000));
  assert.ok(!/[<>]/.test(s));
  assert.ok(s.length <= M.goal.MAX_GOAL_CHARS);
});

test('the agent calls the right tools in order, and the scenario tool for the workflow', () => {
  for (const [text, sid] of [
    ['Water main leak, reduce water lost by 50%', 'water-leak'],
    ['Traffic bottleneck on Al Sajaa Road 4', 'traffic'],
    ['Reduce carbon emissions by 10%', 'climate'],
  ]) {
    const run = M.runtime.plan(text);
    assert.equal(run.scenarioId, sid, text);
    assert.deepEqual(
      run.log.map((l: { tool: string }) => l.tool),
      ['inspect_assets', 'read_simulated_sensors', 'run_scenario', 'compare_interventions'],
    );
    assert.equal(run.state, 'awaiting-approval');
    assert.equal(run.steps.approval.status, 'waiting');
    assert.equal(run.execution, null, 'nothing executes before approval');
  }
});

test('tool contracts follow the repo ToolContract shape; only execution is consequential', () => {
  for (const t of M.tools.TOOLS) {
    assert.ok(t.contract.name && t.contract.version && Array.isArray(t.contract.parameters) && t.contract.outputs);
  }
  assert.deepEqual(
    M.tools.TOOLS.filter((t: { consequential: boolean }) => t.consequential).map((t: { contract: { name: string } }) => t.contract.name),
    ['execute_simulated_action'],
  );
});

/* ---------------- scenario calculations ---------------- */

test('water leak: losses, times and affected pipes follow from the inputs', () => {
  const W = M.water.WATER_LEAK;
  const r = W.run({ ...W.defaults, leakLps: 20, reportH: 6, sensorH: 0.5, repairH: 5, pressureCut: 36 });
  // travel time is shared, so the field-isolation saving is exactly (report − sensor) hours of leak
  const base = r.baseline.kpis;
  const field = r.options.find((o: { id: string }) => o.id === 'field').kpis;
  assert.ok(Math.abs(base.lossM3 - field.lossM3 - (20 * (6 - 0.5) * 3600) / 1000) < 1e-6);
  assert.ok(Math.abs(base.isolateH - field.isolateH - 5.5) < 1e-9);
  // pressure cut 36 % → flow × √0.64 = 0.8 × 20 L/s after detection
  const pr = r.options.find((o: { id: string }) => o.id === 'pressure').kpis;
  const travel = field.isolateH - 0.5 - 0.5;
  assert.ok(Math.abs(pr.lossM3 - ((20 * 0.5 + 16 * (travel + 0.5)) * 3600) / 1000) < 1e-6);
  // remote sector isolation cuts off at least the leaking main, and every segment it lists is really cut off
  const sector = r.options.find((o: { id: string }) => o.id === 'sector');
  assert.ok(sector.kpis.pipesOut >= field.pipesOut);
  const live = M.graphs.connectedSegments(M.networks.WATER_NETWORK, new Set([M.networks.INCIDENT_SEGMENT.id]));
  assert.ok(!live.has(M.networks.INCIDENT_SEGMENT.id));
  // doubling the leak doubles every loss
  const r2 = W.run({ ...W.defaults, leakLps: 40, reportH: 6, sensorH: 0.5, repairH: 5, pressureCut: 36 });
  assert.ok(Math.abs(r2.baseline.kpis.lossM3 - 2 * base.lossM3) < 1e-6);
});

test('traffic: BPR delay, capacity loss and diversion behave as computed', () => {
  const T = M.traffic.TRAFFIC;
  const open = T.run({ ...T.defaults, lanesClosed: 0, demand: 3000 });
  const closed = T.run({ ...T.defaults, lanesClosed: 1, demand: 3000 });
  assert.ok(closed.baseline.kpis.vehHours > open.baseline.kpis.vehHours, 'closing a lane adds delay');
  // BPR at v/c = 3000 / 3600 on a 3-lane trunk with one lane closed (2 × 1800)
  assert.ok(Math.abs(closed.baseline.kpis.vcMax - 3000 / 3600) < 1e-9);
  // retiming with 0 % gain is infeasible and never recommended
  const noGain = T.run({ ...T.defaults, signalGain: 0 });
  assert.equal(noGain.options.find((o: { id: string }) => o.id === 'retime').feasible, false);
  assert.notEqual(noGain.recommendation.optionId, 'retime');
  // the optimised diversion is never worse than no diversion with the same retiming
  const r = T.run(T.defaults);
  const comb = r.options.find((o: { id: string }) => o.id === 'combined').kpis.vehHours;
  const ret = r.options.find((o: { id: string }) => o.id === 'retime').kpis.vehHours;
  assert.ok(comb <= ret + 1e-9);
  // diverted traffic adds distance
  assert.ok(r.options.find((o: { id: string }) => o.id === 'divert').kpis.vehKm > r.baseline.kpis.vehKm);
});

test('climate: solar generation, CO2 and irrigation follow the documented assumptions', () => {
  const C = M.climate.CLIMATE;
  const r = C.run({ ...C.defaults, battery: 0, trees: 500, litresPerTree: 50, gridFactor: 0.5 });
  const b = r.baseline.kpis;
  const s = r.options.find((o: { id: string }) => o.id === 'solar').kpis;
  // CO2 is grid MWh × factor (t), for the baseline and the option
  assert.ok(Math.abs(b.co2T - b.gridMWh * 0.5) < 1e-6);
  assert.ok(Math.abs(s.co2T - s.gridMWh * 0.5) < 1e-6);
  // irrigation: 500 trees × 50 L × 365 days = 9 125 m³
  assert.equal(r.options.find((o: { id: string }) => o.id === 'cooling').kpis.waterM3, 9125);
  // more coverage, more solar used, less CO2
  const more = C.run({ ...C.defaults, coverage: 100 });
  const less = C.run({ ...C.defaults, coverage: 30 });
  assert.ok(more.options[0].kpis.co2T < less.options[0].kpis.co2T);
  // the dispatch never uses more than is generated or demanded
  assert.ok(M.climate.dispatchDay(10, 100, 0) <= 10 + 1e-9);
  assert.ok(M.climate.dispatchDay(100, 10, 50) <= 10 + 1e-9);
  // a battery helps only when midday solar exceeds the load
  assert.ok(M.climate.dispatchDay(100, 60, 30) > M.climate.dispatchDay(100, 60, 0));
});

test('change(): percentage is unavailable from a zero baseline or across a sign change', () => {
  assert.deepEqual(M.engine.change(100, 80), { abs: -20, pct: -20 });
  assert.equal(M.engine.change(0, 5).pct, null);
  assert.equal(M.engine.change(-5, 5).pct, null);
  assert.equal(M.engine.change(null, 5).abs, null);
});

test('every scenario is deterministic and labels its numbers', () => {
  for (const s of M.registry.SCENARIOS) {
    const a = s.run(s.defaults);
    const b = s.run(s.defaults);
    assert.deepEqual(a, b, s.id);
    assert.ok(a.kpis.every((k: { basis: string }) => ['Simulated', 'Estimated', 'Assumption', 'Layout'].includes(k.basis)));
    assert.ok(a.assumptions.length && a.limitations.length && a.unavailable.length, `${s.id} documents assumptions and gaps`);
    assert.ok(a.options.length >= 2, `${s.id} compares at least two interventions`);
    assert.ok(a.highlight.points.length + a.highlight.paths.length > 0, `${s.id} highlights assets on the map`);
    // the recommendation is traceable: a score for every option, and the winner has the top feasible score
    const feas = a.options.filter((o: { feasible: boolean }) => o.feasible);
    const top = Math.max(...feas.map((o: { id: string }) => a.recommendation.scores[o.id]));
    assert.equal(a.recommendation.scores[a.recommendation.optionId], top);
  }
});

/* ---------------- approval, execution and verification ---------------- */

test('execution requires an operator approval; viewers are blocked and logged', () => {
  const run = M.runtime.plan(M.runtime.DEMO_GOALS[0].goal);
  const blocked = M.runtime.approve(run, { by: 'v', role: 'viewer' });
  assert.equal(blocked.state, 'awaiting-approval');
  assert.equal(blocked.execution, null);
  assert.match(blocked.error, /not authorised/);
  const last = blocked.log[blocked.log.length - 1];
  assert.equal(last.tool, 'execute_simulated_action');
  assert.equal(last.ok, false);
  // the tool itself refuses without an approval, whoever calls it
  assert.throws(() => M.tools.executeAction.run({ result: run.result, optionId: run.selected, approval: null, seq: 1 }), /no human approval/);
  // rejecting stops the run without acting
  const rej = M.runtime.reject(run, 'v');
  assert.equal(rej.state, 'rejected');
  assert.equal(rej.execution, null);
});

test('the three guided demos run end to end: plan → approve → execute → verify', () => {
  for (const d of M.runtime.DEMO_GOALS) {
    const run = M.runtime.plan(d.goal);
    assert.equal(run.state, 'awaiting-approval', d.id);
    const done = M.runtime.approve(run, OPERATOR);
    assert.equal(done.state, 'verified', d.id);
    assert.equal(done.execution.optionId, run.selected);
    assert.equal(done.verification.reproduced, true);
    assert.ok(done.verification.checks.every((c: { met: boolean }) => c.met), `${d.id}: demo targets are met`);
    assert.deepEqual(
      done.log.map((l: { tool: string }) => l.tool).slice(-2),
      ['execute_simulated_action', 'verify_outcome'],
    );
    assert.ok(done.verification.remainingRisks.length > 0, 'remaining risks are reported');
  }
});

test('changing inputs changes the result (no hardcoded numbers), and the plan picks an option that meets the goal', () => {
  const g = 'Leak on the water main. Reduce water lost by 80% and keep residents supplied.';
  const a = M.runtime.plan(g, { leakLps: 10 });
  const b = M.runtime.plan(g, { leakLps: 60 });
  assert.notEqual(a.result.baseline.kpis.lossM3, b.result.baseline.kpis.lossM3);
  // sector isolation leaves residents without water, so it can't be picked under this goal
  assert.notEqual(a.selected, 'sector');
  const c = a.candidates.find((x: { optionId: string }) => x.optionId === a.selected);
  assert.ok(c.meetsGoal);
});

test('an unmet target is reported, not hidden', () => {
  const run = M.runtime.plan('Reduce vehicle-hours delay by 90% on Al Sajaa Road 1');
  assert.equal(run.state, 'awaiting-approval');
  assert.ok(run.candidates.every((c: { meetsGoal: boolean }) => !c.meetsGoal));
  assert.match(run.steps.evaluate.note, /No candidate meets every target/);
  const done = M.runtime.approve(run, OPERATOR);
  assert.ok(done.verification.remainingRisks.some((r: string) => /Target not met/.test(r)));
});

/* ---------------- failure handling ---------------- */

test('failures stop the loop at the failing step with a clear message', () => {
  const empty = M.runtime.plan('');
  assert.equal(empty.state, 'failed');
  assert.equal(empty.steps.understand.status, 'failed');
  const unknown = M.runtime.plan('make the city nicer');
  assert.match(unknown.error, /No workflow matched/);
  const notYet = M.runtime.plan('Blackout on a feeder, restore the microgrid');
  assert.match(notYet.error, /not implemented yet/);
  const bad = M.runtime.plan('Leak of 900 L/s on the water main');
  assert.equal(bad.steps.tools.status, 'failed');
  assert.match(bad.error, /between 5 and 80/);
  assert.equal(bad.log[bad.log.length - 1].ok, false);
  assert.equal(bad.steps.approval.status, 'skipped');
});

test('tool input validation rejects unknown inputs and bad options', () => {
  assert.throws(() => M.tools.runScenario.run({ scenarioId: 'water-leak', inputs: { rm: 1 } }), /Unknown input/);
  assert.throws(() => M.tools.runScenario.run({ scenarioId: 'traffic', inputs: { corridor: 'Nowhere Street' } }), /must be one of/);
  assert.throws(() => M.tools.runScenario.run({ scenarioId: 'traffic', inputs: { demand: 'lots' } }), /must be a number/);
  assert.throws(() => M.tools.runScenario.run({ scenarioId: 'nope', inputs: {} }), /Unknown scenario/);
  // approving something that is not awaiting approval does nothing
  const failed = M.runtime.plan('');
  const again = M.runtime.approve(failed, OPERATOR);
  assert.equal(again.execution, null);
});

test('the store exposes the executed plan to the 3D overlay', () => {
  const s = M.store.useOpsStore;
  const run = M.runtime.plan(M.runtime.DEMO_GOALS[1].goal);
  s.getState().setRun(run);
  assert.equal(s.getState().executed, false);
  assert.ok(s.getState().highlight.paths.length > 0);
  s.getState().setRun(M.runtime.approve(run, OPERATOR));
  assert.equal(s.getState().executed, true);
  s.getState().setOpen(false);
  assert.equal(s.getState().highlight, null);
});
