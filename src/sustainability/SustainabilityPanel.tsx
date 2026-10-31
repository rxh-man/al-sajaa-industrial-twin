import { useEffect, useMemo, useState } from 'react';
import { Factory, Leaf, MapPin, Play, RotateCcw, Sun, TreePine, Droplets, Car, Thermometer, X, Building2 } from 'lucide-react';
import { useI18n } from '../i18n/i18nContext';
import { useTwinStore } from '../store/useTwinStore';
import { CATEGORIES } from './facilities';
import { DISTRICTS } from './districts';
import { BASE_LEVERS, MODEL_ASSUMPTIONS, snapshot, type Levers, type Snapshot } from './model';
import { PLANT_TYPES } from './green';
import { EV_BAYS } from '../data/evCharging';
import { runDevelopment, SIZES, type SizeId } from './development';
import { applyFilters, NO_FILTERS, useSusStore, type MapLayer } from './store';
import { susText, type SusText } from './i18n';
import '../styles/opsAgent.css';
import '../styles/sustainability.css';

const fmt = (v: number, d?: number) => {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const dd = d ?? (a >= 100 ? 0 : a >= 10 ? 1 : 2);
  return v.toLocaleString('en-US', { maximumFractionDigits: dd });
};
const kt = (t: number) => (Math.abs(t) >= 10000 ? `${fmt(t / 1000, 1)} kt` : `${fmt(t)} t`);
const pct = (a: number, b: number) => (Math.abs(b) < 1e-9 ? null : ((a - b) / Math.abs(b)) * 100);
const pctTxt = (p: number | null) => (p === null ? 'n/a' : `${p >= 0 ? '+' : ''}${fmt(p, 1)} %`);

function Basis({ b }: { b: 'Estimated' | 'Layout' | 'Assumption' | 'Simulated' }) {
  return <span className={`ops-basis b-${b.toLowerCase()}`}>{b}</span>;
}

/** a KPI card that, when clicked, shows its subject on the 3D map */
function Kpi({ icon, label, value, sub, basis, layer, active, onShow, t }: { icon: React.ReactNode; label: string; value: string; sub?: string; basis: 'Estimated' | 'Layout' | 'Assumption' | 'Simulated'; layer?: MapLayer; active?: boolean; onShow?: () => void; t: SusText }) {
  const body = (
    <>
      <div className="sus-kpi-top">
        {icon}
        <span>{label}</span>
      </div>
      <div className="sus-kpi-v">{value}</div>
      {sub && <div className="ops-small ops-muted">{sub}</div>}
      <div className="sus-kpi-foot">
        <Basis b={basis} />
        {layer && <span className="ops-small">{active ? t.onMap : t.showOnMap}</span>}
      </div>
    </>
  );
  return layer ? (
    <button className={`sus-kpi ${active ? 'is-on' : ''}`} onClick={onShow} aria-pressed={active}>
      {body}
    </button>
  ) : (
    <div className="sus-kpi">{body}</div>
  );
}

