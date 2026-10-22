import { useTwinStore } from '../../store/useTwinStore';
import { FORECAST_48H, FORECAST_IS_SIMULATED } from '../../data/forecast48';

/** The +48H view: simulated issues for the next two days and who they affect. Shown only while +48H is on. */
export function Forecast48Panel() {
  const future = useTwinStore((s) => s.future);
  if (!future) return null;
  const items = [...FORECAST_48H].sort((a, b) => a.startsInH - b.startsInH);
  return (
    <aside className="forecast48 panel-enter" aria-label="48-hour outlook">
      <p className="f48-kicker">{FORECAST_IS_SIMULATED ? 'Simulated data' : 'Forecast'} · next 48 hours · not a live warning, not an official alert</p>
      <ul>
        {items.map((it) => (
          <li key={it.id} className={`f48-item f48-${it.kind}`}>
            <div className="f48-when">In about {it.startsInH} h</div>
            <div className="f48-title">{it.title}</div>
            <div className="f48-affects">Affects: {it.affects.join(', ')}</div>
            <p>{it.notice}</p>
          </li>
        ))}
      </ul>
      <p className="f48-verify">Official route: verify before you go. Check the utility, municipality or the place itself for the current notice.</p>
    </aside>
  );
}

/** Emergency numbers, always on screen. */
export function EmergencyBar() {
  return (
    <div className="emergency-bar" role="note" aria-label="Emergency numbers">
      <span>Emergency:</span>
      <b>999</b> police
      <b>998</b> ambulance
      <span className="eb-sim">Data on this map is simulated.</span>
    </div>
  );
}
