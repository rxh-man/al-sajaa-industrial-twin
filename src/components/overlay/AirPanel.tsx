import { useState } from 'react';
import { Wind, X } from 'lucide-react';
import '../../styles/opsAgent.css';
import '../../styles/sustainability.css';
import { useTwinStore } from '../../store/useTwinStore';
import {
  CO2_OFFSET_PCT,
  CO2_KG_ABSORBED_PER_TREE_YEAR,
  CONTRIBUTORS,
  FACTORY_CO2_T,
  FACTORY_COUNT,
  O2_KG_PER_TREE_YEAR,
  POLLUTANT_TYPES_COVERED,
  SHADE_TREE_COUNT,
  TREE_CO2_ABSORBED_T_PER_YEAR,
  TREE_O2_T_PER_YEAR,
} from '../../data/airClimate';
import { HOTTEST, LOUDEST, MOST_CONGESTED, type Exposure } from '../../data/exposure';
import { FACILITIES, CATEGORIES } from '../../sustainability/facilities';
import { airFilterMatch, NO_AIR_FILTERS, useEnv } from '../../env/store';
import { WeatherCard } from '../../env/WeatherCard';

const FACTORY_FACILITIES = FACILITIES.filter((f) => f.category.group === 'factory');
const FACTORY_CATS = CATEGORIES.filter((c) => FACTORY_FACILITIES.some((f) => f.category.id === c.id));

/** Filters for the smoke plumes and wind, shared with the 3D scene (env/store). */
function AirFilters() {
  const air = useEnv((e) => e.air);
  const setAir = useEnv((e) => e.setAir);
  const wind = useEnv((e) => e.wind);
  const setWind = useEnv((e) => e.setWind);
  const [q, setQ] = useState('');
  const shown = FACTORY_FACILITIES.filter((f) => airFilterMatch(f, air));
  const active = air.categories.length + (air.minCo2 > 0 ? 1 : 0) + (air.abatement !== 'all' ? 1 : 0);
  const toggle = (id: string) => setAir({ ...air, categories: air.categories.includes(id) ? air.categories.filter((c) => c !== id) : [...air.categories, id] });
  const cats = FACTORY_CATS.filter((c) => !q || c.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <fieldset className="ops-inputs air-filters">
      <legend>
        Filters {active > 0 && <span className="sus-count">{active}</span>}
        {active > 0 && (
          <button className="ops-chip" onClick={() => setAir(NO_AIR_FILTERS)}>
            Clear all
          </button>
        )}
      </legend>
      <input className="air-search" type="search" placeholder="Search factory types" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search factory types" />
      <div className="sus-chips" role="group" aria-label="Factory type">
        {cats.map((c) => (
          <button key={c.id} className={`ops-chip ${air.categories.includes(c.id) ? 'is-on' : ''}`} aria-pressed={air.categories.includes(c.id)} onClick={() => toggle(c.id)}>
            {c.label}
          </button>
        ))}
        {cats.length === 0 && <span className="ops-muted ops-small">No factory type matches “{q}”.</span>}
      </div>
      <label className="ops-range">
        <span>
          Minimum estimated CO₂ <b>{air.minCo2}</b> t/yr
        </span>
        <input type="range" min={0} max={600} step={25} value={air.minCo2} onChange={(e) => setAir({ ...air, minCo2: Number(e.target.value) })} />
      </label>
      <label className="ops-select">
        <span>Pollution controls</span>
        <select value={air.abatement} onChange={(e) => setAir({ ...air, abatement: e.target.value as 'all' | 'none' | 'any' })}>
          <option value="all">All factories</option>
          <option value="none">No abatement fitted</option>
          <option value="any">Filters or low-NOx fitted</option>
        </select>
      </label>
      <label className="ops-range">
        <span>
          Wind toward <b>{wind.dirDeg}°</b> at <b>{wind.speedMs}</b> m/s <span className="ops-muted">({wind.source === 'observed' ? `observed ${wind.observedAt ?? ''}` : wind.source})</span>
        </span>
        <input type="range" min={0} max={355} step={5} value={wind.dirDeg} onChange={(e) => setWind({ dirDeg: Number(e.target.value), source: 'user' })} aria-label="Wind direction" />
        <input type="range" min={0} max={15} step={0.5} value={wind.speedMs} onChange={(e) => setWind({ speedMs: Number(e.target.value), source: 'user' })} aria-label="Wind speed" />
      </label>
      <p className="ops-small">
        <b>{shown.length}</b> of {FACTORY_FACILITIES.length} factories shown · plume size follows each factory's estimated emissions (not measured air quality).
      </p>
    </fieldset>
  );
}

