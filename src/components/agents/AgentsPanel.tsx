import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { Check, ChevronDown, GitCompare, RotateCcw, X } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { buildRun, crewStatus, decisionsOf, type AgentEntry, type AgentRun, type Answers, type Autonomy, type How } from '../../agents/brain';
import { AGENT_BY_ID, type AgentId } from '../../agents/team';
import { CREWS, PEOPLE_ON_SHIFT, type Skill } from '../../agents/crews';
import { COSTS, INCIDENT, formatMoney } from '../../data/incident';
import { factsNow } from '../../agents/ask';
import { RimGlow } from '../ui/ai-lights/RimGlow';
import { useRimMask } from '../ui/ai-lights/useAiLights';
import { EVEN_STOPS } from '../ui/ai-lights/mask';
import { AutonomySwitch } from './AutonomySwitch';
import { ThinkingLine } from './ThinkingLine';
import { QuestionCard } from './QuestionCard';
import { AskTwin } from './AskTwin';
import { SavingsChart, WhatIfChart } from './AgentCharts';

const DOING: Record<AgentId, string> = {
  watch: 'Watch is comparing nearby sensors…',
  diagnose: 'Diagnose is working out how long we have…',
  plan: 'Plan is weighing the options…',
  patch: 'Patch is adjusting valves remotely…',
  dispatch: 'Dispatch is tracking the crew…',
  verify: 'Verify is testing the pressure…',
};

const SKILL: Record<Skill, string> = { 'water-main': 'Big pipes', 'water-service': 'Small pipes', electric: 'Power', sewage: 'Sewage' };

function howLabel(how: How, autonomy: Autonomy) {
  if (how === 'auto') return autonomy === 'full' ? 'Did it alone' : 'Inside your limits';
  if (how === 'chose') return 'You chose';
  if (how === 'approved') return 'You OK’d it';
  if (how === 'default') return 'Our pick · no answer';
  return 'Waiting for you';
}

/** The same, short enough to sit beside a step's title. */
const HOW_SHORT: Record<How, string> = { auto: 'Auto', chose: 'You', approved: 'You OK’d', default: 'Our pick', waiting: 'Waiting' };

/** Seconds between the trace's steps appearing under a live entry. */
const STEP_GAP = 0.8;

