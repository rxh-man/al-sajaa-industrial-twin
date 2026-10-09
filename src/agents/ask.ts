import { COSTS, INCIDENT, POI, formatMoney } from '../data/incident';
import { CREWS } from './crews';
import { crewStatus, type AgentEntry, type AgentRun, type Policy, type Question } from './brain';
import { AGENT_BY_ID } from './team';

/** Everything the agents know at this moment, as plain facts the language model may use. */
export function factsNow(run: AgentRun, shown: AgentEntry[], policy: Policy, gate: Question | null, t: number, active: boolean, resolved: boolean) {
  return {
    status: !active ? 'watching, nothing wrong' : gate ? 'paused, asking the operator a question' : resolved ? 'finished' : 'working on a leak',
    autonomy: { mode: policy.autonomy, spendLimitWithoutAsking: policy.autonomy === 'limits' ? formatMoney(policy.spendLimit) : null },
    incident: active
      ? {
          what: 'likely leak in the main water pipe',
          where: `under ${INCIDENT.road}, area ${INCIDENT.sector}, Al Sajaa industrial district, Sharjah`,
          sure: `${INCIDENT.confidence}%`,
          couldBurstIn: `${INCIDENT.failureWindow[0]}-${INCIDENT.failureWindow[1]} hours`,
          peopleAffected: INCIDENT.population,
          nearby: [`${POI.hospital.name} ${POI.hospital.distanceM} m away`, `${POI.school.name} ${POI.school.distanceM} m away`],
        }
      : null,
    costs: { repairNow: formatMoney(run.fix.cost), ifItBursts: formatMoney(COSTS.failure), saved: run.lasting ? formatMoney(COSTS.avoided) : null },
    waitingFor: gate ? { question: gate.ask, choices: gate.choices.map((c) => `${c.id === gate.recommended ? "RECOMMENDED: " : ""}${c.label} (${c.off ? "ruled out: " + c.off : c.note})`), why: gate.why } : null,
    done: shown.map((e) => ({
      agent: AGENT_BY_ID[e.agent].name,
      did: e.title,
      detail: e.detail,
      allowedBy: e.how ?? null,
      checks: e.checks?.map((c) => `${c.ok ? 'passed' : 'failed'}: ${c.label}`),
      compared: e.options?.map((o) => `${o.chosen ? 'CHOSEN' : 'not chosen'}: ${o.label} (${o.note})`),
    })),
    crews: CREWS.map((c) => ({ crew: c.name, people: c.people, status: crewStatus(c, run, t, active).label })),
  };
}

type Facts = ReturnType<typeof factsNow>;

/** Answers from the same facts without a model — used when Qwen isn't reachable. */
export function builtInAnswer(q: string, f: Facts): string {
  const s = q.toLowerCase();
  const find = (re: RegExp) => f.done.find((d) => re.test(d.did));
  if (!f.incident) return 'Everything is normal. Watch is checking the sensors across downtown and nothing needs fixing right now.';
  if (/crew|team|who|send|dispatch/.test(s)) {
    const d = find(/^Sent Crew 07/);
    return d ? `${d.did}. ${d.compared?.filter((c) => !c.startsWith('CHOSEN')).map((c) => c.replace('not chosen: ', '')).join('; ')}.` : 'No crew has been sent yet. Dispatch picks the closest free crew with the right skills once the plan is set.';
  }
  if (/hospital|school|safe|ambulance|people/.test(s)) return `${f.incident.peopleAffected.toLocaleString('en-US')} people rely on this pipe; ${f.incident.nearby.join(' and ')}. Water is sent around the break so nobody loses it, and one lane stays open for ambulances.`;
  if (/cost|money|price|save|cheap/.test(s)) return `Fixing it now costs ${f.costs.repairNow}. If it bursts it would cost about ${f.costs.ifItBursts}${f.costs.saved ? `, so this saves ${f.costs.saved}` : ''}.`;
  if (/road|traffic|lane|close/.test(s)) {
    const d = find(/lane|closure|Close/);
    return d ? `${d.did}: ${d.detail}.` : 'No road closure has been decided yet.';
  }
  if (/fix|replace|clamp|why|plan|choose|chose/.test(s)) {
    const d = find(/^Going to/);
    return d ? `${d.did}. ${d.detail}.` : f.waitingFor ? `${f.waitingFor.question} ${f.waitingFor.why}` : 'The agents are still working out the best fix.';
  }
  const last = f.done[f.done.length - 1];
  return last ? `Latest: ${last.agent} — ${last.did}.` : 'The agents are looking into it.';
}

export async function askAgents(question: string, facts: Facts, signal: AbortSignal): Promise<{ answer: string; by: 'qwen' | 'built-in' }> {
  try {
    const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, facts }), signal });
    if (r.ok) {
      const j = (await r.json()) as { answer?: string };
      if (j.answer) return { answer: j.answer, by: 'qwen' };
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
  }
  return { answer: builtInAnswer(question, facts), by: 'built-in' };
}
