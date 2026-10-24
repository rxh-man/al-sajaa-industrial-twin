import { useMemo, useState } from 'react';
import { Leaf, RotateCcw, X } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { ASSUMPTIONS, BASELINE, DISTRICT_M2, MAJOR_ROAD_KM, PARK_COUNT, PARK_M2, ROOF_M2, WAREHOUSE_ROOF_M2, WAREHOUSE_ROOFS, HEAT_EXPOSED_FACTORIES, dayProfile, run, type Scenario } from '../../data/climateAgents';
import { SHADE_TREE_COUNT, FACTORY_COUNT } from '../../data/airClimate';
import { AGENTS, PROMPTS, answer, type AgentId } from '../../data/climateAgentAnswers';

const n = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="climate-sec" open={open}>
      <summary>{title}</summary>
      <div className="climate-body">{children}</div>
    </details>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="climate-tag">{children}</span>;
}

function DayChart({ sc }: { sc: Scenario }) {
  const d = dayProfile(sc);
  const max = Math.max(1e-6, ...d.gen, ...d.demand, ...d.used);
  const W = 240, H = 70;
  const pts = (arr: number[]) => arr.map((v, i) => `${(i / 23) * W},${H - (v / max) * H}`).join(' ');
  return (
    <svg className="climate-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Typical day: solar, demand and supply">
      <polyline points={pts(d.gen)} fill="none" stroke="#e7c24a" strokeWidth="1.5" />
      <polyline points={pts(d.demand)} fill="none" stroke="#9aa3ad" strokeWidth="1.5" strokeDasharray="3 2" />
      <polyline points={pts(d.used)} fill="none" stroke="#3fb37a" strokeWidth="1.5" />
    </svg>
  );
}