const n = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

export function AirPanel() {
  const open = useTwinStore((s) => s.airPanel);
  const setOpen = useTwinStore((s) => s.setAirPanel);
  const on = useTwinStore((s) => s.airOn);
  const setOn = useTwinStore((s) => s.setAirOn);
  if (!open) return null;

  const maxFactories = Math.max(...CONTRIBUTORS.map((c) => c.factories), 1);

  return (
    <section className="ov-panel air-panel" aria-label="Air, pollution and climate (simulated)">
      <header className="ov-head">
        <span className="ov-title">
          <Wind size={13} /> Air &amp; climate
        </span>
        <button className="icon-btn sm" onClick={() => setOpen(false)} aria-label="Hide air and climate">
          <X size={13} />
        </button>
      </header>
      <p className="air-note">Simulated. Emission levels are assigned by the model, not measured. Rates are assumptions to verify.</p>
      <AirFilters />
      <WeatherCard />

      <h3 className="air-h">Factories and pollution</h3>
      <p className="air-line">
        <strong>{FACTORY_COUNT}</strong> factory halls are emitting into the air, each contributing to up to <strong>{POLLUTANT_TYPES_COVERED}</strong> pollution types.
      </p>
      <ul className="air-bars">
        {CONTRIBUTORS.map((c) => (
          <li key={c.name}>
            <span className="air-bar-label">{c.name}</span>
            <span className="air-bar">
              <span style={{ width: `${(c.factories / maxFactories) * 100}%` }} />
            </span>
            <span className="air-bar-value">
              {c.factories} factories
              <small> ({c.highLevel} high)</small>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="air-h">Climate</h3>
      <p className="air-line">
        Simulated factory CO2: <strong>{n(FACTORY_CO2_T)} t per year</strong>.
      </p>
      <p className="air-line">
        Shade trees absorb about <strong>{n(TREE_CO2_ABSORBED_T_PER_YEAR)} t CO2 per year</strong>, offsetting <strong>{n(CO2_OFFSET_PCT, 1)}%</strong> of it.
      </p>

      <h3 className="air-h">Trees and oxygen</h3>
      <p className="air-line">
        {n(SHADE_TREE_COUNT)} shade trees × {O2_KG_PER_TREE_YEAR} kg O2 per tree per year = <strong>{n(TREE_O2_T_PER_YEAR)} t O2 per year</strong>.
      </p>
      <p className="air-calc">
        Assumption: {O2_KG_PER_TREE_YEAR} kg O2 and {CO2_KG_ABSORBED_PER_TREE_YEAR} kg CO2 absorbed per mature tree per year. Palms and hedges are not counted.
      </p>

      <h3 className="air-h">Heat, traffic and noise (simulated)</h3>
      <ExposureList title="Most congested" rows={MOST_CONGESTED} value={(e) => `${e.traffic} index · ${e.roads} road segments`} />
      <ExposureList title="Hottest" rows={HOTTEST} value={(e) => `+${n(e.heatC, 1)} °C above shade`} />
      <ExposureList title="Loudest" rows={LOUDEST} value={(e) => `${e.noiseDb} dB(A)`} />
      <p className="air-calc">Model estimates from road density, nearby factories and trees. Not measured.</p>

      <div className="air-actions">
        <button className={`link-btn ${on ? 'is-on' : ''}`} onClick={() => setOn(!on)} aria-pressed={on}>
          {on ? 'Hide smoke and oxygen in scene' : 'Show smoke and oxygen in scene'}
        </button>
      </div>
    </section>
  );
}

function ExposureList({ title, rows, value }: { title: string; rows: Exposure[]; value: (e: Exposure) => string }) {
  return (
    <div className="air-exp">
      <p className="air-exp-title">{title}</p>
      <ul className="air-bars">
        {rows.map((e) => (
          <li key={e.name}>
            <span className="air-bar-label">{e.name}</span>
            <span className="air-bar-value">
              {value(e)} · {e.factories} factories within 300 m
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
