import { useMemo, useState } from 'react';
import { Leaf, X } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { AD } from '../../data/abudhabi';
import { ASSUMPTIONS, BASELINE, BASE_OUTCOME, DISTRICT_M2, HEAT_INDEX, MAJOR_ROAD_KM, PARK_COUNT, PARK_M2, ROOF_M2, WAREHOUSE_ROOF_M2, run, type Scenario } from '../../data/climateAgents';
import { FACTORY_COUNT, FACTORY_CO2_T, SHADE_TREE_COUNT } from '../../data/airClimate';

const WAREHOUSE_ROOFS = AD.buildings
  .filter((b) => b.n === 'Logistics warehouse')
  .map((b, i) => ({ name: `Warehouse ${i + 1}`, m2: b.b.reduce((a, [x0, z0, x1, z1]) => a + (x1 - x0) * 10 * (z1 - z0) * 10, 0) }))
  .sort((a, b) => b.m2 - a.m2);

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

export function ClimatePanel() {
  const open = useTwinStore((s) => s.climatePanel);
  const setOpen = useTwinStore((s) => s.setClimatePanel);
  const heatOn = useTwinStore((s) => s.heatOn);
  const setHeatOn = useTwinStore((s) => s.setHeatOn);
  const solarOn = useTwinStore((s) => s.solarOn);
  const setSolarOn = useTwinStore((s) => s.setSolarOn);
  const [cost, setCost] = useState('');
  const [sc, setSc] = useState<Scenario>(BASELINE);
  const proposed = useMemo(() => run(sc), [sc]);
  if (!open) return null;

  const set = <K extends keyof Scenario>(k: K, v: Scenario[K]) => setSc((s) => ({ ...s, [k]: v }));
  const pct = (v: number) => `${n(v * 100)}%`;

  return (
    <section className="ov-panel climate-panel" aria-label="Climate agents (simulated)">
      <header className="ov-head">
        <span className="ov-title">
          <Leaf size={13} /> Climate agents
        </span>
        <button className="icon-btn sm" onClick={() => setOpen(false)} aria-label="Hide climate agents">
          <X size={13} />
        </button>
      </header>
      <p className="air-note">
        Simulated. Values are computed from the scene layout or are labelled assumptions. Not measurements. Cost data is not in this model.
      </p>

      <Section title="1 · Pollution sources" open>
        <p>
          {FACTORY_COUNT} factory halls, simulated CO2 <strong>{n(FACTORY_CO2_T)} t per year</strong>. Click or hover a factory for its pollutant levels and monthly variation.
        </p>
        <p className="climate-note">Road and plume colour coding are not drawn; traffic congestion is in the Air panel.</p>
      </Section>

      <Section title="2 · Green infrastructure and carbon">
        <p>
          {n(SHADE_TREE_COUNT)} shade trees: <strong>{n(BASE_OUTCOME.treeO2T)} t O2</strong> and <strong>{n(BASE_OUTCOME.treeCo2AbsorbedT)} t CO2</strong> absorbed per year. Canopy{' '}
          <strong>{n(BASE_OUTCOME.canopyPct, 3)}%</strong> of the district.
        </p>
        <p>
          {PARK_COUNT} park areas in the data, {n(PARK_M2)} m². <Tag>Assumption</Tag> rates per tree.
        </p>
      </Section>

      <Section title="3 · Solar and storage">
        <div className="climate-ctrl">
          <label className="climate-check">
            <input type="checkbox" checked={solarOn} onChange={(e) => setSolarOn(e.target.checked)} /> Show warehouse roofs for solar (3D)
          </label>
        </div>
        <ul className="air-bars">
          {WAREHOUSE_ROOFS.slice(0, 5).map((r) => (
            <li key={r.name}>
              <span className="air-bar-label">{r.name}</span>
              <span className="air-bar-value">
                {n(r.m2)} m² · {n((r.m2 * ASSUMPTIONS.roofUsableShare.v * ASSUMPTIONS.kwpPerM2.v * ASSUMPTIONS.yieldKwhPerKwp.v * sc.solarCoverage) / 1000)} MWh per year
              </span>
            </li>
          ))}
        </ul>
        <label className="climate-cost">
          Your cost per kWp (enter a figure, no source in the data): 
          <input type="number" min={0} value={cost} placeholder="not set" onChange={(e) => setCost(e.target.value)} />
        </label>
        {cost && Number(cost) > 0 && (
          <p>
            Installed capacity at this coverage: <strong>{n((ROOF_M2 * ASSUMPTIONS.roofUsableShare.v * sc.solarCoverage * ASSUMPTIONS.kwpPerM2.v) / 1000, 1)} MWp</strong>. Capital cost at your figure:{' '}
            <strong>{n((ROOF_M2 * ASSUMPTIONS.roofUsableShare.v * sc.solarCoverage * ASSUMPTIONS.kwpPerM2.v * Number(cost)) / 1e6, 2)} million (your currency)</strong>.
          </p>
        )}
        <div className="climate-ctrl">
          <label className="climate-check">
            <input type="checkbox" checked={heatOn} onChange={(e) => setHeatOn(e.target.checked)} /> Show heat overlay on roofs, roads and open land (3D)
          </label>
        </div>
        <p>
          Warehouse roofs: <strong>{n(WAREHOUSE_ROOF_M2)} m²</strong>. Warehouse and factory roofs: <strong>{n(ROOF_M2)} m²</strong>. <Tag>Layout</Tag>
        </p>
        <p>
          At the chosen coverage, solar generates <strong>{n(proposed.solarMWh)} MWh per year</strong>, avoids {n(proposed.gridAvoidedMWh)} MWh of grid imports and{' '}
          {n(proposed.solarCo2AvoidedT)} t CO2 at {ASSUMPTIONS.gridKgPerKwh.v} kg per kWh. <Tag>Assumption</Tag> battery needs {n(proposed.batteryKwh)} kWh.
        </p>
      </Section>

      <Section title="4 · Climate resilience">
        <p>
          Heat index across named places: baseline <strong>{n(HEAT_INDEX, 1)}</strong> °C above shade (model). Interventions change it relatively, not in °C.
        </p>
      </Section>

      <Section title="5 · Transport and logistics">
        <p>
          Major roads (motorway, trunk, primary): <strong>{n(MAJOR_ROAD_KM, 1)} km</strong>. Truck CO2 at this scenario:{' '}
          <strong>{n(proposed.truckCo2T)} t per year</strong>. <Tag>Assumption</Tag> truck movements and trip length.
        </p>
      </Section>

      <Section title="6 · Intervention simulator" open>
        <div className="climate-ctrl">
          <label>
            Solar coverage of usable roofs: <strong>{pct(sc.solarCoverage)}</strong>
            <input type="range" min={0} max={1} step={0.05} value={sc.solarCoverage} onChange={(e) => set('solarCoverage', Number(e.target.value))} />
          </label>
          <label>
            Extra trees on green corridors: <strong>{n(sc.extraTrees)}</strong>
            <input type="range" min={0} max={500} step={10} value={sc.extraTrees} onChange={(e) => set('extraTrees', Number(e.target.value))} />
          </label>
          <label>
            Electric share of truck km: <strong>{pct(sc.evShare)}</strong>
            <input type="range" min={0} max={1} step={0.05} value={sc.evShare} onChange={(e) => set('evShare', Number(e.target.value))} />
          </label>
          <label className="climate-check">
            <input type="checkbox" checked={sc.reflectiveRoofs} onChange={(e) => set('reflectiveRoofs', e.target.checked)} /> Reflective roofing
          </label>
          <label className="climate-check">
            <input type="checkbox" checked={sc.optimisedRouting} onChange={(e) => set('optimisedRouting', e.target.checked)} /> Optimised routing and less idling
          </label>
        </div>
        <table className="climate-table">
          <thead>
            <tr>
              <th>Measure</th>
              <th>Baseline</th>
              <th>Proposed</th>
              <th>Basis</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Net CO2, t per year</td>
              <td>{n(BASE_OUTCOME.netCo2T)}</td>
              <td>{n(proposed.netCo2T)}</td>
              <td><Tag>Model estimate</Tag></td>
            </tr>
            <tr>
              <td>Solar generation, MWh</td>
              <td>0</td>
              <td>{n(proposed.solarMWh)}</td>
              <td><Tag>Assumption</Tag></td>
            </tr>
            <tr>
              <td>Oxygen, t per year</td>
              <td>{n(BASE_OUTCOME.treeO2T)}</td>
              <td>{n(proposed.treeO2T)}</td>
              <td><Tag>Assumption</Tag></td>
            </tr>
            <tr>
              <td>Canopy, %</td>
              <td>{n(BASE_OUTCOME.canopyPct, 3)}</td>
              <td>{n(proposed.canopyPct, 3)}</td>
              <td><Tag>Assumption</Tag></td>
            </tr>
            <tr>
              <td>Heat index, relative</td>
              <td>{n(BASE_OUTCOME.heatIndex, 1)}</td>
              <td>{n(proposed.heatIndex, 1)}</td>
              <td><Tag>Illustrative</Tag></td>
            </tr>
            <tr>
              <td>Cost</td>
              <td colSpan={2}>Not in the data</td>
              <td><Tag>No source</Tag></td>
            </tr>
          </tbody>
        </table>
        <p className="climate-note">District area {n(DISTRICT_M2 / 1e6, 1)} km². Trade-offs: solar uses roof area and needs storage; trees need water; reflective roofs help heat but not emissions.</p>
      </Section>
    </section>
  );
}
