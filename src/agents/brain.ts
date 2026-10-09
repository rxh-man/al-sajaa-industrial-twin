import { T } from '../simulation/timeline';
import { COSTS, INCIDENT, POI, formatMoney } from '../data/incident';
import { CREWS, type Crew, type Skill } from './crews';
import type { AgentId } from './team';

/**
 * How the agents decide. Everything here is a pure function of the operator's
 * limits and their answers, so the demo clock can pause, seek and replay exactly.
 *
 * While they work, the agents put their real choices to the operator as short
 * multiple-choice questions, each with the option they recommend and the ones
 * their rules rule out. What happens next depends on the answer:
 *  - Full auto: nobody is asked; the agents take their recommendation.
 *  - With limits: the agents ask, and go with their recommendation after a short
 *    countdown, unless it breaks a limit; then they wait for a person.
 *  - Ask me: every question waits for a person.
 */

export type Autonomy = 'full' | 'limits' | 'ask';
export type QuestionId = 'fix' | 'road' | 'notify';
/** Who settled a question: the operator, the countdown (the agents' recommendation), or the agents alone. */
export type AnsweredBy = 'you' | 'default' | 'agents';
export type How = 'auto' | 'chose' | 'approved' | 'default' | 'waiting';

export interface Answer {
  choice: string;
  by: AnsweredBy;
}
export type Answers = Partial<Record<QuestionId, Answer>>;

export interface Policy {
  autonomy: Autonomy;
  spendLimit: number;
}

export const DEFAULT_POLICY: Policy = { autonomy: 'limits', spendLimit: 1_000_000 };
export const SPEND_LIMITS = [400_000, 1_000_000, 4_000_000] as const;
/** Seconds a question stays open in "With limits" before the agents go with their recommendation. */
export const COUNTDOWN_S = 9;

export interface Check {
  label: string;
  ok: boolean;
}

export interface Option {
  label: string;
  note: string;
  chosen?: boolean;
}

export interface Choice {
  id: string;
  label: string;
  note: string;
  /** A real downside the operator should weigh. */
  warn?: string;
  /** Set when the agents' rules rule this choice out (shown, but can't be picked). */
  off?: string;
}

export interface Question {
  id: QuestionId;
  n: number;
  of: number;
  t: number;
  agent: AgentId;
  ask: string;
  context: string;
  choices: Choice[];
  recommended: string;
  /** True when the clock waits for a person; false when the agents go with their pick after the countdown. */
  waits: boolean;
  why: string;
}

export interface AgentEntry {
  id: string;
  t: number;
  agent: AgentId;
  title: string;
  detail: string;
  /** What the agent did, step by step (revealed as the clock runs). */
  steps?: string[];
  /** Set on actions and decisions: who allowed it. */
  how?: How;
  /** The decision came from this question. */
  q?: QuestionId;
  checks?: Check[];
  options?: Option[];
  tone?: 'warn';
}

export interface AgentRun {
  entries: AgentEntry[];
  questions: Question[];
  fix: Fix;
  road: Road;
  notify: Notify;
  crew: Crew;
  sideCrew: Crew;
  riskAfter: number;
  lasting: boolean;
}

/* ------------------------------------------------------------------ */
/* Choices the agents weigh                                            */
/* ------------------------------------------------------------------ */

interface Fix {
  id: 'replace' | 'clamp' | 'wait';
  label: string;
  short: string;
  cost: number;
  riskAfter: number;
  lasting: boolean;
}

const FIXES: Fix[] = [
  { id: 'replace', label: 'Replace the damaged 3 m section', short: 'replace the pipe section', cost: COSTS.preventive, riskAfter: INCIDENT.riskAfter, lasting: true },
  { id: 'clamp', label: 'Put a temporary clamp on it', short: 'clamp the leak for now', cost: 150_000, riskAfter: 58, lasting: false },
  { id: 'wait', label: 'Wait and watch', short: 'wait', cost: 0, riskAfter: INCIDENT.riskFuture, lasting: false },
];

const FIX_NOTE: Record<Fix['id'], string> = {
  replace: `${formatMoney(COSTS.preventive)} · lasting fix`,
  clamp: `${formatMoney(150_000)} · likely to leak again within weeks`,
  wait: `Nothing now · about ${formatMoney(COSTS.failure)} if it bursts`,
};

