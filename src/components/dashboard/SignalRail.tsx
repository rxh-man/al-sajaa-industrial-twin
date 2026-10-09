import { Activity, Droplets, Gauge, Thermometer } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { Sparkline } from '../ui/Sparkline';
import { StatusChip, type ChipTone } from '../ui/StatusChip';
import { PROJECTED_48H } from '../../simulation/telemetry';
import { EXPLAIN_FEATURES, INCIDENT } from '../../data/incident';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { LocatorCard } from './LocatorCard';

const sign = (v: number, d = 1) => `${v > 0.049 ? '+' : v < -0.049 ? '−' : '±'}${Math.abs(v).toFixed(d)}`;

interface CardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: ChipTone;
  chip: string;
  history: number[];
  domain: [number, number];
  projected: boolean;
}

function SignalCard({ icon, label, value, tone, chip, history, domain, projected }: CardProps) {
  const color = tone === 'warn' ? 'var(--amber)' : tone === 'alert' ? 'var(--red)' : 'var(--cyan)';
  return (
    <article className={`sig-card tone-${tone}`}>
      <header className="sig-head">
        <span className="sig-icon" aria-hidden>
          {icon}
        </span>
        <span className="sig-label">{label}</span>
        {projected ? <StatusChip tone="alert" icon={false}>+48H</StatusChip> : <StatusChip tone={tone} icon={false}>{chip}</StatusChip>}
      </header>
      <div className="sig-row">
        <span className="sig-value tnum">{value}</span>
        <span className="sig-spark">
          <Sparkline values={history} color={color} domain={domain} height={26} width={96} />
        </span>
      </div>
    </article>
  );
}

const SHORT: Record<string, string> = {
  'Pressure deviation': 'Pressure',
  'Moisture correlation': 'Moisture',
  'Flow imbalance': 'Flow',
  'Temperature variance': 'Temperature',
};

/** Feature contributions + combined confidence — only while an alert is live. */
function WhyAlert() {
  const confidence = useTwinStore((s) => s.snap.confidence);
  const anomaly = useTwinStore((s) => s.snap.anomaly);
  const resolved = useTwinStore((s) => s.snap.resolved);
  const progress = Math.min(1, confidence / INCIDENT.confidence);
  const shown = useAnimatedNumber(confidence, 6);
  const C = 2 * Math.PI * 20;

  if (!anomaly || resolved || confidence < 0.5) return null;

  return (
    <section className="why" aria-label="Why this alert">
      <div className="why-body">
        <ul className="why-list">
          {EXPLAIN_FEATURES.map((f) => (
            <li key={f.label}>
              <span className="why-name">{SHORT[f.label] ?? f.label}</span>
              <span className="why-bar" aria-label={`${f.level}`}>
                <i style={{ width: `${f.weight * progress * 100}%` }} className={`lvl-${f.level.toLowerCase()}`} />
              </span>
            </li>
          ))}
        </ul>
        <div className="why-gauge" aria-label={`Combined confidence ${Math.round(shown)} percent`}>
          <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
            <circle cx="28" cy="28" r="20" className="why-gauge-track" />
            <circle cx="28" cy="28" r="20" className="why-gauge-fill" strokeDasharray={`${(C * shown) / 100} ${C}`} transform="rotate(-90 28 28)" />
          </svg>
          <div className="why-gauge-val tnum">{Math.round(shown)}%</div>
        </div>
      </div>
    </section>
  );
}

export function SignalRail() {
  const snap = useTwinStore((s) => s.snap);
  const history = useTwinStore((s) => s.history);
  const future = useTwinStore((s) => s.future);
  const tel = future ? PROJECTED_48H : snap;
  const active = snap.anomaly || future;
  const resolved = snap.resolved && !future;

  const pTone: ChipTone = future ? 'alert' : Math.abs(tel.pressureDev) < 0.35 ? 'ok' : 'warn';
  const mTone: ChipTone = future ? 'alert' : tel.moistureDev < 2.5 ? 'ok' : resolved ? 'info' : 'warn';
  const tTone: ChipTone = future ? 'alert' : tel.tempDev < 0.8 ? 'ok' : resolved ? 'info' : 'warn';
  const nTone: ChipTone = future ? 'alert' : tel.networkHealth > 98.3 ? 'ok' : 'warn';

  return (
    <div className="rail-inner">
      <header className="rail-head">
        <span className="rail-title">Sensors</span>
        <span className="live-dot small" aria-hidden />
      </header>
      <div className="sig-grid">
        <SignalCard
          icon={<Gauge size={14} />}
          label="Pressure"
          value={active ? `${sign(tel.pressureDev)}%` : '100%'}
          tone={pTone}
          chip={pTone === 'ok' ? 'Normal' : 'Changing'}
          history={history.pressure}
          domain={[-3, 0.5]}
          projected={future}
        />
        <SignalCard
          icon={<Droplets size={14} />}
          label="Moisture"
          value={active && tel.moistureDev > 0.6 ? `+${tel.moistureDev.toFixed(0)}%` : 'Normal'}
          tone={mTone}
          chip={mTone === 'ok' ? 'Normal' : mTone === 'info' ? 'Drying' : 'High'}
          history={history.moisture}
          domain={[0, 20]}
          projected={future}
        />
        <SignalCard
          icon={<Thermometer size={14} />}
          label="Temperature"
          value={active && tel.tempDev > 0.3 ? `+${tel.tempDev.toFixed(0)}%` : 'Normal'}
          tone={tTone}
          chip={tTone === 'warn' ? 'High' : 'Normal'}
          history={history.temp}
          domain={[0, 4.5]}
          projected={future}
        />
        <SignalCard
          icon={<Activity size={14} />}
          label="Network"
          value={`${tel.networkHealth.toFixed(1)}%`}
          tone={nTone}
          chip={nTone === 'ok' ? 'Normal' : 'Low'}
          history={history.health}
          domain={[96.5, 99]}
          projected={future}
        />
      </div>
      <WhyAlert />
      <LocatorCard />
    </div>
  );
}
