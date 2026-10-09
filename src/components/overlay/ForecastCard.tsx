import { useMemo } from 'react';
import { useTwinStore } from '../../store/useTwinStore';
import { INCIDENT } from '../../data/incident';

const W = 236;
const H = 70;
const X = (h: number) => (h / 72) * W;
const Y = (v: number) => 4 + (1 - v / 100) * (H - 8);
const health = (t: number) => Math.max(4, 67 - 27 * Math.pow(t / 44, 1.6));

/** One line, one prediction band, one conclusion — shown only while a failure is forecast. */
export function ForecastCard() {
  const prediction = useTwinStore((s) => s.snap.prediction);
  const repairing = useTwinStore((s) => s.snap.repairStep > 0);
  const future = useTwinStore((s) => s.future);
  const show = (prediction && !repairing) || future;
  const [a, b] = INCIDENT.failureWindow;

  const curve = useMemo(() => {
    const pts: string[] = [];
    for (let t = 0; t <= 72; t += 1.5) pts.push(`${t ? 'L' : 'M'}${X(t).toFixed(1)},${Y(health(t)).toFixed(1)}`);
    return pts.join('');
  }, []);

  return (
    <div className={`forecast ${show ? 'is-on' : ''}`} aria-hidden={!show}>
      <div className="forecast-head">
        <span>Could break in</span>
        <b className="tnum">
          {a}–{b} h
        </b>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="forecast-svg" role="img" aria-label={`Predicted failure ${a} to ${b} hours`}>
        <defs>
          <linearGradient id="fc-bg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(52,211,153,0.08)" />
            <stop offset="55%" stopColor="rgba(245,181,68,0.05)" />
            <stop offset="100%" stopColor="rgba(255,93,82,0.12)" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#fc-bg)" rx="4" />
        <rect x={X(a)} y="0" width={X(b) - X(a)} height={H} className="forecast-window" />
        {show && <path d={curve} className="forecast-line" pathLength={1} />}
        <circle cx={X(0) + 3} cy={Y(67)} r="3.5" className="forecast-now" />
        {future && <line x1={X(48)} x2={X(48)} y1="0" y2={H} className="forecast-future" />}
      </svg>
      <div className="forecast-axis">
        <span>Now</span>
        <span>72 h</span>
      </div>
    </div>
  );
}