/** One line of the trace; the live one (and any opened one) shows its detail, steps, checks and options. */
function TraceItem({ e, live, t, autonomy, still }: { e: AgentEntry; live: boolean; t: number; autonomy: Autonomy; still: boolean }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState(false);
  const agent = AGENT_BY_ID[e.agent];
  const expanded = live || open;
  const steps = e.steps ?? [];
  // the live entry reveals its steps as the clock runs; finished ones show them all
  const shownSteps = live ? steps.filter((_, i) => t >= e.t + 0.35 + i * STEP_GAP) : steps;
  const working = live && shownSteps.length < steps.length;
  return (
    <li className={`trace-item ${live ? 'is-live' : ''} ${expanded ? 'is-open' : ''} ${e.tone === 'warn' ? 'is-warn' : ''}`}>
      <span className="trace-dot" aria-hidden="true">
        {live ? <ThinkingOrb state={agent.orb} size={20} theme="dark" paused={still} aria-hidden="true" /> : <i />}
      </span>
      <button className="trace-row" aria-expanded={expanded} onClick={() => !live && setOpen(!open)} disabled={live}>
        <span className="trace-agent">{agent.name}</span>
        <span className="trace-title">{e.title}</span>
        {e.how && (
          <span className={`trace-how how-${e.how}`} title={howLabel(e.how, autonomy)}>
            {HOW_SHORT[e.how]}
          </span>
        )}
      </button>
      {expanded && (
        <div className="trace-more">
          <p className="trace-detail">{e.detail}</p>
          {shownSteps.length > 0 && (
            <ul className="trace-steps">
              {shownSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
              {working && <li className="is-working">…</li>}
            </ul>
          )}
          {e.checks && (
            <ul className="entry-checks" aria-label="Limits checked">
              {e.checks.map((c) => (
                <li key={c.label} className={c.ok ? 'is-ok' : 'is-no'}>
                  {c.ok ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                  {c.label}
                </li>
              ))}
            </ul>
          )}
          {e.options && (
            <div className={`entry-options ${why ? 'is-open' : ''}`}>
              <button className="entry-options-toggle" aria-expanded={why} onClick={() => setWhy(!why)}>
                Why this one? {e.options.length} options compared
                <ChevronDown size={13} />
              </button>
              <div className="entry-options-panel">
                <ul className="entry-options-inner">
                  {e.options.map((o) => (
                    <li key={o.label} className={o.chosen ? 'is-chosen' : ''}>
                      <b>{o.label}</b>
                      <span>{o.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Crews folded to one line; open it to see who is where. */
function Crews({ run, t, active }: { run: AgentRun; t: number; active: boolean }) {
  const [open, setOpen] = useState(false);
  const rows = CREWS.map((c) => ({ c, s: crewStatus(c, run, t, active) }));
  const working = rows.filter((r) => r.s.tone === 'moving' || r.s.tone === 'working' || r.s.tone === 'busy').reduce((n, r) => n + r.c.people, 0);
  const moving = rows.find((r) => r.s.tone === 'moving' || r.s.tone === 'working');
  return (
    <section className={`crews ${open ? 'is-open' : ''}`} aria-label="Crews on shift">
      <button className="crews-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>Crews</span>
        <span className="crews-sum">{moving ? `${moving.c.name} · ${moving.s.label}` : `${working} of ${PEOPLE_ON_SHIFT} people busy`}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <ul>
          {rows.map(({ c, s }) => (
            <li key={c.id} className={`crew tone-${s.tone}`}>
              <i aria-hidden="true" />
              <b>{c.name}</b>
              <span className="crew-skill">{c.skills.map((k) => SKILL[k]).join(' · ')}</span>
              <span className="crew-status">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const BY_LABEL = { you: 'you', default: 'our pick', agents: 'agents' } as const;

/** The result, with the calls that shaped it and the two charts: what the fix saved and what would have happened. */
function Outcome({ run, answers }: { run: AgentRun; answers: Answers }) {
  const setCompare = useTwinStore((s) => s.setCompare);
  const compare = useTwinStore((s) => s.compare);
  const replay = useTwinStore((s) => s.run);
  return (
    <section className="outcome" aria-label="Result">
      <div className="outcome-title">
        <span className="outcome-check" aria-hidden="true">
          <Check size={15} strokeWidth={3} />
        </span>
        {run.lasting ? 'Fixed before it broke' : 'Leak stopped for now'}
      </div>
      <div className="outcome-kpis">
        <div>
          <b className="tnum">{INCIDENT.population.toLocaleString('en-US')}</b>
          <span>kept their water</span>
        </div>
        <div>
          <b className="tnum">{run.lasting ? formatMoney(COSTS.avoided) : formatMoney(run.fix.cost)}</b>
          <span>{run.lasting ? 'saved' : 'spent so far'}</span>
        </div>
        <div>
          <b className="tnum">
            {INCIDENT.riskBefore} → {run.riskAfter}
          </b>
          <span>risk</span>
        </div>
      </div>
      <ul className="outcome-calls" aria-label="The calls that were made">
        {decisionsOf(run, answers).map((d) => (
          <li key={d.id} className={`by-${d.by}`}>
            {d.text}
            <span>{BY_LABEL[d.by]}</span>
          </li>
        ))}
      </ul>
      <SavingsChart fixCost={run.fix.cost} />
      <WhatIfChart />
      <div className="outcome-actions">
        <button className={`btn-primary ${compare ? 'is-on' : ''}`} onClick={() => setCompare(compare ? null : 'none')}>
          <GitCompare size={15} />
          {compare ? 'Close' : 'With and without Al Sajaa Twin'}
        </button>
        <button className="btn-ghost" onClick={replay} aria-label="Run again">
          <RotateCcw size={14} />
        </button>
      </div>
    </section>
  );
}

/**
 * The agents as a dropdown. It drops open by itself when they start work and shows the live trace:
 * each agent's step, what it is doing right now, and the questions it puts to you (multiple choice).
 * A constant light-blue halo (AI lights) runs round its rim.
 */
export function AgentsPanel() {
  const snap = useTwinStore((s) => s.snap);
  const policy = useTwinStore((s) => s.policy);
  const answers = useTwinStore((s) => s.answers);
  const awaiting = useTwinStore((s) => s.awaiting);
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');
  const run = useMemo(() => buildRun(policy, answers), [policy, answers]);
  const [open, setOpen] = useState(false);
  const [trace, setTrace] = useState(false);
  const glowRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const layers = useRimMask(glowRef, { stops: EVEN_STOPS });

  const { t, active, resolved } = snap;
  const shown = active ? run.entries.filter((e) => e.t <= t + 1e-6) : [];
  const latest = shown[shown.length - 1];
  const working = active && !resolved && !awaiting;
  const lead: AgentId = !active ? 'watch' : awaiting ? awaiting.agent : resolved ? 'verify' : (latest?.agent ?? 'watch');
  const line = !active
    ? 'Watch is checking 216 sensors'
    : awaiting
      ? `${AGENT_BY_ID[awaiting.agent].name} has a question for you`
      : resolved
        ? run.lasting
          ? 'All clear · lesson saved'
          : 'Leak stopped · the full repair is still needed'
        : DOING[lead];
  const mode = active ? (resolved ? 'Done' : awaiting ? 'Needs you' : 'Working') : 'Standing by';

  // drop down when the agents start, when they ask something, and when the result is in
  useEffect(() => {
    if (active) setOpen(true);
    else {
      setOpen(false);
      setTrace(false);
    }
  }, [active]);
  useEffect(() => {
    if (awaiting) setOpen(true);
  }, [awaiting]);
  useEffect(() => {
    if (resolved) setOpen(true);
  }, [resolved]);

  // keep the newest step (or the question) in view; the result scrolls back to the top
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;
    el.scrollTo({ top: resolved ? 0 : el.scrollHeight, behavior: still ? 'auto' : 'smooth' });
  }, [shown.length, awaiting, resolved, open, still]);

  const showTrace = active && (!resolved || trace);

  return (
    <div ref={glowRef} className={`agents-dd ai-lights is-constant ${open ? 'is-open' : ''} ${awaiting ? 'needs-you' : ''}`}>
      <RimGlow layers={layers} />
      <div className="agents-face">
        <button className="agents-head" aria-expanded={open} aria-controls="agents-body" onClick={() => setOpen(!open)}>
          <ThinkingOrb state={AGENT_BY_ID[lead].orb} size={20} theme="dark" paused={still || !working} aria-hidden="true" />
          <span className="agents-head-text">
            <span className="agents-title-row">
              <span className="rail-title">Agents</span>
              <span className={`agents-mode mode-${mode.replace(' ', '-').toLowerCase()}`}>{mode}</span>
            </span>
            <ThinkingLine text={line} live={working || !active} />
          </span>
          <ChevronDown size={16} className="agents-chev" aria-hidden="true" />
        </button>

        <div id="agents-body" className="agents-body" aria-hidden={!open}>
          <div className="agents-body-inner">
            <AutonomySwitch />
            <div className="agents-scroll" ref={scrollRef}>
              {!active && <p className="agents-idle">Press play: the agents will show each step here and ask you when there is a real choice to make.</p>}
              {resolved && <Outcome run={run} answers={answers} />}
              {resolved && (
                <button className="history-toggle" aria-expanded={trace} onClick={() => setTrace(!trace)}>
                  {trace ? 'Hide' : 'See'} all {shown.length} steps
                  <ChevronDown size={13} />
                </button>
              )}
              {showTrace && shown.length > 0 && (
                <ol className="trace" aria-label="What the agents are doing">
                  {shown.map((e) => (
                    <TraceItem key={e.id} e={e} live={!resolved && !awaiting && e === latest} t={t} autonomy={policy.autonomy} still={still} />
                  ))}
                </ol>
              )}
              {awaiting && <QuestionCard key={awaiting.id} q={awaiting} still={still} />}
            </div>
            <div className="agents-foot">
              <AskTwin facts={() => factsNow(run, shown, policy, awaiting, t, active, resolved)} chips={!active || resolved} />
              <Crews run={run} t={t} active={active} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
