/**
 * POST /api/ask — lets the operator ask the agents why they did something. Qwen (Alibaba
 * Model Studio) answers from the run's facts only; it can explain decisions but never make
 * or change them. The key stays on the server (.env.local in dev, a Worker secret in
 * production) and is never sent to the browser.
 *
 * Shared by the Vite dev/preview middleware (vite.config.ts) and the Cloudflare Worker
 * (worker/index.ts).
 */
export interface AskEnv {
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_BASE_URL?: string;
  QWEN_MODEL?: string;
}

export interface AskResult {
  status: number;
  body: unknown;
}

const SYSTEM = [
  "You are Al Sajaa Twin, a team of six AI agents (Watch, Diagnose, Plan, Patch, Dispatch, Verify) that look after the underground pipes and cables of downtown Abu Dhabi.",
  'Answer the operator in plain, friendly words, at most 3 short sentences, in the language named in the request.',
  'Use ONLY the FACTS JSON. Never invent numbers, names, places or actions. Only say something happened if it is in facts.done.',
  "If the facts don't answer the question, say you don't know yet.",
  'You cannot approve, stop or change anything; if asked, tell the operator to use the controls in the agents panel.',
  'This is a demo: the streets and buildings are real (OpenStreetMap), the leak, sensors, crews and costs are simulated.',
].join(' ');

export const MAX_ASK_BODY = 24_000;

/** Answers one ask request; `raw` is the JSON request body. */
export async function askQwen(env: AskEnv, raw: string): Promise<AskResult> {
  if (!env.DASHSCOPE_API_KEY) return { status: 503, body: { error: 'offline' } };
  try {
    const { question, facts } = JSON.parse(raw) as { question?: unknown; facts?: unknown };
    if (typeof question !== 'string' || !question.trim() || question.length > 400) return { status: 400, body: { error: 'question' } };
    const language = /[؀-ۿ]/.test(question) ? 'Arabic' : 'English';
    const model = env.QWEN_MODEL || 'qwen3.8-flash';
    const r = await fetch(`${env.DASHSCOPE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 220,
        enable_thinking: false,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `FACTS:\n${JSON.stringify(facts).slice(0, 12_000)}\n\nQUESTION: ${question.trim()}\n\nAnswer in ${language}.` },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return { status: 502, body: { error: 'upstream' } };
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const answer = j.choices?.[0]?.message?.content?.trim();
    if (!answer) return { status: 502, body: { error: 'empty' } };
    return { status: 200, body: { answer, model } };
  } catch {
    return { status: 502, body: { error: 'unavailable' } };
  }
}
