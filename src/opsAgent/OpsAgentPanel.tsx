import { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, CircleDashed, Clock3, MapPin, PauseCircle, Play, ShieldCheck, X, XCircle } from 'lucide-react';
import { useI18n } from '../i18n/i18nContext';
import { useTwinStore } from '../store/useTwinStore';
import { change } from '../solutions/engine';
import { scenarioById } from '../solutions/registry';
import type { InputValues, KpiDef, OptionResult, ScenarioResult } from '../solutions/types';
import { WORKFLOWS } from './goal';
import { approve, DEMO_GOALS, plan, reject, STEP_ORDER, type AgentRun, type StepStatus } from './runtime';
import { useOpsStore } from './store';
import { opsText, type OpsText } from './i18n';
import { ADOPTION } from './adoption';
import '../styles/opsAgent.css';

const fmt = (v: number | null | undefined, digits?: number) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = digits ?? (a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3);
  return v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
};
const pctTxt = (p: number | null) => (p === null ? 'n/a' : `${p >= 0 ? '+' : ''}${fmt(p, 1)} %`);

function StatusIcon({ s }: { s: StepStatus }) {
  if (s === 'done') return <CheckCircle2 size={14} className="ops-ok" aria-hidden />;
  if (s === 'failed') return <XCircle size={14} className="ops-bad" aria-hidden />;
  if (s === 'waiting') return <PauseCircle size={14} className="ops-wait" aria-hidden />;
  if (s === 'running') return <Clock3 size={14} aria-hidden />;
  return <CircleDashed size={14} className="ops-muted" aria-hidden />;
}

function improves(k: KpiDef, abs: number | null) {
  if (abs === null || Math.abs(abs) < 1e-9) return 0;
  return (k.better === 'lower' ? abs < 0 : abs > 0) ? 1 : -1;
}

