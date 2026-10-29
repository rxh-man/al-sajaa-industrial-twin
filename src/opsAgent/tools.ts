import type { ToolContract } from '../agents/agentOrchestrator';
import { INCIDENT_SEGMENT, WATER_NETWORK } from '../data/networks';
import { SENSORS } from '../data/sensors';
import { WAREHOUSE_ROOF_RECORDS } from '../data/climateAgents';
import { change, round } from '../solutions/engine';
import { scenarioById } from '../solutions/registry';
import type { InputValues, OptionResult, ScenarioDef, ScenarioResult } from '../solutions/types';
import type { Target } from './goal';

/**
 * The operations agent's tools, declared in the repo's ToolContract format (agents/agentOrchestrator.ts). Every
 * tool validates its arguments and either returns a result or throws a ToolError; the runtime records both.
 * Tools only read the twin's simulated data and run its scenario models: none reaches real infrastructure.
 */

export class ToolError extends Error {
  constructor(
    public tool: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Tool<A, R> {
  contract: ToolContract;
  /** true when the tool changes the (simulated) state of the city and therefore needs human approval */
  consequential: boolean;
  run: (args: A) => R;
}

/** reject anything the scenario does not declare, and values outside the declared ranges or options */
export function validateInputs(def: ScenarioDef, inputs: InputValues): InputValues {
  const out: InputValues = { ...def.defaults };
  for (const [k, v] of Object.entries(inputs)) {
    const spec = def.inputs.find((s) => s.id === k);
    if (!spec) throw new ToolError('run_scenario', `Unknown input "${k}" for ${def.title}.`);
    if (spec.kind === 'range') {
      const x = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(x)) throw new ToolError('run_scenario', `${spec.label} must be a number.`);
      if (x < spec.min || x > spec.max) throw new ToolError('run_scenario', `${spec.label} must be between ${spec.min} and ${spec.max}${spec.unit ? ' ' + spec.unit : ''} (got ${x}).`);
      out[k] = x;
    } else if (spec.kind === 'select') {
      if (!spec.options.some((o) => o.value === v)) throw new ToolError('run_scenario', `${spec.label} must be one of: ${spec.options.map((o) => o.value).join(', ')}.`);
      out[k] = v;
    } else out[k] = v === true || v === 'true';
  }
  return out;
}

export interface AssetSummary {
  kind: string;
  id: string;
  detail: string;
}

export const inspectAssets: Tool<{ scenarioId: string }, AssetSummary[]> = {
  contract: {
    name: 'inspect_assets',
    description: 'List the modelled assets and networks relevant to a workflow (simulated layout data).',
    version: '1.0',
    parameters: [{ name: 'scenarioId', type: 'string', required: true, description: 'scenario model id' }],
    outputs: { type: 'array', description: 'assets with ids and one-line details' },
  },
  consequential: false,
  run: ({ scenarioId }) => {
    const def = scenarioById(scenarioId);
    if (!def) throw new ToolError('inspect_assets', `Unknown scenario "${scenarioId}".`);
    if (scenarioId === 'water-leak') {
      const m = INCIDENT_SEGMENT.meta;
      return [
        { kind: 'pipe', id: INCIDENT_SEGMENT.id, detail: `${m.material} DN${m.diameterMm}, ${m.installYear}, health ${m.health} %, ${round(INCIDENT_SEGMENT.length * 10, 0)} m` },
        { kind: 'network', id: WATER_NETWORK.layer.id, detail: `${WATER_NETWORK.segments.length} pipe segments, ${WATER_NETWORK.nodes.length} nodes` },
      ];
    }
    if (scenarioId === 'climate') {
      const m2 = WAREHOUSE_ROOF_RECORDS.reduce((a, r) => a + r.areaM2, 0);
      return [{ kind: 'roofs', id: 'warehouse roofs', detail: `${WAREHOUSE_ROOF_RECORDS.length} roofs, ${round(m2 / 1000, 1)} thousand m² (layout)` }];
    }
    return def.infrastructure.map((s) => ({ kind: 'asset', id: s, detail: 'from the scenario model' }));
  },
};

export interface SensorReading {
  id: string;
  type: string;
  status: string;
}

export const readSensors: Tool<{ scenarioId: string }, { readings: SensorReading[]; note: string }> = {
  contract: {
    name: 'read_simulated_sensors',
    description: 'Read the simulated sensors for a workflow. No live sensor feed is connected.',
    version: '1.0',
    parameters: [{ name: 'scenarioId', type: 'string', required: true, description: 'scenario model id' }],
    outputs: { type: 'object', description: 'simulated sensor states and a note on their source' },
  },
  consequential: false,
  run: ({ scenarioId }) => {
    if (scenarioId === 'water-leak') {
      const cluster = SENSORS.filter((s) => s.layer === 'water' && s.cluster);
      return {
        readings: cluster.map((s) => ({ id: s.id, type: s.type, status: 'anomaly (scripted demo incident)' })),
        note: `${cluster.length} simulated water sensors near ${INCIDENT_SEGMENT.id} are flagged by the twin's scripted incident; they carry no measured values.`,
      };
    }
    return { readings: [], note: 'The twin has no sensors for this workflow; demand and conditions come from the inputs you set.' };
  },
};

export const runScenario: Tool<{ scenarioId: string; inputs: InputValues }, ScenarioResult> = {
  contract: {
    name: 'run_scenario',
    description: 'Run a deterministic scenario model: baseline plus candidate interventions with KPIs.',
    version: '1.0',
    parameters: [
      { name: 'scenarioId', type: 'string', required: true, description: 'scenario model id' },
      { name: 'inputs', type: 'object', required: true, description: 'scenario inputs (validated against the model\'s declared ranges)' },
    ],
    outputs: { type: 'object', description: 'ScenarioResult' },
  },
  consequential: false,
  run: ({ scenarioId, inputs }) => {
    const def = scenarioById(scenarioId);
    if (!def) throw new ToolError('run_scenario', `Unknown scenario "${scenarioId}".`);
    const v = validateInputs(def, inputs);
    try {
      return def.run(v);
    } catch (e) {
      throw new ToolError('run_scenario', (e as Error).message);
    }
  },
};

export interface TargetCheck {
  target: Target;
  value: number | null;
  met: boolean;
  detail: string;
}

/** check one option against the goal's targets */
export function checkTargets(result: ScenarioResult, option: OptionResult, targets: Target[]): TargetCheck[] {
  return targets.map((t) => {
    const k = result.kpis.find((q) => q.id === t.kpi);
    const v = option.kpis[t.kpi] ?? null;
    if (!k || v === null) return { target: t, value: v, met: false, detail: `${t.text}: KPI not available for this option` };
    if (t.kind === 'reduce-pct') {
      const c = change(result.baseline.kpis[t.kpi] ?? null, v);
      const cut = c.pct === null ? null : -c.pct;
      const met = cut !== null && cut >= t.value - 1e-9;
      return { target: t, value: v, met, detail: `${t.text}: ${cut === null ? 'n/a' : `${round(cut, 1)} % achieved`}` };
    }
    const met = t.kind === 'max' ? v <= t.value + 1e-9 : v >= t.value - 1e-9;
    return { target: t, value: v, met, detail: `${t.text}: ${round(v, 2)} ${k.unit} (${t.kind === 'max' ? '≤' : '≥'} ${t.value})` };
  });
}

export const compareOptions: Tool<{ result: ScenarioResult; targets: Target[] }, { optionId: string; feasible: boolean; meetsGoal: boolean; score: number; checks: TargetCheck[] }[]> = {
  contract: {
    name: 'compare_interventions',
    description: 'Score every candidate against the baseline and check it against the goal\'s targets and constraints.',
    version: '1.0',
    parameters: [
      { name: 'result', type: 'object', required: true, description: 'ScenarioResult' },
      { name: 'targets', type: 'array', required: true, description: 'targets parsed from the goal' },
    ],
    outputs: { type: 'array', description: 'per option: feasibility, goal check and score' },
  },
  consequential: false,
  run: ({ result, targets }) =>
    result.options.map((o) => {
      const checks = checkTargets(result, o, targets);
      return { optionId: o.id, feasible: o.feasible, meetsGoal: checks.every((c) => c.met), score: result.recommendation.scores[o.id] ?? -Infinity, checks };
    }),
};

export interface ExecutionRecord {
  optionId: string;
  scenarioId: string;
  inputsKey: string;
  approvedBy: string;
  actions: string[];
  /** monotonic sequence number, not a wall-clock time (keeps runs deterministic) */
  seq: number;
}

export const executeAction: Tool<{ result: ScenarioResult; optionId: string; approval: { by: string; role: string } | null; seq: number }, ExecutionRecord> = {
  contract: {
    name: 'execute_simulated_action',
    description: 'Apply the chosen intervention to the simulated twin (updates the 3D view). Requires operator approval. Never touches real infrastructure.',
    version: '1.0',
    parameters: [
      { name: 'result', type: 'object', required: true, description: 'the evaluated ScenarioResult' },
      { name: 'optionId', type: 'string', required: true, description: 'the intervention to apply' },
      { name: 'approval', type: 'object', required: true, description: 'who approved, and their role (must be operator)' },
    ],
    outputs: { type: 'object', description: 'a log record of the simulated action' },
  },
  consequential: true,
  run: ({ result, optionId, approval, seq }) => {
    if (!approval) throw new ToolError('execute_simulated_action', 'Blocked: no human approval was given.');
    if (approval.role !== 'operator') throw new ToolError('execute_simulated_action', `Blocked: role "${approval.role}" is not authorised to approve actions (operator required).`);
    const o = result.options.find((q) => q.id === optionId);
    if (!o) throw new ToolError('execute_simulated_action', `Unknown option "${optionId}".`);
    if (!o.feasible) throw new ToolError('execute_simulated_action', `Option "${o.name}" is not feasible: ${o.infeasibleWhy ?? 'see the comparison'}.`);
    return { optionId, scenarioId: result.scenarioId, inputsKey: result.inputsKey, approvedBy: approval.by, actions: o.actions, seq };
  },
};

export interface Verification {
  reproduced: boolean;
  checks: TargetCheck[];
  improved: { kpi: string; label: string; before: number | null; after: number | null; abs: number | null; pct: number | null }[];
  remainingRisks: string[];
}

export const verifyOutcome: Tool<{ scenarioId: string; inputs: InputValues; record: ExecutionRecord; targets: Target[] }, Verification> = {
  contract: {
    name: 'verify_outcome',
    description: 'Re-run the model independently with the same inputs, confirm the executed option reproduces, and check the targets.',
    version: '1.0',
    parameters: [
      { name: 'scenarioId', type: 'string', required: true, description: 'scenario model id' },
      { name: 'inputs', type: 'object', required: true, description: 'the inputs the plan was made with' },
      { name: 'record', type: 'object', required: true, description: 'the execution record' },
      { name: 'targets', type: 'array', required: true, description: 'targets parsed from the goal' },
    ],
    outputs: { type: 'object', description: 'verification checks and remaining risks' },
  },
  consequential: false,
  run: ({ scenarioId, inputs, record, targets }) => {
    const r = runScenario.run({ scenarioId, inputs });
    const o = r.options.find((q) => q.id === record.optionId);
    if (!o) throw new ToolError('verify_outcome', `The executed option "${record.optionId}" is missing on re-run.`);
    const reproduced = r.inputsKey === record.inputsKey;
    const checks = checkTargets(r, o, targets);
    const improved = r.kpis.map((k) => {
      const before = r.baseline.kpis[k.id] ?? null;
      const after = o.kpis[k.id] ?? null;
      return { kpi: k.id, label: k.label, before, after, ...change(before, after) };
    });
    const worse = improved.filter((i) => {
      const k = r.kpis.find((q) => q.id === i.kpi)!;
      return i.abs !== null && Math.abs(i.abs) > 1e-9 && (k.better === 'lower' ? i.abs > 0 : i.abs < 0);
    });
    const remainingRisks = [
      ...checks.filter((c) => !c.met).map((c) => `Target not met — ${c.detail}`),
      ...worse.map((w) => `${w.label} gets worse: ${round(w.before ?? 0, 2)} → ${round(w.after ?? 0, 2)}`),
      ...r.unavailable.map((u) => `${u.metric} not assessed (needs ${u.needs})`),
      ...r.limitations,
    ];
    return { reproduced, checks, improved, remainingRisks };
  },
};

export const TOOLS = [inspectAssets, readSensors, runScenario, compareOptions, executeAction, verifyOutcome];
