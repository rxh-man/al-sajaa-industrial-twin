import { useEffect, useState } from 'react';
import { CloudSun, RefreshCw } from 'lucide-react';
import { ATTRIBUTION, fetchWeather, plumeDirFromMeteo, type WeatherResult } from './weather';
import { useEnv } from './store';

/**
 * Current external weather (Open-Meteo model data) next to the simulated models. Observations are labelled
 * "External", kept separate from simulated outputs, and only replace the assumed wind when the user applies them.
 */
export function WeatherCard() {
  const [res, setRes] = useState<WeatherResult | null>(null);
  const [loading, setLoading] = useState(true);
  const setWind = useEnv((e) => e.setWind);
  const load = () => {
    let alive = true;
    setLoading(true);
    fetchWeather().then((r) => {
      if (!alive) return;
      setRes(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  };
  useEffect(load, []);
  return (
    <section className="ops-sec weather-card" aria-live="polite">
      <h4>
        <CloudSun size={14} aria-hidden /> Weather now (external)
        <button className="ops-chip" onClick={load} disabled={loading} aria-label="Refresh weather">
          <RefreshCw size={12} />
        </button>
      </h4>
      {loading && <p className="ops-small ops-muted">Loading…</p>}
      {!loading && res && !res.ok && <p className="ops-small ops-wait">{res.reason} The twin keeps its assumed wind; nothing else depends on this feed.</p>}
      {!loading && res?.ok && (
        <>
          <div className="sus-grid2 ops-small">
            <span>Temperature</span>
            <b>{res.weather.temperatureC.toFixed(1)} °C</b>
            <span>Humidity</span>
            <b>{Math.round(res.weather.humidityPct)} %</b>
            <span>Wind</span>
            <b>
              {res.weather.windMs.toFixed(1)} m/s from {Math.round(res.weather.windFromDeg)}°
            </b>
            <span>Solar irradiance</span>
            <b>{Math.round(res.weather.irradianceWm2)} W/m²</b>
            <span>Valid for</span>
            <b>
              {res.weather.time} (Gulf time){res.cached ? ' · cached' : ''}
            </b>
          </div>
          <button className="ops-btn" onClick={() => setWind({ dirDeg: Math.round(plumeDirFromMeteo(res.weather.windFromDeg)), speedMs: Math.round(res.weather.windMs * 2) / 2, source: 'observed', observedAt: res.weather.time })}>
            Use this wind for the smoke and air model
          </button>
        </>
      )}
      <p className="ops-small ops-muted">
        <span className="ops-basis">External</span> {ATTRIBUTION}. Model weather, not a measurement at the site.
      </p>
    </section>
  );
}
