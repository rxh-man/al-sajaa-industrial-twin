import { parseGoal, type ParsedGoal } from './goal';
import { compareOptions, executeAction, inspectAssets, readSensors, runScenario, ToolError, verifyOutcome, type AssetSummary, type ExecutionRecord, type SensorReading, type TargetCheck, type Verification } from './tools';
import { scenarioById } from '../solutions/registry';
import type { InputValues, ScenarioResult } from '../solutions/types';

/**
 * The operations agent's loop, as a pure state machine (no timers, no network):
 *   plan(goal)    understand → inspect → run tools → evaluate candidates → explain → stop at the approval gate
 *   approve(...)  execute the selected simulated action → verify by an independent re-run → report risks
 *   reject(...)   stop without acting
 * Every tool call is logged with its arguments summary, outcome and any error. Explanations are built only from
 * the tool results; nothing is invented.
 */

export type StepId = 'understand' | 'inspect' | 'tools' | 'evaluate' | 'explain' | 'approval' | 'execute' | 'verify';
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'waiting' | 'skipped';

export const STEP_ORDER: StepId[] = ['understand', 'inspect', 'tools', 'evaluate', 'explain', 'approval', 'execute', 'verify'];

export interface LogEntry {
  seq: number;
  tool: string;
  args: string;
  ok: boolean;
  summary: string;
}

export interface Candidate {
  optionId: string;
  name: string;
  feasible: boolean;
  meetsGoal: boolean;
  score: number;
  checks: TargetCheck[];
  why?: string;
}

export interface AgentRun {
  goal: ParsedGoal;
  scenarioId: string | null;
  inputs: InputValues;
  steps: Record<StepId, { status: StepStatus; note: string }>;
  log: LogEntry[];
  assets: AssetSummary[];
  sensors: { readings: SensorReading[]; note: string } | null;
  result: ScenarioResult | null;
  candidates: Candidate[];
  selected: string | null;
  explanation: string[];
  execution: ExecutionRecord | null;
  verification: Verification | null;
  /** terminal state of the run */
  state: 'failed' | 'awaiting-approval' | 'rejected' | 'executed' | 'verified';
  error: string | null;
}

const blankSteps = () => Object.fromEntries(STEP_ORDER.map((s) => [s, { status: 'pending', note: '' }])) as AgentRun['steps'];

function call<T>(run: AgentRun, tool: string, args: string, fn: () => T, summarise: (r: T) => string): T {
  const seq = run.log.length + 1;
  try {
    const r = fn();
    run.log.push({ seq, tool, args, ok: true, summary: summarise(r) });
    return r;
  } catch (e) {
    const msg = e instanceof ToolError || e instanceof Error ? e.message : String(e);
    run.log.push({ seq, tool, args, ok: false, summary: msg });
    throw e instanceof ToolError ? e : new ToolError(tool, msg);
  }
}

function fail(run: AgentRun, step: StepId, msg: string): AgentRun {
  run.steps[step] = { status: 'failed', note: msg };
  for (const s of STEP_ORDER.slice(STEP_ORDER.indexOf(step) + 1)) run.steps[s] = { status: 'skipped', note: '' };
  run.state = 'failed';
  run.error = msg;
  return run;
}

/** run the loop up to the approval gate. `overrides` are inputs the user set in the panel (they win over the goal). */
export function plan(goalText: unknown, overrides: InputValues = {}): AgentRun {
  const goal = parseGoal(goalText);
  const run: AgentRun = {
    goal,
    scenarioId: goal.workflow?.scenarioId ?? null,
    inputs: {},
    steps: blankSteps(),
    log: [],
    assets: [],
    sensors: null,
    result: null,
    candidates: [],
    selected: null,
    explanation: [],
    execution: null,
    verification: null,
    state: 'failed',
    error: null,
  };
  // 1. understand
  if (goal.problems.length && (!goal.workflow || !goal.workflow.scenarioId)) return fail(run, 'understand', goal.problems.join(' '));
  run.steps.understand = { status: 'done', note: goal.understood.join(' · ') + (goal.problems.length ? ` · Ignored: ${goal.problems.join(' ')}` : '') };
  const sid = run.scenarioId!;
  const def = scenarioById(sid)!;
  run.inputs = { ...def.defaults, ...goal.inputs, ...overrides };

  // 2. inspect assets and simulated sensors
  try {
    run.assets = call(run, 'inspect_assets', `scenarioId=${sid}`, () => inspectAssets.run({ scenarioId: sid }), (r) => `${r.length} asset group(s)`);
    run.sensors = call(run, 'read_simulated_sensors', `scenarioId=${sid}`, () => readSensors.run({ scenarioId: sid }), (r) => `${r.readings.length} simulated reading(s)`);
    run.steps.inspect = { status: 'done', note: run.sensors.note };
  } catch (e) {
    return fail(run, 'inspect', (e as Error).message);
  }

  // 3. call the scenario model
  try {
    run.result = call(run, 'run_scenario', `${sid} with ${Object.keys(run.inputs).length} inputs`, () => runScenario.run({ scenarioId: sid, inputs: run.inputs }), (r) => `baseline + ${r.options.length} candidates`);
    run.steps.tools = { status: 'done', note: `${def.title}: ${run.result.options.length} interventions modelled` };
  } catch (e) {
    return fail(run, 'tools', (e as Error).message);
  }

  // 4. evaluate the candidates against the goal
  const result = run.result;
  const cmp = call(run, 'compare_interventions', `${result.options.length} options, ${goal.targets.length} target(s)`, () => compareOptions.run({ result, targets: goal.targets }), (r) => `${r.filter((c) => c.feasible && c.meetsGoal).length} feasible option(s) meet the goal`);
  run.candidates = cmp.map((c) => {
    const o = result.options.find((q) => q.id === c.optionId)!;
    return { ...c, name: o.name, why: o.infeasibleWhy };
  });
  const qualifying = run.candidates.filter((c) => c.feasible && c.meetsGoal).sort((a, b) => b.score - a.score);
  const feasible = run.candidates.filter((c) => c.feasible).sort((a, b) => b.score - a.score);
  const pickC = qualifying[0] ?? feasible[0];
  if (!pickC) return fail(run, 'evaluate', 'No feasible intervention under these inputs.');
  run.selected = pickC.optionId;
  run.steps.evaluate = {
    status: 'done',
    note: qualifying.length
      ? `${qualifying.length} of ${run.candidates.length} candidates meet every target; picked the highest-scoring one.`
      : goal.targets.length
        ? `No candidate meets every target; picked the best feasible option and flagged the gap.`
        : `No targets given; picked the highest weighted score.`,
  };

  // 5. explain, from the results only
  const chosen = result.options.find((o) => o.id === run.selected)!;
  run.explanation = [
    `Selected: ${chosen.name}. ${chosen.summary}`,
    run.selected === result.recommendation.optionId ? result.recommendation.why : `The model's top weighted score is ${result.options.find((o) => o.id === result.recommendation.optionId)?.name ?? 'n/a'}, but it does not meet the goal's targets; this option does.`,
    ...pickC.checks.map((c) => `${c.met ? 'Meets' : 'Misses'} — ${c.detail}`),
    `Confidence ${result.confidence.level}: ${result.confidence.why}`,
  ];
  run.steps.explain = { status: 'done', note: 'Explanation built from the tool results.' };

  // 6. stop for approval: executing changes the simulated city state
  run.steps.approval = { status: 'waiting', note: 'Executing changes the simulated twin. An operator must approve.' };
  run.state = 'awaiting-approval';
  return run;
}