/** Money now plus the chance it still fails times what a burst costs. Lower is better. */
const expectedCost = (f: Fix) => f.cost + (f.riskAfter / 100) * COSTS.failure;
const RANKED_FIXES = [...FIXES].sort((a, b) => expectedCost(a) - expectedCost(b));
const BEST_FIX = RANKED_FIXES[0];

interface Road {
  id: 'lane' | 'street' | 'night';
  label: string;
  done: string;
  note: string;
  hours: number;
  keepsAccess: boolean;
}

const ROADS: Road[] = [
  { id: 'lane', label: 'Close one lane for 6 hours', done: 'Closed one lane of Khalifa Street for 6 hours', note: 'Ambulances still get through', hours: 6, keepsAccess: true },
  { id: 'street', label: 'Close the whole street for 4 hours', done: 'Closed Khalifa Street for 4 hours', note: 'Faster, but ambulances take a 4-minute detour', hours: 4, keepsAccess: false },
  { id: 'night', label: 'Wait for tonight, no closure', done: 'Moved the work to tonight', note: 'No traffic, but the crew starts 10 hours later', hours: 0, keepsAccess: true },
];

interface Notify {
  id: 'near' | 'all' | 'none';
  label: string;
  done: string;
  note: string;
}

const NOTIFY: Notify[] = [
  { id: 'near', label: 'The hospital and the buildings by the dig', done: 'Told the hospital and the buildings by the dig', note: 'Water stays on, so only they need to know' },
  { id: 'all', label: `Text all ${INCIDENT.population.toLocaleString('en-US')} residents`, done: `Texted all ${INCIDENT.population.toLocaleString('en-US')} residents`, note: 'Safe, but most people won’t notice anything' },
  { id: 'none', label: 'Don’t tell anyone', done: 'Told no one about the work', note: 'The hospital won’t expect the road works' },
];

function whyNot(c: Crew, skill: Skill): string | null {
  if (!c.skills.includes(skill)) return skill === 'water-main' && c.skills.includes('water-service') ? "Can't handle a pipe this size" : 'Wrong skills for this job';
  return c.busy ?? null;
}

export function chooseCrew(skill: Skill) {
  const considered = CREWS.filter((c) => c.skills.some((s) => s.startsWith(skill.split('-')[0])));
  const free = considered.filter((c) => !whyNot(c, skill)).sort((a, b) => a.minutesAway - b.minutesAway);
  return { pick: free[0], considered };
}

/* ------------------------------------------------------------------ */
/* The questions                                                       */
/* ------------------------------------------------------------------ */

export const Q_T: Record<QuestionId, number> = { fix: T.plan, road: T.plan + 1.4, notify: T.dispatch - 0.5 };

/** The questions this run will put to the operator, in order (none in Full auto). */
export function questionsFor(policy: Policy): Question[] {
  if (policy.autonomy === 'full') return [];
  const ask = policy.autonomy === 'ask';
  const limit = formatMoney(policy.spendLimit);
  const overLimit = policy.autonomy === 'limits' && BEST_FIX.cost > policy.spendLimit;
  const inside = `Inside your ${limit} limit, so we go with our pick unless you choose.`;
  const youAsked = 'You asked to answer every choice yourself.';

  const qs: Omit<Question, 'n' | 'of'>[] = [
    {
      id: 'fix',
      t: Q_T.fix,
      agent: 'plan',
      ask: 'How should we fix the leaking pipe?',
      context: `${INCIDENT.confidence}% sure it is leaking · could burst in ${INCIDENT.failureWindow[0]}–${INCIDENT.failureWindow[1]} h`,
      choices: RANKED_FIXES.map((f) => ({
        id: f.id,
        label: f.label,
        note: FIX_NOTE[f.id],
        warn: f.id === 'replace' && overLimit ? `Over your ${limit} limit` : f.id === 'clamp' ? 'Risk stays at 58' : undefined,
        off: f.id === 'wait' ? 'Could burst before a crew gets there' : undefined,
      })),
      recommended: BEST_FIX.id,
      waits: ask || overLimit,
      why: ask ? youAsked : overLimit ? `Our pick is over your ${limit} limit, so we need your OK.` : inside,
    },
    {
      id: 'road',
      t: Q_T.road,
      agent: 'plan',
      ask: 'How should we handle traffic on Khalifa Street?',
      context: `${POI.hospital.name} is ${POI.hospital.distanceM} m away and its ambulances use this street`,
      choices: ROADS.map((r) => ({
        id: r.id,
        label: r.label,
        note: r.note,
        warn: r.keepsAccess ? undefined : 'Blocks the ambulance route',
        off: r.id === 'night' ? `We should start within ${INCIDENT.respondWithinHours} hours` : undefined,
      })),
      recommended: 'lane',
      waits: ask,
      why: ask ? youAsked : 'Road closures are inside your limits, so we go with our pick unless you choose.',
    },
    {
      id: 'notify',
      t: Q_T.notify,
      agent: 'dispatch',
      ask: 'Who should we tell before the crew leaves?',
      context: 'Water stays on: it is sent around the break',
      choices: NOTIFY.map((o) => ({ id: o.id, label: o.label, note: o.note, warn: o.id === 'none' ? 'Not recommended' : undefined })),
      recommended: 'near',
      waits: ask,
      why: ask ? youAsked : 'Messages are inside your limits, so we go with our pick unless you choose.',
    },
  ];
  return qs.map((q, i) => ({ ...q, n: i + 1, of: qs.length }));
}