export function ClimatePanel() {
  const open = useTwinStore((s) => s.climatePanel);
  const setOpen = useTwinStore((s) => s.setClimatePanel);
  const heatOn = useTwinStore((s) => s.heatOn);
  const setHeatOn = useTwinStore((s) => s.setHeatOn);
  const solarOn = useTwinStore((s) => s.solarOn);
  const setSolarOn = useTwinStore((s) => s.setSolarOn);
  const corridorsOn = useTwinStore((s) => s.corridorsOn);
  const setCorridorsOn = useTwinStore((s) => s.setCorridorsOn);
  const [sc, setSc] = useState<Scenario>(BASELINE);
  const [cost, setCost] = useState('');
  const [agent, setAgent] = useState<string | null>(null);
  const base = useMemo(() => run(BASELINE), []);
  const cur = useMemo(() => run(sc), [sc]);
  if (!open) return null;

  const set = <K extends keyof Scenario>(k: K, v: Scenario[K]) => setSc((s) => ({ ...s, [k]: v }));
  const reset = () => {
    setSc(BASELINE);
    setHeatOn(false);
    setSolarOn(false);
    setCorridorsOn(false);
    setAgent(null);
    setCost('');
  };
  const pct = (v: number) => `${n(v * 100)}%`;
  const diff = (a: number, b: number, d = 0) => {
    const delta = b - a;
    const p = a !== 0 ? (delta / Math.abs(a)) * 100 : null;
    return { delta: `${delta >= 0 ? '+' : ''}${n(delta, d)}`, pct: p === null ? 'n/a' : `${p >= 0 ? '+' : ''}${n(p, 1)}%` };
  };
  const rows: { label: string; a: number; b: number; d?: number; basis: string }[] = [
    { label: 'Net CO2, t per year', a: base.netCo2T, b: cur.netCo2T, basis: 'Model estimate' },
    { label: 'Solar generation, MWh per year', a: base.solarMWh, b: cur.solarMWh, d: 1, basis: 'Assumption' },
    { label: 'Electricity demand, MWh per year', a: base.demandMWh, b: cur.demandMWh, basis: 'Assumption' },
    { label: 'Grid electricity displaced, MWh per year', a: base.gridAvoidedMWh, b: cur.gridAvoidedMWh, d: 1, basis: 'Assumption' },
    { label: 'Grid emissions avoided, t per year', a: 0, b: cur.solarCo2AvoidedT, d: 1, basis: 'Assumption' },
    { label: 'Vegetation CO2 uptake, t per year', a: base.treeCo2AbsorbedT, b: cur.treeCo2AbsorbedT, d: 1, basis: 'Assumption' },
    { label: 'Green-space canopy, %', a: base.canopyPct, b: cur.canopyPct, d: 3, basis: 'Assumption' },
    { label: 'Heat index, relative', a: base.heatIndex, b: cur.heatIndex, d: 1, basis: 'Illustrative' },
    { label: 'Truck CO2, t per year', a: base.truckCo2T, b: cur.truckCo2T, basis: 'Assumption' },
  ];

  return (
    <section className="ov-panel climate-panel" aria-label="Climate agents (simulated)">
      <header className="ov-head">
        <span className="ov-title">
          <Leaf size={13} /> Climate agents
        </span>
        <span className="ov-head-actions">
          <button className="icon-btn sm" onClick={reset} aria-label="Reset to baseline" title="Reset to baseline scenario">
            <RotateCcw size={13} />
          </button>
          <button className="icon-btn sm" onClick={() => setOpen(false)} aria-label="Hide climate agents">
            <X size={13} />
          </button>
        </span>
      </header>
      <p className="air-note">
        Simulated. Values are computed from the scene layout or are labelled assumptions. Nothing here is measured. Cost is only shown when you enter a figure.
      </p>

      <Section title="Scenario controls" open>
        <div className="climate-ctrl">
          <label>
            Solar coverage of usable roofs: <strong>{pct(sc.solarCoverage)}</strong>
            <input type="range" min={0} max={1} step={0.05} value={sc.solarCoverage} onChange={(e) => set('solarCoverage', Number(e.target.value))} />
          </label>
          <label className="climate-check">
            <input type="checkbox" checked={sc.battery} onChange={(e) => set('battery', e.target.checked)} /> Battery storage (sized to {pct(ASSUMPTIONS.batteryDayShare.v)} of daily generation)
          </label>
          <label>
            Extra trees on green corridors: <strong>{n(sc.extraTrees)}</strong>
            <input type="range" min={0} max={500} step={10} value={sc.extraTrees} onChange={(e) => set('extraTrees', Number(e.target.value))} />
          </label>
          <label>
            Electric share of truck km: <strong>{pct(sc.evShare)}</strong>
            <input type="range" min={0} max={1} step={0.05} value={sc.evShare} onChange={(e) => set('evShare', Number(e.target.value))} />
          </label>
          <label>
            Hot-weather intensity (hypothetical): <strong>{pct(sc.hotWeather)}</strong>
            <input type="range" min={0} max={1} step={0.05} value={sc.hotWeather} onChange={(e) => set('hotWeather', Number(e.target.value))} />
          </label>
          <label>
            Grid emission factor, kg CO2 per kWh (assumed, verify): <strong>{n(sc.gridKg, 2)}</strong>
            <input type="range" min={0} max={1} step={0.01} value={sc.gridKg} onChange={(e) => set('gridKg', Number(e.target.value))} />
          </label>
          <label className="climate-check">
            <input type="checkbox" checked={sc.reflectiveRoofs} onChange={(e) => set('reflectiveRoofs', e.target.checked)} /> Reflective roofing (illustrative heat effect)
          </label>
          <label className="climate-check">
            <input type="checkbox" checked={sc.optimisedRouting} onChange={(e) => set('optimisedRouting', e.target.checked)} /> Optimised routes and less idling (illustrative)
          </label>
        </div>
      </Section>

      <Section title="Layers in the 3D scene" open>
        <div className="climate-ctrl">
          <label className="climate-check">
            <input type="checkbox" checked={heatOn} onChange={(e) => setHeatOn(e.target.checked)} /> Heat overlay: ground, roads and roofs (relative)
          </label>
          <label className="climate-check">
            <input type="checkbox" checked={solarOn} onChange={(e) => setSolarOn(e.target.checked)} /> Warehouse roofs for solar (blue)
          </label>
          <label className="climate-check">
            <input type="checkbox" checked={corridorsOn} onChange={(e) => setCorridorsOn(e.target.checked)} /> Freight corridors by road class
          </label>
        </div>
        <p className="climate-note">Click a factory's smoke in the scene to open its profile: CO2 per day and year, share of the total, level by pollutant, the reason and the options to reduce it.</p>
      </Section>

      <Section title="Baseline vs proposed" open>
        <table className="climate-table">
          <thead>
            <tr>
              <th>Measure</th>
              <th>Baseline</th>
              <th>Proposed</th>
              <th>Change</th>
              <th>Basis</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dd = diff(r.a, r.b, r.d ?? 0);
              return (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td>{n(r.a, r.d ?? 0)}</td>
                  <td>{n(r.b, r.d ?? 0)}</td>
                  <td>
                    {dd.delta} <small>({dd.pct})</small>
                  </td>
                  <td>
                    <Tag>{r.basis}</Tag>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td>Estimated intervention cost</td>
              <td colSpan={3}>{cost && Number(cost) > 0 ? `Your figure: ${n(Number(cost) * (ROOF_M2 * ASSUMPTIONS.roofUsableShare.v * sc.solarCoverage * ASSUMPTIONS.kwpPerM2.v) / 1e6, 2)} million (your currency, solar only)` : 'Not in the data. Enter a cost below.'}</td>
              <td>
                <Tag>No source</Tag>
              </td>
            </tr>
          </tbody>
        </table>
        <label className="climate-cost">
          Your cost per kWp (optional, your own figure):
          <input type="number" min={0} value={cost} placeholder="not set" onChange={(e) => setCost(e.target.value)} />
        </label>
        <p className="climate-note">
          Categories: measured or external data: none in this model. Calculated: layout areas and counts. Assumptions and illustrative effects: tagged in each row. Trade-offs: solar uses roof space and needs storage; trees need water and space; routing changes add operational work.
        </p>
      </Section>

      <Section title="Solar, storage and demand">
        <p>
          Warehouse roofs: <strong>{n(WAREHOUSE_ROOF_M2)} m²</strong>; warehouses and factory halls: <strong>{n(ROOF_M2)} m²</strong>. <Tag>Layout</Tag>
        </p>
        <ul className="air-bars">
          {WAREHOUSE_ROOFS.slice(0, 5).map((r) => (
            <li key={r.name}>
              <span className="air-bar-label">{r.name}</span>
              <span className="air-bar-value">
                {n(r.m2)} m² · {n((r.m2 * ASSUMPTIONS.roofUsableShare.v * ASSUMPTIONS.kwpPerM2.v * ASSUMPTIONS.yieldKwhPerKwp.v * sc.solarCoverage) / 1000, 1)} MWh per year
              </span>
            </li>
          ))}
        </ul>
        <p>Typical day (assumption: flat demand; storage shifts surplus to the evening). Solar: yellow. Demand: grey dashed. Used on site: green.</p>
        <DayChart sc={sc} />
        <p className="climate-note">Battery round trip {pct(ASSUMPTIONS.batteryRoundTrip.v)} (assumption). A battery moves energy in time; it does not create energy.</p>
      </Section>

      <Section title="Heat-exposed factories">
        <ul className="air-bars">
          {HEAT_EXPOSED_FACTORIES.map((x) => (
            <li key={x.f.id}>
              <span className="air-bar-label">Factory {x.f.id}</span>
              <span className="air-bar-value">relative heat {n(x.h, 2)} · {n(x.f.co2T)} t CO2 per year (simulated)</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Green infrastructure">
        <p>
          {n(SHADE_TREE_COUNT)} shade trees; {PARK_COUNT} park areas in the data ({n(PARK_M2)} m²). Canopy of the district: <strong>{n(cur.canopyPct, 3)}%</strong> of {n(DISTRICT_M2 / 1e6, 1)} km². <Tag>Layout</Tag>
        </p>
        <p>
          Trees absorb about <strong>{n(cur.treeCo2AbsorbedT, 1)} t CO2 per year</strong> against {n(FACTORY_COUNT)} factories emitting {n(cur.factoryCo2T)} t (simulated). Planting does not offset a facility on its own. <Tag>Assumption</Tag>
        </p>
      </Section>

      <Section title="Transport">
        <p>
          Major roads (motorway, trunk, primary): <strong>{n(MAJOR_ROAD_KM, 1)} km</strong>. Truck CO2 in this scenario: <strong>{n(cur.truckCo2T)} t per year</strong>. <Tag>Assumption</Tag>
        </p>
      </Section>

      <Section title="Climate Intelligence Agents" open>
        <p className="climate-note">Local demo agents. Answers are computed from this model. No AI service is connected.</p>
        <div className="climate-prompts">
          {PROMPTS.map((p) => (
            <button key={p.id} className={`climate-prompt ${agent === p.id ? 'is-on' : ''}`} onClick={() => setAgent(p.id)}>
              {AGENTS[p.agent as AgentId]}: {p.text}
            </button>
          ))}
        </div>
        {agent && (() => {
          const a = answer(agent, sc);
          return (
            <div className="climate-answer">
              <p className="climate-agent">{a.agent}</p>
              <ul>
                {a.points.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {a.evidence.length > 0 && <p className="climate-note">Evidence: {a.evidence.join(' ')}</p>}
              {a.limits.length > 0 && <p className="climate-note">Limits: {a.limits.join(' ')}</p>}
            </div>
          );
        })()}
      </Section>
    </section>
  );
}
