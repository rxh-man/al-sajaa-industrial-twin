import { AlertOctagon, ArrowRight, Check, Clock3, GitCompare, MapPin, RotateCcw, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { COSTS, INCIDENT, REPAIR_STEPS, formatMoney } from '../../data/incident';
import { T } from '../../simulation/timeline';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';

function Evidence({ on, icon, title, value, tone = 'alert' }: { on: boolean; icon: React.ReactNode; title: string; value: string; tone?: string }) {
  return (
    <li className={`evi ${on ? 'is-on' : ''} tone-${tone}`}>
      <span className="evi-icon">{icon}</span>
      <span className="evi-title">{title}</span>
      <span className="evi-value tnum">{on ? value : '—'}</span>
    </li>
  );
}

function Monitoring() {
  return (
    <div className="rec-block">
      <div className="rec-badge tone-ok">
        <ShieldCheck size={18} />
        <span>All clear</span>
      </div>
      <p className="rec-lede">No action needed.</p>
    </div>
  );
}

function Analyzing() {
  const snap = useTwinStore((s) => s.snap);
  return (
    <div className="rec-block">
      <div className={`rec-badge ${snap.localized ? 'tone-alert' : 'tone-warn'} is-pulsing`}>
        <Sparkles size={17} />
        <span>{snap.localized ? 'ASSESSING' : 'ANALYZING'}</span>
      </div>
      <ul className="evi-list">
        <Evidence on={snap.patternDetected} icon={<MapPin size={13} />} title="Area" value="B-12" tone="warn" />
        <Evidence on={snap.localized} icon={<AlertOctagon size={13} />} title="Leak" value={`${INCIDENT.confidence}%`} />
        <Evidence on={snap.prediction} icon={<Clock3 size={13} />} title="Could break in" value={`${INCIDENT.failureWindow[0]}–${INCIDENT.failureWindow[1]} h`} />
        <Evidence on={snap.impact} icon={<Users size={13} />} title="People affected" value={INCIDENT.population.toLocaleString('en-US')} />
      </ul>
    </div>
  );
}

function Kpi({ value, label, good = false }: { value: string; label: string; good?: boolean }) {
  return (
    <div className={`kpi ${good ? 'is-good' : ''}`}>
      <b className="tnum">{value}</b>
      <span className="kpi-label">{label}</span>
    </div>
  );
}

function Recommendation() {
  const viewRepairPlan = useTwinStore((s) => s.viewRepairPlan);
  const repairOpen = useTwinStore((s) => s.repairOpen);
  return (
    <div className="rec-block rec-enter">
      <div className="rec-top">
        <div className="rec-badge tone-alert big">
          <AlertOctagon size={20} />
          <span>Act now</span>
        </div>
        <div className="rec-priority">
          <b>Urgent</b>
        </div>
      </div>
      <div className="rec-action">
        <span className="rec-action-text">Repair within {INCIDENT.respondWithinHours} h</span>
        <span className="rec-action-where">Area B-12</span>
      </div>
      {!repairOpen && (
        <>
          <div className="rec-kpis">
            <Kpi value="12,400" label="residents" />
            <Kpi value="320 m" label="to hospital" />
            <Kpi value={formatMoney(COSTS.preventive)} label="repair" />
            <Kpi value={formatMoney(COSTS.avoided)} label="saved" good />
          </div>
          <button className="btn-primary" onClick={viewRepairPlan}>
            View repair plan
            <ArrowRight size={16} />
          </button>
        </>
      )}
    </div>
  );
}

function RepairPlan() {
  const step = useTwinStore((s) => s.snap.repairStep);
  const t = useTwinStore((s) => s.snap.t);
  const bounds = [T.repair, T.reroute, T.dispatch, T.replace, T.restore, T.resolved];
  return (
    <ol className="plan-steps rec-enter" aria-label="Repair plan">
      {REPAIR_STEPS.map((s, i) => {
        const state = step > s.id ? 'done' : step === s.id ? 'active' : 'pending';
        const p = state === 'active' ? Math.min(1, Math.max(0, (t - bounds[i]) / (bounds[i + 1] - bounds[i]))) : state === 'done' ? 1 : 0;
        return (
          <li key={s.id} className={`plan-step is-${state}`}>
            <span className="plan-num">{state === 'done' ? <Check size={13} strokeWidth={3} /> : s.id}</span>
            <div className="plan-body">
              <div className="plan-title">{s.title}</div>
              {state === 'active' && (
                <div className="plan-progress">
                  <i style={{ width: `${p * 100}%` }} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Resolved() {
  const setCompare = useTwinStore((s) => s.setCompare);
  const compare = useTwinStore((s) => s.compare);
  const run = useTwinStore((s) => s.run);
  const risk = useAnimatedNumber(useTwinStore((s) => s.snap.risk), 3);
  return (
    <div className="rec-block rec-enter">
      <div className="rec-badge tone-ok big">
        <ShieldCheck size={20} />
        <span>Prevented</span>
      </div>
      <div className="rec-kpis">
        <Kpi value="12,400" label="protected" good />
        <Kpi value={formatMoney(COSTS.avoided)} label="saved" good />
      </div>
      <div className="risk-row">
        <span>Risk</span>
        <span className="risk-from tnum">{INCIDENT.riskBefore}</span>
        <ArrowRight size={14} />
        <span className="risk-to tnum">{Math.round(risk)}</span>
      </div>
      <div className="rec-actions">
        <button className={`btn-primary ${compare ? 'is-on' : ''}`} onClick={() => setCompare(compare ? null : 'none')}>
          <GitCompare size={16} />
          {compare ? 'Close' : 'Compare'}
        </button>
        <button className="btn-ghost" onClick={run} aria-label="Replay scenario">
          <RotateCcw size={14} />
        </button>
      </div>
    </div>
  );
}

export function RecommendationPanel() {
  const snap = useTwinStore((s) => s.snap);
  const repairOpen = useTwinStore((s) => s.repairOpen);
  const key = !snap.active || !snap.anomaly ? 'monitor' : snap.resolved ? 'resolved' : snap.recommendation ? 'rec' : 'analyze';

  return (
    <div className="rail-inner">
      <header className="rail-head">
        <span className="rail-title">What Al Sajaa Twin suggests</span>
      </header>
      <div className="rec-scroll">
        {key === 'monitor' && <Monitoring />}
        {key === 'analyze' && <Analyzing />}
        {key === 'rec' && (
          <>
            <Recommendation />
            {repairOpen && <RepairPlan />}
          </>
        )}
        {key === 'resolved' && <Resolved />}
      </div>
    </div>
  );
}