/** a copy of the run with fresh containers, so callers (React state) see a new object */
const clone = (r: AgentRun): AgentRun => ({ ...r, steps: { ...r.steps }, log: [...r.log] });

export function approve(prev: AgentRun, approval: { by: string; role: string }, optionId = prev.selected): AgentRun {
  const run = clone(prev);
  if (run.state !== 'awaiting-approval' || !run.result || !optionId) {
    run.log.push({ seq: run.log.length + 1, tool: 'execute_simulated_action', args: 'approval', ok: false, summary: 'Nothing is awaiting approval.' });
    return run;
  }
  const result = run.result;
  // 7. execute (the tool itself enforces the approval and the role)
  try {
    run.execution = call(run, 'execute_simulated_action', `${optionId} approved by ${approval.by || 'unnamed'} (${approval.role})`, () => executeAction.run({ result, optionId, approval, seq: run.log.length + 1 }), (r) => `applied ${r.actions.length} action(s) to the simulated twin`);
  } catch (e) {
    // an unauthorised or failed execution leaves the plan waiting for a valid approval
    run.steps.approval = { status: 'waiting', note: (e as Error).message };
    run.error = (e as Error).message;
    return run;
  }
  run.selected = optionId;
  run.steps.approval = { status: 'done', note: `Approved by ${approval.by || 'unnamed'} (${approval.role}).` };
  run.steps.execute = { status: 'done', note: `${result.options.find((o) => o.id === optionId)!.name} applied to the simulated twin.` };
  run.state = 'executed';
  run.error = null;
  // 8. verify by an independent re-run
  try {
    const exec = run.execution;
    run.verification = call(run, 'verify_outcome', `re-run ${run.scenarioId}`, () => verifyOutcome.run({ scenarioId: run.scenarioId!, inputs: run.inputs, record: exec, targets: run.goal.targets }), (v) => `${v.reproduced ? 'reproduced' : 'NOT reproduced'}; ${v.checks.filter((c) => c.met).length}/${v.checks.length} target(s) met`);
    const v = run.verification;
    run.steps.verify = { status: v.reproduced ? 'done' : 'failed', note: v.reproduced ? `Result reproduced; ${v.remainingRisks.length} remaining risk(s) listed.` : 'Re-run did not reproduce the plan.' };
    run.state = v.reproduced ? 'verified' : 'executed';
  } catch (e) {
    run.steps.verify = { status: 'failed', note: (e as Error).message };
  }
  return run;
}

export function reject(prev: AgentRun, by: string): AgentRun {
  const run = clone(prev);
  if (run.state !== 'awaiting-approval') return run;
  run.log.push({ seq: run.log.length + 1, tool: 'approval', args: by || 'unnamed', ok: true, summary: 'Rejected; no action taken.' });
  run.steps.approval = { status: 'done', note: `Rejected by ${by || 'unnamed'}; nothing was executed.` };
  run.steps.execute = { status: 'skipped', note: '' };
  run.steps.verify = { status: 'skipped', note: '' };
  run.state = 'rejected';
  return run;
}

/** the three guided demo goals (judges can edit the text and the inputs, then re-run) */
export const DEMO_GOALS = [
  { id: 'water', label: 'Water leak', labelAr: 'تسرب مياه', goal: 'Leak of 25 L/s on the main under Al Sajaa main road. Reduce water lost by 80% and keep residents supplied.' },
  { id: 'traffic', label: 'Traffic bottleneck', labelAr: 'اختناق مروري', goal: 'Congestion on Al Sajaa Road 1: one lane closed, 4200 veh/h in the peak. Reduce vehicle-hours delay by 5%.' },
  { id: 'climate', label: 'Climate objective', labelAr: 'هدف مناخي', goal: 'Cut CO2 emissions by 20% with rooftop solar and cool the hottest streets with 600 trees, irrigation under 20000 m3.' },
] as const;
