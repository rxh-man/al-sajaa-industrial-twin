import { scenarioById } from '../solutions/registry';
import { parseGoal, sanitiseGoal, WORKFLOWS, type ParsedGoal, type Target } from './goal';

/**
 * Optional language-model goal reading (POST /api/agent-goal, server-side key). The model proposes a structured
 * reading; this module validates every field against the scenario models before the deterministic loop uses it.
 * When the endpoint is offline or the proposal is invalid, the rule-based parser is used instead and the panel
 * says which one read the goal. The model never calls tools, approves or executes.
 */

export const STEPS_LLM_NOTE =
  'Goals are read by deterministic rules unless a language model is configured on the server (AGENT_LLM_* or DASHSCOPE_* keys). Even then the model only proposes a structured reading; the scenario models, scoring, approval and verification are deterministic code.';

export function catalogue() {
  return WORKFLOWS.filter((w) => w.scenarioId).map((w) => {
    const d = scenarioById(w.scenarioId!)!;
    let kpis: { id: string; label: string; unit: string; better: string }[] = [];
    try {
      kpis = d.run(d.defaults).kpis.map((k) => ({ id: k.id, label: k.label, unit: k.unit, better: k.better }));
    } catch {
      kpis = [];
    }
    return {
      workflow: w.id,
      title: w.title,
      problem: d.problem,
      inputs: d.inputs.map((i) => (i.kind === 'range' ? { id: i.id, label: i.label, min: i.min, max: i.max, unit: i.unit } : i.kind === 'select' ? { id: i.id, label: i.label, options: i.options.map((o) => o.value) } : { id: i.id, label: i.label, type: 'boolean' })),
      kpis,
    };
  });
}

export interface ModelReading {
  parsed: ParsedGoal;
  source: 'llm' | 'rules';
  model?: string;
  note: string;
}

/** validate a model proposal into a ParsedGoal; anything not matching the catalogue is dropped and listed */
export function validateProposal(goalText: string, proposal: unknown): ParsedGoal | null {
  const text = sanitiseGoal(goalText);
  if (!proposal || typeof proposal !== 'object') return null;
  const p = proposal as { workflow?: unknown; inputs?: unknown; targets?: unknown; notes?: unknown };
  const w = WORKFLOWS.find((x) => x.id === p.workflow && x.scenarioId);
  if (!w) return null;
  const def = scenarioById(w.scenarioId!)!;
  const out: ParsedGoal = { text, workflow: w, inputs: {}, targets: [], understood: [`Workflow: ${w.title} (language model)`], problems: [] };
  if (p.inputs && typeof p.inputs === 'object') {
    for (const [k, v] of Object.entries(p.inputs as Record<string, unknown>)) {
      const spec = def.inputs.find((i) => i.id === k);
      if (!spec) {
        out.problems.push(`Model input "${k}" is not an input of ${def.title}; dropped.`);
        continue;
      }
      if (spec.kind === 'range' && typeof v === 'number' && Number.isFinite(v) && v >= spec.min && v <= spec.max) {
        out.inputs[k] = v;
        out.understood.push(`${spec.label} ${v}${spec.unit ? ' ' + spec.unit : ''}`);
      } else if (spec.kind === 'select' && typeof v === 'string' && spec.options.some((o) => o.value === v)) {
        out.inputs[k] = v;
        out.understood.push(`${spec.label}: ${v}`);
      } else out.problems.push(`Model value for "${k}" is outside its declared range or options; dropped.`);
    }
  }
  let kpiIds: string[] = [];
  try {
    kpiIds = def.run(def.defaults).kpis.map((k) => k.id);
  } catch {
    kpiIds = [];
  }
  if (Array.isArray(p.targets)) {
    for (const t of p.targets as Record<string, unknown>[]) {
      const ok = t && typeof t.kpi === 'string' && kpiIds.includes(t.kpi) && ['reduce-pct', 'max', 'min'].includes(String(t.kind)) && typeof t.value === 'number' && Number.isFinite(t.value);
      if (!ok) {
        out.problems.push('A model target did not match a KPI of this workflow; dropped.');
        continue;
      }
      const target: Target = { kpi: t.kpi as string, kind: t.kind as Target['kind'], value: t.value as number, text: typeof t.text === 'string' ? sanitiseGoal(t.text).slice(0, 80) : `${t.kind} ${t.kpi} ${t.value}` };
      out.targets.push(target);
      out.understood.push(`Target: ${target.text}`);
    }
  }
  return out;
}

/** ask the server-side model; fall back to the rule-based parser (and say so) on any failure */
export async function readGoal(goalText: string, fetcher: typeof fetch = fetch): Promise<ModelReading> {
  const rules = (note: string): ModelReading => ({ parsed: parseGoal(goalText), source: 'rules', note });
  try {
    const r = await fetcher('/api/agent-goal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: sanitiseGoal(goalText), catalogue: catalogue() }), signal: AbortSignal.timeout(20_000) });
    if (r.status === 503) return rules('Language model not configured on the server: goal read by deterministic rules.');
    if (!r.ok) return rules(`Language model unavailable (HTTP ${r.status}): goal read by deterministic rules.`);
    const j = (await r.json()) as { proposal?: unknown; model?: string };
    const parsed = validateProposal(goalText, j.proposal);
    if (!parsed) return rules('The model\'s reading did not match any workflow: goal read by deterministic rules.');
    return { parsed, source: 'llm', model: j.model, note: `Goal read by ${j.model ?? 'a language model'}; every field validated against the scenario models.` };
  } catch {
    return rules('Language model endpoint not reachable: goal read by deterministic rules.');
  }
}