function Bars({ rows, unit, onPick }: { rows: { id: string; label: string; v: number; hl?: boolean }[]; unit: string; onPick?: (id: string) => void }) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.v)));
  return (
    <div className="ops-bars">
      {rows.map((r) => (
        <div key={r.id} className={`ops-bar-row ${r.hl ? 'is-sel' : ''}`} onClick={onPick ? () => onPick(r.id) : undefined} role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined} onKeyDown={onPick ? (e) => e.key === 'Enter' && onPick(r.id) : undefined}>
          <span className="ops-bar-name" title={r.label}>
            {r.label}
          </span>
          <span className="ops-bar-track" aria-hidden>
            <span className="ops-bar-fill" style={{ width: `${(Math.abs(r.v) / max) * 100}%` }} />
          </span>
          <span className="ops-bar-val">
            {fmt(r.v)} {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

function Lever({ id, label, value, min, max, step, unit, onChange, display }: { id: string; label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; display?: (v: number) => string }) {
  return (
    <label className="ops-range" htmlFor={`sus-${id}`}>
      <span>
        {label} <b>{display ? display(value) : fmt(value)}</b> {unit}
      </span>
      <input id={`sus-${id}`} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function useSnapshots() {
  const levers = useSusStore((s) => s.levers);
  const base = useMemo(() => snapshot(BASE_LEVERS), []);
  const cur = useMemo(() => snapshot(levers), [levers]);
  return { base, cur, levers };
}

function Overview({ t }: { t: SusText }) {
  const { base, cur, levers } = useSnapshots();
  const setLevers = useSusStore((s) => s.setLevers);
  const layer = useSusStore((s) => s.layer);
  const setLayer = useSusStore((s) => s.setLayer);
  const focusPlace = useTwinStore((s) => s.focusPlace);
  const show = (l: MapLayer, focus?: [number, number, number]) => {
    setLayer(layer === l ? 'none' : l);
    if (focus && layer !== l) focusPlace(...focus);
  };
  const c = cur.carbon;
  const changed = JSON.stringify(levers) !== JSON.stringify(BASE_LEVERS);
  const set = (k: keyof Levers) => (v: number) => setLevers({ ...levers, [k]: v });
  const delta = (a: number, b: number) => (changed ? ` · ${pctTxt(pct(a, b))} vs today` : '');
  return (
    <div className="ops-tab">
      <p className="ops-note">{t.estimateNote}</p>
      <div className="sus-kpis">
        <Kpi t={t} icon={<Leaf size={14} />} label={t.netCo2} value={kt(c.netT)} sub={`${t.perYear}${delta(c.netT, base.carbon.netT)}`} basis="Estimated" />
        <Kpi t={t} icon={<Factory size={14} />} label={t.industryCo2} value={kt(c.industryT - 0)} sub={`${cur.facilities.length} ${t.facilities}${delta(c.industryT, base.carbon.industryT)}`} basis="Estimated" layer="facilities" active={layer === 'facilities'} onShow={() => show('facilities', [-60, -160, 120])} />
        <Kpi t={t} icon={<Car size={14} />} label={t.vehicleCo2} value={kt(c.vehiclesT)} sub={`${fmt(cur.traffic.vehKmYear / 1e6, 1)} M veh-km/yr${delta(c.vehiclesT, base.carbon.vehiclesT)}`} basis="Estimated" layer="traffic" active={layer === 'traffic'} onShow={() => show('traffic', [-40, -40, 110])} />
        <Kpi t={t} icon={<Building2 size={14} />} label={t.buildingsCo2} value={kt(c.buildingsT)} sub={t.buildingsSub} basis="Estimated" />
        <Kpi t={t} icon={<TreePine size={14} />} label={t.trees} value={fmt(cur.green.total)} sub={`${fmt(c.treeUptakeT)} t CO₂/yr · ${fmt((c.treeUptakeT / c.emissionsT) * 100, 3)} % ${t.ofEmissions}`} basis="Layout" layer="trees" active={layer === 'trees'} onShow={() => show('trees', [10, 20, 90])} />
        <Kpi t={t} icon={<Sun size={14} />} label={t.solar} value={`${fmt(cur.energy.solarMWh / 1000, 1)} GWh`} sub={`${fmt((cur.energy.solarMWh / cur.energy.demandMWh) * 100, 2)} % ${t.ofDemand}`} basis="Estimated" layer="solar" active={layer === 'solar'} onShow={() => show('solar', [-250, -20, 70])} />
        <Kpi t={t} icon={<Droplets size={14} />} label={t.water} value={`${fmt(cur.water.totalM3Day)} m³/d`} sub={t.waterSub} basis="Estimated" layer="water" active={layer === 'water'} onShow={() => show('water', [1.5, -2.4, 30])} />
        <Kpi t={t} icon={<Thermometer size={14} />} label={t.heat} value={t.heatValue} sub={t.heatSub} basis="Simulated" layer="heat" active={layer === 'heat'} onShow={() => show('heat', [0, -40, 90])} />
      </div>

      <section className="ops-sec">
        <h4>{t.carbonBalance}</h4>
        <div className="sus-balance" role="img" aria-label={`${t.carbonBalance}: ${kt(c.netT)}`}>
          {[
            ['ind', t.industry, c.industryT],
            ['bld', t.buildings, c.buildingsT],
            ['veh', t.vehicles, c.vehiclesT],
          ].map(([k, l, v]) => (
            <span key={k as string} className={`sus-seg sus-${k}`} style={{ flex: Math.max(0.001, v as number) }} title={`${l}: ${kt(v as number)}`} />
          ))}
        </div>
        <div className="sus-legend ops-small">
          <span>
            <i className="sus-ind" /> {t.industry} {kt(c.industryT)}
          </span>
          <span>
            <i className="sus-bld" /> {t.buildings} {kt(c.buildingsT)}
          </span>
          <span>
            <i className="sus-veh" /> {t.vehicles} {kt(c.vehiclesT)}
          </span>
          <span>− {t.solarCut} {kt(c.solarCutT)}</span>
          <span>− {t.treeUptake} {kt(c.treeUptakeT)}</span>
        </div>
        <p className="ops-small ops-muted">{t.o2Note.replace('{o2}', fmt(cur.o2T))}</p>
      </section>

      <section className="ops-sec">
        <h4>
          {t.scenario}
          {changed && (
            <button className="ops-chip" onClick={() => setLevers(BASE_LEVERS)}>
              <RotateCcw size={12} /> {t.reset}
            </button>
          )}
        </h4>
        <div className="sus-levers">
          <Lever id="solar" label={t.lvSolar} value={levers.rooftopSolar * 100} min={0} max={100} step={5} unit="%" onChange={(v) => set('rooftopSolar')(v / 100)} />
          <Lever id="trees" label={t.lvTrees} value={levers.newTrees} min={0} max={20000} step={500} unit="" onChange={set('newTrees')} />
          <Lever id="abate" label={t.lvAbate} value={levers.abatement * 100} min={0} max={100} step={10} unit="%" onChange={(v) => set('abatement')(v / 100)} />
          <Lever id="elec" label={t.lvElectrify} value={levers.electrifyFuel * 100} min={0} max={100} step={10} unit="%" onChange={(v) => set('electrifyFuel')(v / 100)} />
          <Lever id="etruck" label={t.lvTrucks} value={levers.eTrucks * 100} min={0} max={100} step={10} unit="%" onChange={(v) => set('eTrucks')(v / 100)} />
          <Lever id="reuse" label={t.lvReuse} value={levers.reuse * 100} min={0} max={100} step={10} unit="%" onChange={(v) => set('reuse')(v / 100)} />
          <Lever id="grid" label={t.lvGrid} value={levers.gridKg} min={0.2} max={0.7} step={0.01} unit="kg/kWh" onChange={set('gridKg')} display={(v) => v.toFixed(2)} />
        </div>
        {changed && (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th scope="col">{t.indicator}</th>
                  <th scope="col">{t.today}</th>
                  <th scope="col">{t.withScenario}</th>
                  <th scope="col">{t.change}</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    [t.netCo2, base.carbon.netT, c.netT, 't/yr'],
                    [t.industryCo2, base.carbon.industryT, c.industryT, 't/yr'],
                    [t.vehicleCo2, base.carbon.vehiclesT, c.vehiclesT, 't/yr'],
                    [t.gridImport, base.energy.gridMWh, cur.energy.gridMWh, 'MWh/yr'],
                    [t.water, base.water.totalM3Day, cur.water.totalM3Day, 'm³/d'],
                    [t.dust, base.facilities.reduce((a, f) => a + f.pmIdx, 0), cur.facilities.reduce((a, f) => a + f.pmIdx, 0), 'index'],
                  ] as [string, number, number, string][]
                ).map(([l, a, b, u]) => (
                  <tr key={l}>
                    <th scope="row">{l}</th>
                    <td>
                      {fmt(a)} <span className="ops-unit">{u}</span>
                    </td>
                    <td>{fmt(b)}</td>
                    <td className={b < a ? 'ops-ok' : b > a ? 'ops-bad' : 'ops-muted'}>
                      {b - a >= 0 ? '+' : ''}
                      {fmt(b - a)} · {pctTxt(pct(b, a))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ops-sec">
        <h4>{t.byDistrict}</h4>
        <Bars unit="t" rows={cur.byDistrict.map((d) => ({ id: d.id, label: d.name, v: d.industryCo2 + d.vehicleCo2 }))} />
        <p className="ops-small ops-muted">{t.districtNote}</p>
      </section>
    </div>
  );
}

function Industry({ t, cur }: { t: SusText; cur: Snapshot }) {
  const filters = useSusStore((s) => s.filters);
  const setFilters = useSusStore((s) => s.setFilters);
  const picked = useSusStore((s) => s.picked);
  const pick = useSusStore((s) => s.pick);
  const setLayer = useSusStore((s) => s.setLayer);
  const focusPlace = useTwinStore((s) => s.focusPlace);
  const list = useMemo(() => applyFilters(cur.facilities, filters).sort((a, b) => b.co2T - a.co2T), [cur, filters]);
  const total = list.reduce((a, f) => a + f.co2T, 0);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const active = filters.categories.length + filters.districts.length + (filters.mitigation !== 'all' ? 1 : 0) + (filters.minCo2 > 0 ? 1 : 0);
  useEffect(() => setLayer('facilities'), [setLayer]);
  const sel = picked !== null ? cur.facilities.find((f) => f.id === picked) : null;
  return (
    <div className="ops-tab">
      <fieldset className="ops-inputs">
        <legend>
          {t.filters} {active > 0 && <span className="sus-count">{active}</span>}
          {active > 0 && (
            <button className="ops-chip" onClick={() => setFilters(NO_FILTERS)}>
              {t.clearAll}
            </button>
          )}
        </legend>
        <div className="ops-small ops-muted">{t.category}</div>
        <div className="sus-chips" role="group" aria-label={t.category}>
          {cur.byCategory.map((c) => (
            <button key={c.id} className={`ops-chip ${filters.categories.includes(c.id) ? 'is-on' : ''}`} aria-pressed={filters.categories.includes(c.id)} onClick={() => setFilters({ ...filters, categories: toggle(filters.categories, c.id) })}>
              {c.label} <span className="ops-muted">{c.count}</span>
            </button>
          ))}
        </div>
        <div className="ops-small ops-muted">{t.district}</div>
        <div className="sus-chips" role="group" aria-label={t.district}>
          {DISTRICTS.filter((d) => cur.byDistrict.find((q) => q.id === d.id)!.facilities > 0).map((d) => (
            <button key={d.id} className={`ops-chip ${filters.districts.includes(d.id) ? 'is-on' : ''}`} aria-pressed={filters.districts.includes(d.id)} onClick={() => setFilters({ ...filters, districts: toggle(filters.districts, d.id) })}>
              {d.name}
            </button>
          ))}
        </div>
        <div className="ops-row">
          <label className="ops-select">
            <span>{t.mitigation}</span>
            <select value={filters.mitigation} onChange={(e) => setFilters({ ...filters, mitigation: e.target.value as 'all' | 'none' | 'any' })}>
              <option value="all">{t.all}</option>
              <option value="none">{t.noAbatement}</option>
              <option value="any">{t.withAbatement}</option>
            </select>
          </label>
          <Lever id="minco2" label={t.minCo2} value={filters.minCo2} min={0} max={600} step={25} unit="t/yr" onChange={(v) => setFilters({ ...filters, minCo2: v })} />
        </div>
      </fieldset>
      <p className="ops-small">
        <b>{list.length}</b> {t.facilitiesMatch} · {kt(total)} CO₂/yr · {t.mapColoured}
      </p>
      {list.length === 0 && <p className="ops-muted">{t.empty}</p>}
      {sel && (
        <section className="ops-sec sus-detail" aria-live="polite">
          <h4>
            {sel.category.label}
            {sel.trade ? ` · ${sel.trade}` : ''} <span className="ops-muted ops-small">#{sel.id}</span>
            <button className="ops-chip" onClick={() => pick(null)}>
              {t.close}
            </button>
          </h4>
          <div className="sus-grid2 ops-small">
            <span>{t.floor}</span>
            <b>{fmt(sel.floorM2)} m²</b>
            <span>{t.utilisation}</span>
            <b>{fmt(sel.utilisation * 100, 0)} %</b>
            <span>{t.hours}</span>
            <b>{sel.hoursPerDay} h/day</b>
            <span>{t.fuel}</span>
            <b>{sel.category.fuel}</b>
            <span>{t.mitigation}</span>
            <b>{sel.mitigation}</b>
            <span>{t.electricity}</span>
            <b>{fmt(sel.elecMWh)} MWh/yr</b>
            <span>CO₂</span>
            <b>
              {fmt(sel.co2T)} t/yr ({fmt(sel.co2Parts.electricity)} {t.fromElec} + {fmt(sel.co2Parts.fuel)} {t.fromFuel} + {fmt(sel.co2Parts.process)} {t.fromProcess})
            </b>
            <span>{t.water}</span>
            <b>{fmt(sel.waterM3Day)} m³/day</b>
            <span>{t.trucks}</span>
            <b>{fmt(sel.trucksDay, 1)} /day</b>
            <span>{t.workers}</span>
            <b>{fmt(sel.workers, 0)}</b>
          </div>
          <Basis b="Estimated" />
        </section>
      )}
      <section className="ops-sec">
        <h4>{t.topEmitters}</h4>
        <ol className="sus-rank">
          {list.slice(0, 15).map((f) => (
            <li key={f.id}>
              <button
                className={`sus-rank-row ${picked === f.id ? 'is-sel' : ''}`}
                onClick={() => {
                  pick(f.id);
                  focusPlace(f.x, f.z, 14);
                }}
              >
                <span>
                  {f.category.label}
                  {f.trade ? ` · ${f.trade}` : ''} <span className="ops-muted">#{f.id}</span>
                </span>
                <span className="ops-muted ops-small">
                  {fmt(f.floorM2)} m² · {f.mitigation}
                </span>
                <b>{fmt(f.co2T)} t</b>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="ops-sec">
        <h4>{t.byCategory}</h4>
        <Bars
          unit="t"
          rows={cur.byCategory.map((c) => ({ id: c.id, label: `${c.label} (${c.count})`, v: c.co2T, hl: filters.categories.includes(c.id) }))}
          onPick={(id) => setFilters({ ...filters, categories: toggle(filters.categories, id) })}
        />
      </section>
      <section className="ops-sec">
        <h4>{t.categoryAssumptions}</h4>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">{t.category}</th>
                <th scope="col">kWh/m² elec</th>
                <th scope="col">kWh/m² fuel</th>
                <th scope="col">{t.fuel}</th>
                <th scope="col">kg/m² process</th>
                <th scope="col">h/day</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.label}</th>
                  <td>{c.elecKwhM2}</td>
                  <td>{c.fuelKwhM2}</td>
                  <td>{c.fuel}</td>
                  <td>{c.processKgM2}</td>
                  <td>{c.hoursPerDay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Basis b="Assumption" />
      </section>
    </div>
  );
}

function Green({ t, cur }: { t: SusText; cur: Snapshot }) {
  const setLayer = useSusStore((s) => s.setLayer);
  useEffect(() => setLayer('trees'), [setLayer]);
  const g = cur.green;
  return (
    <div className="ops-tab">
      <div className="sus-kpis">
        <Kpi t={t} icon={<TreePine size={14} />} label={PLANT_TYPES.shade.label} value={fmt(g.shade)} basis="Layout" />
        <Kpi t={t} icon={<TreePine size={14} />} label={PLANT_TYPES.palm.label} value={fmt(g.palms)} basis="Layout" />
        <Kpi t={t} icon={<Leaf size={14} />} label={t.treeUptake} value={`${fmt(g.co2T)} t/yr`} sub={`${fmt((g.co2T / cur.carbon.emissionsT) * 100, 3)} % ${t.ofEmissions}`} basis="Estimated" />
        <Kpi t={t} icon={<Leaf size={14} />} label={t.oxygen} value={`${fmt(g.o2T)} t/yr`} sub={t.o2Separate} basis="Estimated" />
        <Kpi t={t} icon={<TreePine size={14} />} label={t.canopy} value={`${fmt(g.canopyM2 / 10000, 1)} ha`} basis="Estimated" />
        <Kpi t={t} icon={<Leaf size={14} />} label={t.greenSpace} value={`${fmt(g.parkM2 / 10000, 1)} ha`} basis="Layout" />
        <Kpi t={t} icon={<Droplets size={14} />} label={t.irrigation} value={`${fmt(g.irrigationM3Day)} m³/d`} sub={`${fmt((g.irrigationM3Day * 365) / 1000)} ML/yr`} basis="Assumption" />
      </div>
      <section className="ops-sec">
        <h4>{t.canopyByDistrict}</h4>
        <Bars unit="%" rows={cur.byDistrict.map((d) => ({ id: d.id, label: `${d.name} (${d.trees})`, v: d.canopyPct }))} />
        <p className="ops-small">{t.greenFinding}</p>
      </section>
    </div>
  );
}

function EnergyWater({ t, cur }: { t: SusText; cur: Snapshot }) {
  const e = cur.energy;
  const w = cur.water;
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>{t.energy}</h4>
        <Bars
          unit="GWh"
          rows={[
            { id: 'ind', label: t.industryElec, v: e.industryMWh / 1000 },
            { id: 'bld', label: t.buildingsElec, v: e.buildingsMWh / 1000 },
            { id: 'fuel', label: t.fuelOnSite, v: e.fuelMWh / 1000 },
            { id: 'field', label: t.solarFields, v: e.solarFieldMWh / 1000 },
            { id: 'roof', label: t.solarRoofs, v: e.rooftopMWh / 1000 },
            { id: 'grid', label: t.gridImport, v: e.gridMWh / 1000 },
          ]}
        />
        <Basis b="Estimated" />
        <p className="ops-small">
          {t.evBays}: <b>{EV_BAYS.length}</b> <Basis b="Layout" />
        </p>
      </section>
      <section className="ops-sec">
        <h4>{t.waterUse}</h4>
        <Bars
          unit="m³/d"
          rows={[
            { id: 'homes', label: `${t.homes} (${fmt(w.residents)} ${t.residents})`, v: w.homesM3Day },
            { id: 'ind', label: t.industry, v: w.industryM3Day },
            { id: 'irr', label: t.irrigation, v: w.irrigationM3Day },
            { id: 'reuse', label: t.reused, v: -w.reusedM3Day },
          ]}
        />
        <p className="ops-small ops-muted">{t.waterLossNote}</p>
        <Basis b="Estimated" />
      </section>
    </div>
  );
}

function Development({ t }: { t: SusText }) {
  const inputs = useSusStore((s) => s.devInputs);
  const setInputs = useSusStore((s) => s.setDevInputs);
  const dev = useSusStore((s) => s.dev);
  const setDev = useSusStore((s) => s.setDev);
  const mitigated = useSusStore((s) => s.devMitigated);
  const setMitigated = useSusStore((s) => s.setDevMitigated);
  const setLayer = useSusStore((s) => s.setLayer);
  const focusPlace = useTwinStore((s) => s.focusPlace);
  const [err, setErr] = useState<string | null>(null);
  const run = () => {
    try {
      const r = runDevelopment(inputs);
      setDev(r);
      setErr(null);
      setLayer('development');
      if (r.sites.length) {
        const cx = r.sites.reduce((a, s) => a + s.x, 0) / r.sites.length;
        const cz = r.sites.reduce((a, s) => a + s.z, 0) / r.sites.length;
        focusPlace(cx, cz, 50);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const cats = CATEGORIES.filter((c) => c.group !== 'storage');
  return (
    <div className="ops-tab">
      <p>{t.devIntro}</p>
      <fieldset className="ops-inputs">
        <legend>{t.devInputs}</legend>
        <div className="ops-row">
          <label className="ops-select">
            <span>{t.category}</span>
            <select value={inputs.category} onChange={(e) => setInputs({ ...inputs, category: e.target.value })}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-select">
            <span>{t.district}</span>
            <select value={inputs.district} onChange={(e) => setInputs({ ...inputs, district: e.target.value })}>
              {DISTRICTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-select">
            <span>{t.size}</span>
            <select value={inputs.size} onChange={(e) => setInputs({ ...inputs, size: e.target.value as SizeId })}>
              {(Object.keys(SIZES) as SizeId[]).map((s) => (
                <option key={s} value={s}>
                  {s} ({SIZES[s].label})
                </option>
              ))}
            </select>
          </label>
        </div>
        <Lever id="dcount" label={t.count} value={inputs.count} min={1} max={40} step={1} unit="" onChange={(v) => setInputs({ ...inputs, count: v })} />
        <Lever id="dint" label={t.intensity} value={inputs.intensity * 100} min={30} max={120} step={5} unit="%" onChange={(v) => setInputs({ ...inputs, intensity: v / 100 })} />
        <Lever id="dhours" label={t.hours} value={inputs.hours} min={4} max={24} step={1} unit="h/day" onChange={(v) => setInputs({ ...inputs, hours: v })} />
        <Lever id="denergy" label={t.energyReq} value={inputs.energyFactor * 100} min={50} max={200} step={10} unit="% of typical" onChange={(v) => setInputs({ ...inputs, energyFactor: v / 100 })} />
        <Lever id="dwater" label={t.waterReq} value={inputs.waterFactor * 100} min={50} max={200} step={10} unit="% of typical" onChange={(v) => setInputs({ ...inputs, waterFactor: v / 100 })} />
        <Lever id="dtrucks" label={t.trucksReq} value={inputs.trucksPerDay ?? 0} min={0} max={60} step={1} unit={inputs.trucksPerDay === null ? `(${t.categoryDefault})` : '/day'} onChange={(v) => setInputs({ ...inputs, trucksPerDay: v === 0 ? null : v })} />
        <button className="ops-btn primary" onClick={run}>
          <Play size={14} /> {t.simulate}
        </button>
      </fieldset>
      {err && (
        <p className="ops-bad" role="alert">
          {err}
        </p>
      )}
      {dev && (
        <>
          <section className="ops-sec">
            <h4>
              {t.devResult}: {dev.sites.length} {t.sitesFound}
              <button className="ops-chip" onClick={() => setMitigated(!mitigated)} aria-pressed={mitigated}>
                {mitigated ? t.showPlain : t.showMitigated}
              </button>
              {dev.sites.length > 0 && (
                <button className="ops-chip" onClick={() => focusPlace(dev.sites[0].x, dev.sites[0].z, 40)}>
                  <MapPin size={12} /> {t.showOnMap}
                </button>
              )}
            </h4>
            {dev.warnings.map((w) => (
              <p key={w} className="ops-wait ops-small">
                ⚠ {w}
              </p>
            ))}
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th scope="col">{t.indicator}</th>
                    {dev.states.map((s) => (
                      <th key={s.label} scope="col">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      [t.netCo2, 'co2T', 't/yr'],
                      [t.electricity, 'elecMWh', 'MWh/yr'],
                      [t.water, 'waterM3Day', 'm³/d'],
                      [t.traffic, 'vehKmDay', 'veh-km/d'],
                      [t.trucks, 'trucksDay', '/day'],
                      [t.parking, 'parking', 'spaces'],
                      [t.trees, 'trees', ''],
                    ] as [string, keyof (typeof dev.states)[0], string][]
                  ).map(([l, k, u]) => (
                    <tr key={k}>
                      <th scope="row">
                        {l} <span className="ops-unit">{u}</span>
                      </th>
                      {dev.states.map((s, i) => {
                        const v = s[k] as number;
                        const b = dev.states[0][k] as number;
                        return (
                          <td key={i}>
                            <div>{fmt(v)}</div>
                            {i > 0 && (
                              <div className={`ops-delta ${v > b ? (k === 'trees' ? 'ops-ok' : 'ops-bad') : v < b ? 'ops-ok' : 'ops-muted'}`}>
                                {v - b >= 0 ? '+' : ''}
                                {fmt(v - b)} · {pctTxt(pct(v, b))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ops-small">
              {t.perFacility}: {fmt(dev.perFacility.floorM2)} m², {fmt(dev.perFacility.elecMWh)} MWh/yr, {fmt(dev.perFacility.waterM3Day, 1)} m³/d, {fmt(dev.perFacility.trucksDay, 1)} {t.trucks}/d, {fmt(dev.perFacility.workers, 0)} {t.workers}, {dev.perFacility.parking} {t.parking} · CO₂ {fmt(dev.perFacility.co2T)} → {fmt(dev.perFacility.co2MitT)} t/yr {t.withMitigation}
            </p>
            <h5>{t.assumptions}</h5>
            <ul className="ops-small">
              {dev.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Assumptions({ t }: { t: SusText }) {
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>{t.method}</h4>
        <ul>
          {MODEL_ASSUMPTIONS.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>
      <section className="ops-sec">
        <h4>{t.limits}</h4>
        <ul>
          {t.limitList.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function SustainabilityPanel() {
  const open = useSusStore((s) => s.open);
  const setOpen = useSusStore((s) => s.setOpen);
  const tab = useSusStore((s) => s.tab);
  const setTab = useSusStore((s) => s.setTab);
  const levers = useSusStore((s) => s.levers);
  const { locale, setLocale } = useI18n();
  const t = useMemo(() => susText(locale), [locale]);
  const cur = useMemo(() => (open ? snapshot(levers) : null), [open, levers]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  if (!open || !cur) return null;
  const tabs: [string, string][] = [
    ['overview', t.tabOverview],
    ['industry', t.tabIndustry],
    ['green', t.tabGreen],
    ['energy', t.tabEnergy],
    ['development', t.tabDevelopment],
    ['method', t.tabMethod],
  ];
  return (
    <aside className="ops-panel sus-panel" role="dialog" aria-modal="false" aria-labelledby="sus-title" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}>
      <header className="ops-head">
        <Leaf size={18} aria-hidden />
        <div>
          <h3 id="sus-title">{t.title}</h3>
          <div className="ops-small ops-muted">{t.sub}</div>
        </div>
        <button className="ops-chip" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
          {locale === 'ar' ? 'English' : 'العربية'}
        </button>
        <button className="icon-btn" aria-label={t.close} onClick={() => setOpen(false)}>
          <X size={16} />
        </button>
      </header>
      <div className="ops-tabs sus-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`ops-tabbtn ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="ops-body">
        {tab === 'overview' && <Overview t={t} />}
        {tab === 'industry' && <Industry t={t} cur={cur} />}
        {tab === 'green' && <Green t={t} cur={cur} />}
        {tab === 'energy' && <EnergyWater t={t} cur={cur} />}
        {tab === 'development' && <Development t={t} />}
        {tab === 'method' && <Assumptions t={t} />}
      </div>
    </aside>
  );
}