/** baseline vs the given options, one row per KPI, with absolute and percentage change */
function KpiTable({ result, options, t }: { result: ScenarioResult; options: OptionResult[]; t: OpsText }) {
  return (
    <div className="ops-table-wrap">
      <table className="ops-table">
        <thead>
          <tr>
            <th scope="col">{t.kpi}</th>
            <th scope="col">{t.baseline}</th>
            {options.map((o) => (
              <th scope="col" key={o.id}>
                {o.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.kpis.map((k) => {
            const b = result.baseline.kpis[k.id] ?? null;
            return (
              <tr key={k.id}>
                <th scope="row" title={k.how}>
                  {k.label} <span className="ops-unit">{k.unit}</span>
                  <span className={`ops-basis b-${k.basis.toLowerCase()}`}>{k.basis}</span>
                </th>
                <td>{fmt(b)}</td>
                {options.map((o) => {
                  const v = o.kpis[k.id] ?? null;
                  const c = change(b, v);
                  const dir = improves(k, c.abs);
                  return (
                    <td key={o.id}>
                      <div>{fmt(v)}</div>
                      <div className={`ops-delta ${dir > 0 ? 'ops-ok' : dir < 0 ? 'ops-bad' : 'ops-muted'}`}>
                        {c.abs === null ? '—' : `${c.abs >= 0 ? '+' : ''}${fmt(c.abs)}`} · {pctTxt(c.pct)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InputsEditor({ run, values, setValues, t }: { run: AgentRun; values: InputValues; setValues: (v: InputValues) => void; t: OpsText }) {
  const def = run.scenarioId ? scenarioById(run.scenarioId) : null;
  if (!def) return null;
  // until the run's inputs reach local state, show the run's own values (never an empty value)
  const val = (id: string) => values[id] ?? run.inputs[id] ?? def.defaults[id];
  return (
    <fieldset className="ops-inputs">
      <legend>
        {t.inputs} · {def.title}
      </legend>
      {def.inputs.map((s) => {
        const id = `ops-in-${s.id}`;
        if (s.kind === 'range')
          return (
            <label key={s.id} htmlFor={id} className="ops-range">
              <span>
                {s.label} <b>{fmt(Number(val(s.id)))}</b> {s.unit}
              </span>
              <input id={id} type="range" min={s.min} max={s.max} step={s.step} value={Number(val(s.id))} onChange={(e) => setValues({ ...run.inputs, ...values, [s.id]: Number(e.target.value) })} />
            </label>
          );
        if (s.kind === 'select')
          return (
            <label key={s.id} htmlFor={id} className="ops-select">
              <span>{s.label}</span>
              <select id={id} value={String(val(s.id))} onChange={(e) => setValues({ ...run.inputs, ...values, [s.id]: e.target.value })}>
                {s.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        return (
          <label key={s.id} className="ops-toggle">
            <input type="checkbox" checked={val(s.id) === true} onChange={(e) => setValues({ ...run.inputs, ...values, [s.id]: e.target.checked })} /> {s.label}
          </label>
        );
      })}
    </fieldset>
  );
}

function AgentTab({ t, ar }: { t: OpsText; ar: boolean }) {
  const run = useOpsStore((s) => s.run);
  const setRun = useOpsStore((s) => s.setRun);
  const focusPlace = useTwinStore((s) => s.focusPlace);
  const [goal, setGoal] = useState<string>(DEMO_GOALS[0].goal);
  const [values, setValues] = useState<InputValues>({});
  const [who, setWho] = useState('');
  const [role, setRole] = useState<'operator' | 'viewer'>('operator');

  useEffect(() => {
    if (run) setValues(run.inputs);
  }, [run]);

  const doPlan = (g: string, overrides: InputValues = {}) => {
    const r = plan(g, overrides);
    setRun(r);
    if (r.result) focusPlace(r.result.highlight.focus.x, r.result.highlight.focus.z, r.result.highlight.focus.r);
  };
  const result = run?.result ?? null;
  const chosen = result?.options.find((o) => o.id === run?.selected) ?? null;

  return (
    <div className="ops-tab">
      <div className="ops-demos" role="group" aria-label={t.demos}>
        <span className="ops-label">{t.demos}</span>
        {DEMO_GOALS.map((d) => (
          <button
            key={d.id}
            className="ops-chip"
            onClick={() => {
              setGoal(d.goal);
              doPlan(d.goal);
            }}
          >
            {ar ? d.labelAr : d.label}
          </button>
        ))}
      </div>
      <label className="ops-label" htmlFor="ops-goal">
        {t.goal}
      </label>
      <textarea id="ops-goal" className="ops-goal" rows={3} maxLength={400} value={goal} placeholder={t.goalPh} onChange={(e) => setGoal(e.target.value)} dir="auto" />
      <div className="ops-row">
        <button className="ops-btn primary" onClick={() => doPlan(goal)}>
          <Play size={14} aria-hidden /> {t.plan}
        </button>
        <span className="ops-muted ops-small">{WORKFLOWS.map((w) => `${ar ? w.titleAr : w.title}${w.scenarioId ? '' : ar ? ' (لاحقاً)' : ' (not yet)'}`).join(' · ')}</span>
      </div>

      {run && (
        <>
          <section aria-labelledby="ops-steps-h" className="ops-sec">
            <h4 id="ops-steps-h">
              {t.steps} · <span className={`ops-state s-${run.state}`}>{t.state[run.state]}</span>
            </h4>
            <ol className="ops-steps">
              {STEP_ORDER.map((s) => (
                <li key={s} className={`st-${run.steps[s].status}`}>
                  <StatusIcon s={run.steps[s].status} />
                  <span className="ops-step-name">{t.step[s]}</span>
                  <span className="ops-muted ops-small">{t.status[run.steps[s].status]}</span>
                  {run.steps[s].note && <div className="ops-step-note">{run.steps[s].note}</div>}
                </li>
              ))}
            </ol>
          </section>

          {run.scenarioId && <InputsEditor run={run} values={values} setValues={setValues} t={t} />}
          {run.scenarioId && (
            <button className="ops-btn" onClick={() => doPlan(goal, values)}>
              {t.rerun}
            </button>
          )}

          <details className="ops-sec" open>
            <summary>
              {t.tools} ({run.log.length})
            </summary>
            <ol className="ops-log">
              {run.log.map((l) => (
                <li key={l.seq} className={l.ok ? '' : 'ops-bad'}>
                  <code>{l.tool}</code> <span className="ops-muted">{l.args}</span> → {l.summary}
                </li>
              ))}
            </ol>
          </details>

          {result && (
            <>
              <section className="ops-sec" aria-labelledby="ops-find-h">
                <h4 id="ops-find-h">{t.findings}</h4>
                <ul>
                  {result.findings.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <button className="ops-btn ghost" onClick={() => focusPlace(result.highlight.focus.x, result.highlight.focus.z, result.highlight.focus.r)}>
                  <MapPin size={13} aria-hidden /> {t.showMap}
                </button>
              </section>

              <section className="ops-sec" aria-labelledby="ops-cand-h">
                <h4 id="ops-cand-h">{t.candidates}</h4>
                <ul className="ops-cands">
                  {run.candidates.map((c) => (
                    <li key={c.optionId} className={c.optionId === run.selected ? 'is-sel' : ''}>
                      <div className="ops-cand-head">
                        <b>{c.name}</b>
                        <span className={`ops-tag ${!c.feasible ? 'bad' : c.meetsGoal ? 'ok' : 'warn'}`}>{!c.feasible ? t.infeasible : c.meetsGoal ? t.meets : t.misses}</span>
                        <span className="ops-muted ops-small">score {Number.isFinite(c.score) ? c.score.toFixed(3) : '—'}</span>
                      </div>
                      {c.why && <div className="ops-small ops-muted">{c.why}</div>}
                      {c.checks.map((k) => (
                        <div key={k.detail} className={`ops-small ${k.met ? 'ops-ok' : 'ops-bad'}`}>
                          {k.met ? '✓' : '✗'} {k.detail}
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="ops-sec" aria-labelledby="ops-why-h">
                <h4 id="ops-why-h">
                  {t.selected}: {chosen?.name}
                </h4>
                <ul>
                  {run.explanation.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
                {chosen && <KpiTable result={result} options={[chosen]} t={t} />}
              </section>

              {(run.state === 'awaiting-approval' || run.steps.approval.status !== 'pending') && (
                <section className="ops-sec ops-approval" aria-labelledby="ops-appr-h">
                  <h4 id="ops-appr-h">
                    <ShieldCheck size={14} aria-hidden /> {t.approval}
                  </h4>
                  <p className="ops-small">{run.steps.approval.note}</p>
                  {run.state === 'awaiting-approval' && (
                    <>
                      <div className="ops-row">
                        <label className="ops-select">
                          <span>{t.approver}</span>
                          <input value={who} maxLength={40} onChange={(e) => setWho(e.target.value.replace(/[<>]/g, ''))} />
                        </label>
                        <label className="ops-select">
                          <span>{t.role}</span>
                          <select value={role} onChange={(e) => setRole(e.target.value as 'operator' | 'viewer')}>
                            <option value="operator">{t.operator}</option>
                            <option value="viewer">{t.viewer}</option>
                          </select>
                        </label>
                      </div>
                      <div className="ops-row">
                        <button className="ops-btn primary" onClick={() => setRun(approve(run, { by: who.trim(), role }))}>
                          {t.approve}
                        </button>
                        <button className="ops-btn" onClick={() => setRun(reject(run, who.trim()))}>
                          {t.reject}
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )}

              {run.verification && (
                <section className="ops-sec" aria-labelledby="ops-ver-h">
                  <h4 id="ops-ver-h">{t.verification}</h4>
                  <p className={run.verification.reproduced ? 'ops-ok' : 'ops-bad'}>{run.steps.verify.note}</p>
                  {run.verification.checks.map((c) => (
                    <div key={c.detail} className={c.met ? 'ops-ok' : 'ops-bad'}>
                      {c.met ? '✓' : '✗'} {c.detail}
                    </div>
                  ))}
                  <h5>{t.risks}</h5>
                  <ul>
                    {run.verification.remainingRisks.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
          {run.error && run.state === 'failed' && <p className="ops-bad" role="alert">{run.error}</p>}
        </>
      )}
    </div>
  );
}

function Bars({ result, kpi, selected }: { result: ScenarioResult; kpi: KpiDef; selected: string | null }) {
  const rows = [result.baseline, ...result.options].map((o) => ({ id: o.id, name: o.id === 'baseline' ? 'Baseline' : o.name, v: o.kpis[kpi.id] ?? null }));
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.v ?? 0)));
  return (
    <figure className="ops-bars">
      <figcaption>
        {kpi.label} <span className="ops-unit">{kpi.unit}</span> <span className="ops-muted ops-small">({kpi.better} is better)</span>
      </figcaption>
      {rows.map((r) => (
        <div key={r.id} className={`ops-bar-row ${r.id === selected ? 'is-sel' : ''} ${r.id === 'baseline' ? 'is-base' : ''}`}>
          <span className="ops-bar-name">{r.name}</span>
          <span className="ops-bar-track" aria-hidden>
            <span className="ops-bar-fill" style={{ width: `${(Math.abs(r.v ?? 0) / max) * 100}%` }} />
          </span>
          <span className="ops-bar-val">{fmt(r.v)}</span>
        </div>
      ))}
    </figure>
  );
}

function CompareTab({ t }: { t: OpsText }) {
  const run = useOpsStore((s) => s.run);
  const result = run?.result ?? null;
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  useEffect(() => {
    if (!result) return;
    setA(run?.selected ?? result.options[0].id);
    setB(result.options.find((o) => o.id !== run?.selected)?.id ?? result.options[0].id);
  }, [result, run?.selected]);
  if (!run || !result) return <p className="ops-muted">Plan a goal on the Agent tab first.</p>;
  const pair = [a, b].map((id) => result.options.find((o) => o.id === id)).filter(Boolean) as OptionResult[];
  const sel = result.options.find((o) => o.id === run.selected);
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>{scenarioById(result.scenarioId)?.title}</h4>
        <p>{scenarioById(result.scenarioId)?.problem}</p>
        <p className="ops-small ops-muted">{scenarioById(result.scenarioId)?.why}</p>
        <div className="ops-small">
          <b>{t.affected}:</b> {result.affectedAssets.join(', ')}
        </div>
      </section>
      {sel && (
        <div className="ops-cards" role="list">
          {result.kpis.map((k) => {
            const bv = result.baseline.kpis[k.id] ?? null;
            const v = sel.kpis[k.id] ?? null;
            const c = change(bv, v);
            const dir = improves(k, c.abs);
            return (
              <div key={k.id} className="ops-card" role="listitem" title={k.how}>
                <div className="ops-card-l">{k.label}</div>
                <div className="ops-card-v">
                  {fmt(v)} <span className="ops-unit">{k.unit}</span>
                </div>
                <div className={`ops-small ${dir > 0 ? 'ops-ok' : dir < 0 ? 'ops-bad' : 'ops-muted'}`}>
                  {t.baseline} {fmt(bv)} · {pctTxt(c.pct)}
                </div>
                <span className={`ops-basis b-${k.basis.toLowerCase()}`}>{k.basis}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="ops-row">
        {[
          [a, setA],
          [b, setB],
        ].map(([v, set], i) => (
          <label key={i} className="ops-select">
            <span>Intervention {i === 0 ? 'A' : 'B'}</span>
            <select value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)}>
              {result.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <KpiTable result={result} options={pair} t={t} />
      <div className="ops-bars-grid">
        {result.kpis.map((k) => (
          <Bars key={k.id} result={result} kpi={k} selected={run.selected} />
        ))}
      </div>
      <section className="ops-sec">
        <h4>{t.why}</h4>
        <p>{result.recommendation.why}</p>
        <p className="ops-small ops-muted">
          Weights: {Object.entries(result.recommendation.weights).map(([k, w]) => `${k} ${Math.round(w * 100)} %`).join(', ')} · Scores: {Object.entries(result.recommendation.scores).map(([k, s]) => `${k} ${Number.isFinite(s) ? s.toFixed(3) : 'infeasible'}`).join(', ')}
        </p>
      </section>
      {(
        [
          [t.tradeoffs, result.tradeoffs],
          [t.assumptions, result.assumptions],
          [t.limitations, result.limitations],
          [t.unavailable, result.unavailable.map((u) => `${u.metric} — needs ${u.needs}`)],
        ] as [string, string[]][]
      ).map(([h, items]) => (
        <section key={h} className="ops-sec">
          <h4>{h}</h4>
          <ul>
            {items.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      ))}
      <p>
        <b>{t.confidence}:</b> {result.confidence.level} — {result.confidence.why}
      </p>
    </div>
  );
}

function AdoptionTab() {
  return (
    <div className="ops-tab">
      {ADOPTION.map((s) => (
        <section key={s.h} className="ops-sec">
          <h4>{s.h}</h4>
          <ul>
            {s.items.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function OpsAgentPanel() {
  const open = useOpsStore((s) => s.open);
  const setOpen = useOpsStore((s) => s.setOpen);
  const { locale, setLocale } = useI18n();
  const t = useMemo(() => opsText(locale), [locale]);
  const [tab, setTab] = useState<'agent' | 'compare' | 'adoption'>('agent');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  if (!open) return null;
  const tabs = [
    ['agent', t.tabAgent],
    ['compare', t.tabCompare],
    ['adoption', t.tabAdoption],
  ] as const;
  return (
    <aside className="ops-panel" role="dialog" aria-modal="false" aria-labelledby="ops-title" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}>
      <header className="ops-head">
        <Bot size={18} aria-hidden />
        <div>
          <h3 id="ops-title">{t.title}</h3>
          <div className="ops-small ops-muted">{t.sub}</div>
        </div>
        <button className="ops-chip" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} lang={locale === 'ar' ? 'en' : 'ar'}>
          {locale === 'ar' ? 'English' : 'العربية'}
        </button>
        <button className="icon-btn" aria-label={t.close} onClick={() => setOpen(false)}>
          <X size={16} />
        </button>
      </header>
      <p className="ops-note">{t.noLlm}</p>
      {t.englishOnly && <p className="ops-note">{t.englishOnly}</p>}
      <div className="ops-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`ops-tabbtn ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="ops-body">
        {/* the agent tab stays mounted so the goal text and approver survive a tab switch */}
        <div hidden={tab !== 'agent'}>
          <AgentTab t={t} ar={locale === 'ar'} />
        </div>
        {tab === 'compare' && <CompareTab t={t} />}
        {tab === 'adoption' && <AdoptionTab />}
      </div>
    </aside>
  );
}