/** The first question at or after `after` that nobody has answered yet. */
export function nextQuestion(policy: Policy, answers: Answers, after = -Infinity): Question | null {
  return questionsFor(policy).find((q) => !answers[q.id] && q.t > after) ?? null;
}

/** The choice in force for a question: the operator's answer, else the agents' pick. */
function choiceOf(id: QuestionId, answers: Answers, recommended: string) {
  return answers[id]?.choice ?? recommended;
}

/* ------------------------------------------------------------------ */
/* The run: what each agent does and when                              */
/* ------------------------------------------------------------------ */

export const SIDE_JOB_T = T.predict + 1.5;
/** Decisions land just after their question, so a held clock shows the question, not the answer. */
const AFTER = 0.05;

export function buildRun(policy: Policy, answers: Answers): AgentRun {
  const questions = questionsFor(policy);
  const asked = (id: QuestionId) => questions.find((q) => q.id === id);

  /** Who settled a question, as shown on the decision it led to. */
  const howOf = (id: QuestionId): How => {
    if (!asked(id)) return 'auto';
    const a = answers[id];
    if (!a) return 'waiting';
    return a.by === 'you' ? 'chose' : a.by === 'default' ? 'default' : 'auto';
  };
  const byLine = (id: QuestionId) => {
    const how = howOf(id);
    return how === 'chose' ? 'You chose this' : how === 'default' ? 'No answer in time · went with our pick' : how === 'waiting' ? 'Waiting for your answer' : policy.autonomy === 'full' ? 'Decided alone (Full auto)' : 'Inside your limits';
  };

  const fix = FIXES.find((f) => f.id === choiceOf('fix', answers, BEST_FIX.id))!;
  const road = ROADS.find((r) => r.id === choiceOf('road', answers, 'lane'))!;
  const notify = NOTIFY.find((o) => o.id === choiceOf('notify', answers, 'near'))!;
  const fixQ = asked('fix');
  // a person said yes to something over a limit (or in "Ask me"): the actions that follow carry their OK
  const actHow: How = fixQ?.waits && answers.fix?.by === 'you' ? 'approved' : 'auto';

  const { pick: crew, considered } = chooseCrew('water-main');
  const sideCrew = chooseCrew('electric').pick;
  const limitLabel = policy.autonomy === 'full' ? null : `Under your ${formatMoney(policy.spendLimit)} limit`;

  const entries: AgentEntry[] = [
    {
      id: 'spot',
      t: T.anomaly,
      agent: 'watch',
      title: 'Spotted small changes near area B-12',
      detail: 'Pressure down 2.7% · ground getting wetter',
      steps: ['Read 216 sensors across downtown', '3 pressure sensors in B-12 down 2.7%', 'Ground near Khalifa Street getting wetter'],
    },
    {
      id: 'link',
      t: T.pattern,
      agent: 'watch',
      title: 'Linked 6 sensors to one cause',
      detail: 'Each change alone looks harmless',
      steps: ['Compared them with the last 30 days', 'Pressure, wet ground and heat line up', 'Handed it to Diagnose'],
    },
    {
      id: 'leak',
      t: T.leak,
      agent: 'diagnose',
      title: 'Found a likely leak in the main water pipe',
      detail: `${INCIDENT.confidence}% sure · 2 m under ${INCIDENT.road}`,
      steps: ['Traced the pipes under area B-12', `Narrowed it to pipe ${INCIDENT.asset}`, 'Pinned the spot to within 3 m'],
    },
    {
      id: 'when',
      t: T.predict,
      agent: 'diagnose',
      title: `It could burst in ${INCIDENT.failureWindow[0]}–${INCIDENT.failureWindow[1]} hours`,
      detail: 'Based on how fast the pressure is dropping',
      steps: ['Pressure is dropping faster each hour', 'Played the next 3 days forward', `Burst likely in ${INCIDENT.failureWindow[0]}–${INCIDENT.failureWindow[1]} h`],
    },
    {
      id: 'side',
      t: SIDE_JOB_T,
      agent: 'dispatch',
      title: `Sent ${sideCrew.name} to a streetlight fault in area C-13`,
      detail: `Small job, ${sideCrew.minutesAway} min away · Crew 07 kept free for the pipe`,
      steps: ['A streetlight is out in area C-13', `${sideCrew.name} is free, ${sideCrew.minutesAway} min away`, 'Kept Crew 07 free for the pipe'],
      how: 'auto',
      checks: [
        { label: 'Small job, under AED 20K', ok: true },
        { label: 'Crew 07 stays free', ok: true },
      ],
    },
    {
      id: 'who',
      t: T.impact,
      agent: 'plan',
      title: `${INCIDENT.population.toLocaleString('en-US')} people and a hospital rely on this pipe`,
      detail: `Hospital ${POI.hospital.distanceM} m away · school ${POI.school.distanceM} m away`,
      steps: [`Found ${INCIDENT.population.toLocaleString('en-US')} people on this pipe`, `${POI.hospital.name}, ${POI.hospital.distanceM} m away`, `${POI.school.name}, ${POI.school.distanceM} m away`],
    },
    {
      id: 'fix',
      t: Q_T.fix + AFTER,
      agent: 'plan',
      q: 'fix',
      title: fix.id === BEST_FIX.id ? `Going to ${fix.short}` : `Going to ${fix.short} instead`,
      detail: fix.lasting ? 'Cheapest once you count the risk of a burst' : 'Stops the leak now · the full repair still needs doing',
      steps: ['Priced 3 fixes against the risk of a burst', limitLabel ? `Checked your ${formatMoney(policy.spendLimit)} limit` : 'No limits set: Full auto', byLine('fix')],
      how: howOf('fix'),
      checks: [
        ...(limitLabel ? [{ label: limitLabel, ok: fix.cost <= policy.spendLimit }] : []),
        { label: 'Lasting fix', ok: fix.lasting },
      ],
      options: RANKED_FIXES.map((f) => ({ label: f.label, note: FIX_NOTE[f.id], chosen: f.id === fix.id })),
      tone: fix.lasting ? undefined : 'warn',
    },
    {
      id: 'road',
      t: Q_T.road + AFTER,
      agent: 'plan',
      q: 'road',
      title: road.done,
      detail: road.note,
      steps: ['Checked the ambulance routes', `Compared ${ROADS.length} ways to work on the street`, byLine('road')],
      how: howOf('road'),
      checks: [
        { label: 'Hospital access stays open', ok: road.keepsAccess },
        { label: 'Done well before it could burst', ok: true },
      ],
      options: ROADS.map((o) => ({ label: o.label, note: o.note, chosen: o === road })),
      tone: road.keepsAccess ? undefined : 'warn',
    },
    {
      id: 'valves',
      t: T.repair,
      agent: 'patch',
      title: 'Closed 2 valves remotely',
      detail: 'Water to the damaged part is off',
      steps: ['Closed valve V-B12-02', 'Closed valve V-B12-03', 'The damaged part is cut off'],
      how: actHow,
      checks: [
        { label: 'Can be undone', ok: true },
        { label: 'Takes seconds, no crew needed', ok: true },
      ],
    },
    {
      id: 'reroute',
      t: T.reroute,
      agent: 'patch',
      title: 'Sent water around the break',
      detail: 'No homes lost water',
      steps: ['Opened the loop between areas A and B', 'Pressure at homes is holding', 'No homes lost water'],
      how: actHow,
      checks: [
        { label: 'Can be undone', ok: true },
        { label: 'No homes lose water', ok: true },
      ],
    },
    {
      id: 'notify',
      t: Q_T.notify + AFTER,
      agent: 'dispatch',
      q: 'notify',
      title: notify.done,
      detail: notify.note,
      steps: [`${road.keepsAccess ? 'One lane' : 'The street'} will be closed near the hospital`, 'Water stays on for everyone', byLine('notify')],
      how: howOf('notify'),
      tone: notify.id === 'none' ? 'warn' : undefined,
    },
    {
      id: 'crew',
      t: T.dispatch,
      agent: 'dispatch',
      title: `Sent ${crew.name} with ${fix.id === 'clamp' ? 'a repair clamp' : 'a new pipe section'}`,
      detail: `${crew.people} people · arriving in ${crew.minutesAway} min`,
      steps: [`Checked ${considered.length} crews`, ...considered.filter((c) => c !== crew && c.busy).map((c) => `${c.name} is busy: ${c.busy!.toLowerCase()}`), `${crew.name}: ${crew.minutesAway} min away, has pipe welders`],
      how: actHow,
      checks: [
        { label: 'Crew has the right skills', ok: true },
        { label: 'Arrives in under 6 hours', ok: true },
      ],
      options: considered.map((c) => ({ label: c.name, note: c === crew ? `${c.minutesAway} min away · has pipe welders` : (whyNot(c, 'water-main') ?? ''), chosen: c === crew })),
    },
    {
      id: 'onsite',
      t: T.arrive,
      agent: 'dispatch',
      title: `${crew.name} is on site`,
      detail: fix.id === 'clamp' ? 'Fitting the clamp' : 'Replacing the damaged section',
      steps: [road.keepsAccess ? 'One lane closed, ambulances get through' : 'Street closed, ambulances on a detour', fix.id === 'clamp' ? 'Fitting the clamp' : 'Cutting out the damaged 3 m'],
    },
    {
      id: 'test',
      t: T.restore,
      agent: 'verify',
      title: 'Pressure is back to normal',
      detail: 'No more signs of a leak',
      steps: ['Reopened both valves', 'Pressure back to 3.92 bar', 'No more signs of a leak'],
    },
    fix.lasting
      ? { id: 'done', t: T.resolved, agent: 'verify', title: 'Fixed before it broke', detail: 'Lesson saved: check pipes like this every 6 months', steps: ['Logged the repair', 'Saved the lesson for next time'] }
      : { id: 'done', t: T.resolved, agent: 'verify', title: 'Leak stopped for now', detail: 'The full repair is still needed', steps: ['Logged the clamp', 'Booked a check in 2 weeks'] },
  ];

  return { entries, questions, fix, road, notify, crew, sideCrew, riskAfter: fix.riskAfter, lasting: fix.lasting };
}

