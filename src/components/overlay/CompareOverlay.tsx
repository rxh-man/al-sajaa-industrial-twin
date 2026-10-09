import { Check, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { COSTS, POI, formatMoney } from '../../data/incident';

const ROWS: { label: string; none: string; ai: string }[] = [
  { label: 'Water main', none: 'Bursts at ~44 h', ai: 'Section replaced in 4 h' },
  { label: 'Water service', none: '12,400 residents cut off', ai: 'Rerouted · no interruption' },
  { label: POI.hospital.name, none: 'On backup tanks', ai: 'Uninterrupted' },
  { label: 'Khalifa Street', none: 'Closed 3–5 days', ai: 'One lane · 6 h' },
  { label: 'Cost', none: `${formatMoney(COSTS.failure)}+`, ai: formatMoney(COSTS.preventive) },
];

export function CompareOverlay() {
  const compare = useTwinStore((s) => s.compare);
  const setCompare = useTwinStore((s) => s.setCompare);
  if (!compare) return null;
  return (
    <div className="compare" role="dialog" aria-label="Compare outcomes">
      <header className="compare-head">
        <span>With and without Al Sajaa Twin</span>
        <span className="tag-demo">Demo</span>
        <button className="icon-btn sm" onClick={() => setCompare(null)} aria-label="Close comparison">
          <X size={14} />
        </button>
      </header>
      <div className="compare-cols">
        <button className={`compare-col is-bad ${compare === 'none' ? 'is-on' : ''}`} onClick={() => setCompare('none')} aria-pressed={compare === 'none'}>
          <span className="compare-col-title">
            <ShieldAlert size={15} /> No intervention
          </span>
          <ul>
            {ROWS.map((r) => (
              <li key={r.label}>
                <span>{r.label}</span>
                <b>{r.none}</b>
              </li>
            ))}
          </ul>
        </button>
        <button className={`compare-col is-good ${compare === 'ai' ? 'is-on' : ''}`} onClick={() => setCompare('ai')} aria-pressed={compare === 'ai'}>
          <span className="compare-col-title">
            <ShieldCheck size={15} /> AI-guided intervention
          </span>
          <ul>
            {ROWS.map((r) => (
              <li key={r.label}>
                <span>{r.label}</span>
                <b>
                  <Check size={12} strokeWidth={3} /> {r.ai}
                </b>
              </li>
            ))}
          </ul>
        </button>
      </div>
    </div>
  );
}
