/**
 * POST /api/agent-goal — optional language-model reading of an operator's goal for the AI Operations Agent.
 *
 * The model only PROPOSES a structured reading (workflow, scenario inputs, targets) as JSON; it never runs tools,
 * approves or executes anything. The browser validates the proposal against the scenario models' declared inputs
 * and KPIs before the deterministic loop uses it, and falls back to the rule-based parser when this endpoint is
 * offline. The key stays on the server (.env.local in dev); without one the endpoint answers 503 "offline".
 *
 * Provider: any OpenAI-compatible chat endpoint (the same DashScope/Qwen settings as /api/ask by default).
 */
export interface GoalEnv {
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_BASE_URL?: string;
  QWEN_MODEL?: string;
  AGENT_LLM_API_KEY?: string;
  AGENT_LLM_BASE_URL?: string;
  AGENT_LLM_MODEL?: string;
}

export const MAX_GOAL_BODY = 40_000;

const SYSTEM = [
  'You read an operator goal for a simulated smart-city digital twin and map it to ONE workflow from the catalogue.',
  'Reply with JSON only: {"workflow": "<id>", "inputs": {"<inputId>": <value>}, "targets": [{"kpi": "<kpiId>", "kind": "reduce-pct" | "max" | "min", "value": <number>, "text": "<short phrase>"}], "notes": "<one sentence>"}.',
  'Use only workflow ids, input ids and KPI ids from the catalogue; numbers must respect the stated ranges; select inputs must use a listed value.',
  'Only include inputs and targets the goal actually states. If nothing fits, reply {"workflow": null, "notes": "<why>"}.',
].join(' ');

export async function interpretGoal(env: GoalEnv, raw: string, fetcher: typeof fetch = fetch): Promise<{ status: number; body: unknown }> {
  const key = env.AGENT_LLM_API_KEY || env.DASHSCOPE_API_KEY;
  const base = env.AGENT_LLM_BASE_URL || env.DASHSCOPE_BASE_URL;
  if (!key || !base) return { status: 503, body: { error: 'offline' } };
  let goal: unknown;
  let catalogue: unknown;
  try {
    ({ goal, catalogue } = JSON.parse(raw) as { goal?: unknown; catalogue?: unknown });
  } catch {
    return { status: 400, body: { error: 'json' } };
  }
  if (typeof goal !== 'string' || !goal.trim() || goal.length > 400) return { status: 400, body: { error: 'goal' } };
  if (!catalogue || typeof catalogue !== 'object') return { status: 400, body: { error: 'catalogue' } };
  const model = env.AGENT_LLM_MODEL || env.QWEN_MODEL || 'qwen3.8-flash';
  try {
    const r = await fetcher(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `CATALOGUE:\n${JSON.stringify(catalogue).slice(0, 30_000)}\n\nGOAL: ${goal.trim()}` },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return { status: 502, body: { error: 'upstream' } };
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content?.trim() ?? '';
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const proposal = JSON.parse(json);
    return { status: 200, body: { proposal, model } };
  } catch {
    return { status: 502, body: { error: 'unavailable' } };
  }
}