/** One line per answered question, for the result card: what was decided and by whom. */
export function decisionsOf(run: AgentRun, answers: Answers) {
  const by = (id: QuestionId) => answers[id]?.by ?? 'agents';
  return [
    { id: 'fix' as const, text: run.fix.id === 'replace' ? 'Replace the section' : run.fix.id === 'clamp' ? 'Clamp for now' : 'Wait', by: by('fix') },
    { id: 'road' as const, text: run.road.id === 'lane' ? 'One lane · 6 h' : run.road.id === 'street' ? 'Street closed · 4 h' : 'Tonight', by: by('road') },
    { id: 'notify' as const, text: run.notify.id === 'near' ? 'Hospital told' : run.notify.id === 'all' ? 'Everyone texted' : 'Nobody told', by: by('notify') },
  ];
}

/* ------------------------------------------------------------------ */
/* Crew board                                                          */
/* ------------------------------------------------------------------ */

export type CrewTone = 'ready' | 'busy' | 'moving' | 'working' | 'done';

export function crewStatus(c: Crew, run: AgentRun, t: number, active: boolean): { label: string; tone: CrewTone } {
  if (c.busy) return { label: 'Busy · other repair', tone: 'busy' };
  if (active && c.id === run.crew.id && t >= T.dispatch) {
    if (t < T.arrive) {
      const p = Math.min(1, Math.max(0, (t - T.dispatch - 0.8) / (T.arrive - T.dispatch - 0.8)));
      return { label: `On the way · ${Math.max(1, Math.round(c.minutesAway * (1 - p)))} min`, tone: 'moving' };
    }
    if (t < T.resolved) return { label: 'Working on site', tone: 'working' };
    return { label: 'Done', tone: 'done' };
  }
  if (active && c.id === run.sideCrew.id && t >= SIDE_JOB_T) {
    if (t < SIDE_JOB_T + 5) return { label: `On the way · ${c.minutesAway} min`, tone: 'moving' };
    if (t < SIDE_JOB_T + 11) return { label: 'Fixing a streetlight', tone: 'working' };
    return { label: 'Done', tone: 'done' };
  }
  return { label: 'Ready', tone: 'ready' };
}
