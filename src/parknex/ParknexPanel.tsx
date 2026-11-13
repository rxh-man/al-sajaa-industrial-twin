import { useEffect, useMemo, useState } from 'react';
import { Mic, ParkingSquare, Play, Pause, Volume2, VolumeX, X } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { useOpsStore } from '../opsAgent/store';
import { useSusStore } from '../sustainability/store';
import { plan, approve } from '../opsAgent/runtime';
import {
  anprFeed, ALL_BAYS, authorityDecision, bayStatus, cityKpis, constructionCost, COST_DEFAULTS, EVENT_TYPES, eventPlan, facilityById, facilityKpis, FACILITIES, hourlyOccupancy,
  maintenanceImpact, opportunities, insights, pricingScenario, roi, scenarioRoi, stageAt, STATUSES, tenantRelease, type MaintScope,
} from './model';
import { opsFrom, usePark, type Proposal } from './store';
import { STATUS_COLOR } from './ParknexScene';
import { announce, LOG, recognise } from './audio';
import { answer } from './answers';
import '../styles/opsAgent.css';
import '../styles/sustainability.css';
import '../styles/parknex.css';

const n = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d }) : '—');
const aed = (v: number) => `AED ${n(v)}`;
const pct = (v: number) => `${n(v * 100, 0)} %`;

function Kpi({ l, v, s, onClick }: { l: string; v: string; s?: string; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div';
  return (
    <C className={`sus-kpi ${onClick ? '' : ''}`} onClick={onClick}>
      <div className="sus-kpi-top">{l}</div>
      <div className="sus-kpi-v">{v}</div>
      {s && <div className="ops-small ops-muted">{s}</div>}
    </C>
  );
}
function Bars({ rows, unit = '' }: { rows: { k: string; v: number; hl?: boolean }[]; unit?: string }) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.v)));
  return (
    <div className="ops-bars">
      {rows.map((r) => (
        <div key={r.k} className={`ops-bar-row ${r.hl ? 'is-sel' : ''}`}>
          <span className="ops-bar-name" title={r.k}>
            {r.k}
          </span>
          <span className="ops-bar-track">
            <span className="ops-bar-fill" style={{ width: `${(Math.abs(r.v) / max) * 100}%` }} />
          </span>
          <span className="ops-bar-val">
            {n(r.v)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}
function Spark({ vals, mark }: { vals: number[]; mark?: number }) {
  const max = Math.max(...vals, 1e-9);
  return (
    <div className="pk-spark" role="img" aria-label="hourly profile">
      {vals.map((v, i) => (
        <span key={i} className={i === mark ? 'is-now' : ''} style={{ height: `${(v / max) * 100}%` }} title={`${i}:00 · ${pct(v)}`} />
      ))}
    </div>
  );
}
function Range({ l, v, min, max, step, u, on }: { l: string; v: number; min: number; max: number; step: number; u?: string; on: (x: number) => void }) {
  return (
    <label className="ops-range">
      <span>
        {l} <b>{n(v, step < 1 ? 2 : 0)}</b> {u}
      </span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} />
    </label>
  );
}

function useOps() {
  const ops = usePark((s) => s.ops);
  const maint = usePark((s) => s.maint);
  const event = usePark((s) => s.event);
  return useMemo(() => opsFrom({ ops, maint, event }), [ops, maint, event]);
}
const focusOn = (id: string) => {
  const f = facilityById(id);
  if (f) useTwinStore.getState().focusPlace(f.site.x, f.site.z, 22);
};

function Overview() {
  const o = useOps();
  const k = cityKpis(o);
  const hour = usePark((s) => s.ops.hour);
  const select = usePark((s) => s.selectFacility);
  const setTab = usePark((s) => s.setTab);
  return (
    <div className="ops-tab">
      <div className="sus-kpis">
        <Kpi l="Facilities" v={n(k.facilities)} />
        <Kpi l="Total capacity" v={n(k.capacity)} s="bays (all floors)" />
        <Kpi l="Occupied" v={n(k.occupied)} s={pct(k.occupancy)} />
        <Kpi l="Available" v={n(k.available)} />
        <Kpi l="Paid occupied" v={n(k.paidOccupied)} />
        <Kpi l="Active sessions" v={n(k.activeSessions)} />
        <Kpi l="Reserved" v={n(k.reserved)} />
        <Kpi l="Maintenance" v={n(k.maintenance)} />
        <Kpi l="Sensors active" v={n(k.sensorsOk)} s={`${n(k.sensorsOffline)} offline · ${n(k.sensorsFaulty)} faulty`} />
        <Kpi l="Entering / exiting" v={`${n(k.entriesPerH)} / ${n(k.exitsPerH)}`} s="vehicles per hour" />
        <Kpi l="Avg duration" v={`${n(k.avgStayH, 1)} h`} s={`entry wait ${n(k.avgWaitMin, 1)} min`} />
        <Kpi l="Revenue today" v={aed(k.revenueToday)} s={`${aed(k.revenuePerH)}/h now`} />
        <Kpi l="Forecast today" v={aed(k.forecastDay)} />
      </div>
      <section className="ops-sec">
        <h4>City-wide occupancy by hour (simulated)</h4>
        <Spark vals={hourlyOccupancy(o)} mark={Math.floor(hour)} />
      </section>
      <section className="ops-sec">
        <h4>Facilities (click to open and fly there)</h4>
        <div className="pk-fac-grid">
          {k.per.map((p) => (
            <button
              key={p.id}
              className="pk-fac"
              onClick={() => {
                select(p.id);
                setTab('facilities');
                focusOn(p.id);
              }}
            >
              <b>{p.name}</b>
              <span className="pk-meter">
                <span style={{ width: pct(p.occupancy), background: p.occupancy > 0.9 ? '#ef4444' : p.occupancy > 0.75 ? '#f59e0b' : '#22c55e' }} />
              </span>
              <span className="ops-small">
                {n(p.occupied)}/{n(p.capacity)} · {n(p.available)} free · {pct(p.occupancy)} · {aed(p.revenueToday)} · sensors {p.sensorsOffline + p.sensorsFaulty ? `${p.sensorsOffline + p.sensorsFaulty} issues` : 'OK'}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="ops-sec">
        <h4>Revenue by facility (today, AED)</h4>
        <Bars rows={k.per.map((p) => ({ k: p.name.replace('PARKNEX ', ''), v: p.revenueToday }))} />
      </section>
    </div>
  );
}

function Insights() {
  const o = useOps();
  const { fin, out, totCap, totNoi } = insights(o);
  return (
    <div className="ops-tab">
      <p className="ops-note">Estimated returns: investment from the cost model (each facility's bays, floors, land and equipment), income from the simulated daily forecast × 365 plus tenant permits (AED 350 per bay per month). Not audited financials.</p>
      <div className="sus-kpis">
        <Kpi l="Portfolio investment" v={`AED ${n(totCap / 1e6, 1)} M`} />
        <Kpi l="Net operating income" v={`AED ${n(totNoi / 1e6, 1)} M/yr`} />
        <Kpi l="Portfolio ROI" v={`${n((totNoi / totCap) * 100, 1)} %`} />
        <Kpi l="Payback" v={`${n(totCap / totNoi, 1)} years`} />
      </div>
      <section className="ops-sec">
        <h4>What the numbers say</h4>
        {out.map((x) => (
          <div key={x.title} className={`pk-insight tone-${x.tone}`}>
            <b>{x.title}</b>
            <span>{x.detail}</span>
          </div>
        ))}
      </section>
      <section className="ops-sec">
        <h4>ROI by facility</h4>
        <Bars rows={[...fin].sort((a, b) => b.roiPct - a.roiPct).map((x) => ({ k: x.name.replace('PARKNEX ', ''), v: x.roiPct }))} unit=" %" />
      </section>
      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Facility</th>
              <th>Investment</th>
              <th>Revenue/yr</th>
              <th>NOI/yr</th>
              <th>ROI</th>
              <th>Payback</th>
              <th>AED/bay/day</th>
              <th>Utilisation</th>
            </tr>
          </thead>
          <tbody>
            {fin.map((x) => (
              <tr key={x.id} onClick={() => focusOn(x.id)}>
                <th>{x.name.replace('PARKNEX ', '')}</th>
                <td>{n(x.capex / 1e6, 1)} M</td>
                <td>{n(x.annual / 1e6, 2)} M</td>
                <td>{n(x.noi / 1e6, 2)} M</td>
                <td>{n(x.roiPct, 1)} %</td>
                <td>{x.payback === null ? '—' : `${n(x.payback, 1)} y`}</td>
                <td>{n(x.revPerBayDay, 1)}</td>
                <td>{pct(x.utilisation)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Facilities() {
  const o = useOps();
  const id = usePark((s) => s.facility) ?? FACILITIES[0].id;
  const select = usePark((s) => s.selectFacility);
  const f = facilityById(id)!;
  const k = facilityKpis(f, o);
  return (
    <div className="ops-tab">
      <div className="sus-chips">
        {FACILITIES.map((x) => (
          <button key={x.id} className={`ops-chip ${x.id === id ? 'is-on' : ''}`} onClick={() => (select(x.id), focusOn(x.id))}>
            {x.name.replace('PARKNEX ', '')}
          </button>
        ))}
      </div>
      <h4>{f.name}</h4>
      <div className="sus-kpis">
        <Kpi l="Capacity" v={n(k.capacity)} s={`${f.bays.length} bays × ${f.floors} floor(s)`} />
        <Kpi l="Occupied" v={n(k.occupied)} s={pct(k.occupancy)} />
        <Kpi l="Available" v={n(k.available)} />
        <Kpi l="Tariff" v={`AED ${n(f.tariffHour * (o.tariffMul[f.id] ?? 1), 1)}/h`} s={`AED ${n(f.tariffDay)}/day`} />
        <Kpi l="Revenue today" v={aed(k.revenueToday)} />
        <Kpi l="Sensors" v={n(k.sensorsOk)} s={`${k.sensorsOffline} offline · ${k.sensorsFaulty} faulty`} />
      </div>
      <section className="ops-sec">
        <h4>Rows (clusters)</h4>
        <Bars
          unit=" free"
          rows={[...new Set(f.bays.map((b) => b.row))].map((r) => ({ k: `Row ${r + 1}`, v: f.bays.filter((b) => b.row === r && bayStatus(b, f, o) === 'available').length }))}
        />
      </section>
      <section className="ops-sec">
        <h4>Occupancy by hour</h4>
        <Spark vals={hourlyOccupancy(o, f)} mark={Math.floor(o.hour)} />
      </section>
    </div>
  );
}

function Occupancy() {
  const o = useOps();
  const bayId = usePark((s) => s.bay);
  const b = ALL_BAYS.find((x) => x.id === bayId);
  const f = b ? facilityById(b.facility)! : null;
  const cats = ['visitor', 'tenant', 'premium', 'ev', 'accessible', 'event', 'restricted'] as const;
  const st = (s: string) => ALL_BAYS.filter((x) => bayStatus(x, facilityById(x.facility)!, o) === s).length;
  return (
    <div className="ops-tab">
      <div className="pk-legend ops-small">
        {Object.entries(STATUS_COLOR).map(([k, c]) => (
          <span key={k}>
            <i style={{ background: c }} /> {k} {n(st(k))}
          </span>
        ))}
      </div>
      <p className="ops-small ops-muted">Counts are bays on the rendered deck. Click any bay in the 3D city to inspect it.</p>
      {b && f && (
        <section className="ops-sec sus-detail">
          <h4>Bay {b.id}</h4>
          <div className="sus-grid2 ops-small">
            <span>Facility</span>
            <b>{f.name}</b>
            <span>Status</span>
            <b style={{ color: STATUS_COLOR[bayStatus(b, f, o)] }}>{bayStatus(b, f, o)}</b>
            <span>Category</span>
            <b>{b.category}</b>
            <span>Tariff</span>
            <b>{b.category === 'tenant' ? 'tenant permit' : `AED ${n(f.tariffHour * (o.tariffMul[f.id] ?? 1), 1)}/h`}</b>
            <span>Sensor</span>
            <b>{b.sensor}</b>
            <span>Session</span>
            <b>{bayStatus(b, f, o) === 'occupied' || bayStatus(b, f, o) === 'charging' ? `active · typical stay ${f.stayH} h · est. AED ${n(f.stayH * f.tariffHour, 0)}` : 'none'}</b>
          </div>
        </section>
      )}
      <section className="ops-sec">
        <h4>Bays by category (occupied / total)</h4>
        <Bars rows={cats.map((c) => ({ k: c, v: ALL_BAYS.filter((x) => x.category === c && ['occupied', 'charging'].includes(bayStatus(x, facilityById(x.facility)!, o))).length }))} />
        <p className="ops-small">Paid vs tenant / complimentary: {n(cityKpis(o).paidOccupied)} paid of {n(cityKpis(o).occupied)} occupied.</p>
      </section>
    </div>
  );
}

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Live-style ANPR feed. Every plate is fictional and every event is simulated; no camera is connected. */
function AnprFeed() {
  const hour = usePark((s) => s.ops.hour);
  const events = useMemo(() => anprFeed(Math.min(1439, hour * 60 + 59), 30), [hour]);
  const exceptions = events.filter((e) => e.exception !== 'none');
  const entries = events.filter((e) => e.direction === 'entry').length;
  const exits = events.length - entries;
  return (
    <div className="ops-tab">
      <div className="sus-kpis">
        <Kpi l="Entries (to hour)" v={n(entries)} />
        <Kpi l="Exits (to hour)" v={n(exits)} />
        <Kpi l="Exceptions" v={n(exceptions.length)} s="raised for review" />
        <Kpi l="Median confidence" v={events.length ? `${Math.round(events.map((e) => e.confidence).sort((a, b) => a - b)[Math.floor(events.length / 2)] * 100)}%` : '—'} />
      </div>
      <section className="ops-sec">
        <h4>Activity feed (simulated)</h4>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Time</th><th>Facility</th><th>Move</th><th>Plate (fictional)</th><th>Category</th><th>Duration</th><th>Payment</th><th>Confidence</th><th>Exception</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{hm(e.minute)}</td>
                  <td>{e.facility.replace('PARKNEX ', '')}</td>
                  <td>{e.direction === 'entry' ? 'Entry' : 'Exit'}</td>
                  <td>{e.plate}</td>
                  <td>{e.category}</td>
                  <td>{e.durationMin ? `${Math.floor(e.durationMin / 60)}h ${e.durationMin % 60}m` : '—'}</td>
                  <td>{e.payment}</td>
                  <td>{Math.round(e.confidence * 100)}%</td>
                  <td>{e.exception === 'none' ? '—' : e.exception}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ops-small ops-muted">Simulated camera-style events. Plates are fictional. No ANPR system is integrated.</p>
      </section>
      <section className="ops-sec">
        <h4>Exception workflow</h4>
        <p className="ops-small">An exception is held for an operator. Overrides are logged; nothing is charged or opened automatically when the plate is unclear.</p>
      </section>
    </div>
  );
}

function Sensors() {
  const o = useOps();
  const k = cityKpis(o);
  return (
    <div className="ops-tab">
      <div className="sus-kpis">
        <Kpi l="Installed sensors" v={n(k.sensorsOk + k.sensorsOffline + k.sensorsFaulty)} />
        <Kpi l="Active" v={n(k.sensorsOk)} />
        <Kpi l="Offline" v={n(k.sensorsOffline)} />
        <Kpi l="Faulty" v={n(k.sensorsFaulty)} />
        <Kpi l="ANPR cameras" v={n(FACILITIES.reduce((a, f) => a + f.anpr, 0))} s="all reporting (simulated)" />
        <Kpi l="Barriers" v={n(FACILITIES.reduce((a, f) => a + f.barriers * 2, 0))} s="entry + exit" />
        <Kpi l="Guidance signs" v={n(FACILITIES.length)} s="live availability" />
        <Kpi l="EV chargers" v={n(FACILITIES.reduce((a, f) => a + f.evChargers, 0))} />
      </div>
      <section className="ops-sec">
        <h4>Sensor issues by facility</h4>
        <Bars rows={k.per.map((p) => ({ k: p.name.replace('PARKNEX ', ''), v: p.sensorsOffline + p.sensorsFaulty }))} />
        <p className="ops-small ops-muted">Simulated device states; no live sensor network is connected.</p>
      </section>
    </div>
  );
}

function Events() {
  const o = useOps();
  const ev = usePark((s) => s.event);
  const set = usePark((s) => s.setEvent);
  const setOps = usePark((s) => s.setOps);
  const p = eventPlan(ev, o);
  const run = () => {
    const ve: Record<string, number> = {};
    for (const a of p.allocation) ve[a.id] = a.vehicles;
    setOps({ hour: ev.startH, eventVehicles: ve });
    set({ active: true });
    focusOn(ev.venue);
    announce(`${ev.type} parking active. ${p.placed} vehicles directed to ${p.allocation.length} facilities.${p.shortage ? ` Overflow needed for ${p.shortage} vehicles.` : ''}`);
  };
  return (
    <div className="ops-tab">
      <fieldset className="ops-inputs">
        <legend>Event</legend>
        <div className="ops-row">
          <label className="ops-select">
            <span>Type</span>
            <select value={ev.type} onChange={(e) => set({ type: e.target.value })}>
              {EVENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="ops-select">
            <span>Venue</span>
            <select value={ev.venue} onChange={(e) => set({ venue: e.target.value })}>
              {FACILITIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Range l="Attendance" v={ev.attendance} min={500} max={20000} step={500} on={(x) => set({ attendance: x })} />
        <Range l="Vehicles per attendee" v={ev.vehPerAttendee} min={0.1} max={0.6} step={0.05} on={(x) => set({ vehPerAttendee: x })} />
        <Range l="Start" v={ev.startH} min={8} max={22} step={1} u=":00" on={(x) => set({ startH: x })} />
        <Range l="Duration" v={ev.durationH} min={1} max={8} step={1} u="h" on={(x) => set({ durationH: x })} />
        <Range l="VIP bays" v={ev.vipBays} min={0} max={100} step={5} on={(x) => set({ vipBays: x })} />
        <Range l="Reserved bays" v={ev.reservedBays} min={0} max={150} step={10} on={(x) => set({ reservedBays: x })} />
        <Range l="Event tariff" v={ev.tariff} min={0} max={100} step={5} u="AED" on={(x) => set({ tariff: x })} />
        <div className="ops-row">
          <button className="ops-btn primary" onClick={run}>
            <Play size={13} /> Run event surge
          </button>
          {ev.active && (
            <button className="ops-btn" onClick={() => (setOps({ eventVehicles: {} }), set({ active: false }))}>
              End event
            </button>
          )}
        </div>
      </fieldset>
      <div className="sus-kpis">
        <Kpi l="Vehicle demand" v={n(p.vehicles)} />
        <Kpi l="Free capacity (≤3 km)" v={n(p.available)} />
        <Kpi l="Placed" v={n(p.placed)} />
        <Kpi l="Shortage" v={n(p.shortage)} s={p.overflowNeeded ? 'overflow / shuttle needed' : 'none'} />
        <Kpi l="Arrival surge" v={`${n(p.arrivalPeakPerH)}/h`} />
        <Kpi l="Departure surge" v={`${n(p.departurePeakPerH)}/h`} />
        <Kpi l="Event revenue" v={aed(p.revenue)} s="simulated" />
      </div>
      <section className="ops-sec">
        <h4>Guidance plan (signs redirect to)</h4>
        <Bars rows={p.allocation.map((a) => ({ k: `${a.name.replace('PARKNEX ', '')} (${n(a.distanceM)} m)`, v: a.vehicles }))} unit=" veh" />
      </section>
    </div>
  );
}

function Revenue() {
  const o = useOps();
  const setOps = usePark((s) => s.setOps);
  const id = usePark((s) => s.facility) ?? FACILITIES[0].id;
  const select = usePark((s) => s.selectFacility);
  const f = facilityById(id)!;
  const k = cityKpis(o);
  const mul = o.tariffMul[f.id] ?? 1;
  const sims = [0.7, 0.85, 1, 1.15, 1.3, 1.5].map((m) => pricingScenario(f, o, m));
  return (
    <div className="ops-tab">
      <p className="ops-note">Simulated revenue from modelled sessions — not real financial transactions.</p>
      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Facility</th>
              <th>AED/h</th>
              <th>Sessions</th>
              <th>Rev/h</th>
              <th>Today</th>
              <th>Month (fcst)</th>
              <th>Per bay/day</th>
              <th>Utilisation</th>
            </tr>
          </thead>
          <tbody>
            {k.per.map((p) => {
              const fx = facilityById(p.id)!;
              return (
                <tr key={p.id} className={p.id === id ? 'is-sel' : ''} onClick={() => select(p.id)}>
                  <th>{p.name.replace('PARKNEX ', '')}</th>
                  <td>{n(fx.tariffHour * (o.tariffMul[p.id] ?? 1), 1)}</td>
                  <td>{n(p.paidOccupied)}</td>
                  <td>{n(p.revenuePerH)}</td>
                  <td>{n(p.revenueToday)}</td>
                  <td>{n(p.forecastDay * 30.4)}</td>
                  <td>{n(p.forecastDay / p.capacity, 1)}</td>
                  <td>{pct(p.occupancy)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <section className="ops-sec">
        <h4>Pricing simulation · {f.name}</h4>
        <Range l="Tariff multiplier" v={mul} min={0.5} max={2} step={0.05} u={`× (AED ${n(f.tariffHour * mul, 1)}/h)`} on={(x) => setOps({ tariffMul: { ...o.tariffMul, [f.id]: x } })} />
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Tariff</th>
                <th>Occupancy now</th>
                <th>Forecast day</th>
              </tr>
            </thead>
            <tbody>
              {sims.map((s) => (
                <tr key={s.mul}>
                  <td>AED {n(s.tariff, 1)}</td>
                  <td>{pct(s.occupancy)}</td>
                  <td>{aed(s.forecastDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ops-small ops-muted">Demand responds to price with elasticity −0.35 (assumption).</p>
      </section>
    </div>
  );
}

function Tenants() {
  const [prot, setProt] = useState(10);
  const [max, setMax] = useState(60);
  const [demand, setDemand] = useState(50);
  const [hours, setHours] = useState(8);
  const setOps = usePark((s) => s.setOps);
  const released = usePark((s) => s.ops.released);
  const f = facilityById('residential') ?? FACILITIES[0];
  const t = tenantRelease(f, { protectPct: prot, maxRelease: max, visitorDemand: demand, hours, tariff: f.tariffHour });
  const strategies = [5, 10, 20].map((p) => ({ p, r: tenantRelease(f, { protectPct: p, maxRelease: 999, visitorDemand: demand, hours, tariff: f.tariffHour }) }));
  return (
    <div className="ops-tab">
      <h4>{f.name}</h4>
      <div className="sus-kpis">
        <Kpi l="Registered tenant bays" v={n(t.allocated)} />
        <Kpi l="Expected use 09–17" v={n(t.expected)} />
        <Kpi l="Unused allocated" v={n(t.unused)} />
        <Kpi l="Protection buffer" v={n(t.protectedBays)} />
        <Kpi l="Eligible to release" v={n(t.eligible)} />
        <Kpi l="Released (capped)" v={n(t.release)} />
        <Kpi l="Visitor demand" v={n(t.visitorDemand)} />
        <Kpi l="Extra revenue" v={aed(t.extraRevenueDay)} s={`${aed(t.extraRevenueMonth)}/month (22 days)`} />
      </div>
      <fieldset className="ops-inputs">
        <legend>Release rules</legend>
        <Range l="Tenant protection buffer" v={prot} min={0} max={40} step={5} u="%" on={setProt} />
        <Range l="Maximum release" v={max} min={0} max={150} step={5} u="bays" on={setMax} />
        <Range l="Expected visitor demand" v={demand} min={0} max={150} step={5} u="vehicles" on={setDemand} />
        <Range l="Release window" v={hours} min={2} max={10} step={1} u="h (from 09:00)" on={setHours} />
        <div className="ops-row">
          <button className="ops-btn primary" onClick={() => (setOps({ released: { ...released, [f.id]: t.release } }), announce(`${t.release} tenant bays released to visitors at ${f.name} until ${9 + hours}:00.`))}>
            Apply release (operator)
          </button>
          {released[f.id] ? (
            <button className="ops-btn" onClick={() => setOps({ released: { ...released, [f.id]: 0 } })}>
              Revoke
            </button>
          ) : null}
        </div>
        <p className="ops-small ops-muted">Tenant-reserved bays are never released beyond these rules; tenants keep the buffer and priority.</p>
      </fieldset>
      <section className="ops-sec">
        <h4>Strategy comparison (buffer)</h4>
        <Bars rows={strategies.map((s) => ({ k: `${s.p} % buffer → ${s.r.release} bays`, v: s.r.extraRevenueDay }))} unit=" AED/day" />
      </section>
    </div>
  );
}

function Maintenance() {
  const o = useOps();
  const maint = usePark((s) => s.maint);
  const add = usePark((s) => s.addMaint);
  const remove = usePark((s) => s.removeMaint);
  const [fid, setFid] = useState(FACILITIES[0].id);
  const [scope, setScope] = useState<MaintScope>('row');
  const [row, setRow] = useState(0);
  const [start, setStart] = useState(10);
  const [hours, setHours] = useState(4);
  const f = facilityById(fid)!;
  const imp = maintenanceImpact(f, scope, { row, hours, startH: start }, o);
  return (
    <div className="ops-tab">
      <fieldset className="ops-inputs">
        <legend>Schedule maintenance</legend>
        <div className="ops-row">
          <label className="ops-select">
            <span>Facility</span>
            <select value={fid} onChange={(e) => setFid(e.target.value)}>
              {FACILITIES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-select">
            <span>Scope</span>
            <select value={scope} onChange={(e) => setScope(e.target.value as MaintScope)}>
              {['row', 'facility', 'barrier', 'anpr', 'ev', 'lighting', 'payment'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        {scope === 'row' && <Range l="Row" v={row + 1} min={1} max={Math.max(...f.bays.map((b) => b.row)) + 1} step={1} on={(x) => setRow(x - 1)} />}
        <Range l="Start" v={start} min={0} max={23} step={1} u=":00" on={setStart} />
        <Range l="Duration" v={hours} min={1} max={12} step={1} u="h" on={setHours} />
        <button
          className="ops-btn primary"
          onClick={() => {
            add({ id: `${fid}-${scope}-${row}-${start}`, facility: fid, scope, row, startH: start, hours });
            announce(`Maintenance scheduled at ${f.name}: ${scope}${scope === 'row' ? ` ${row + 1}` : ''}, ${start}:00 for ${hours} hours.`);
          }}
        >
          Schedule
        </button>
      </fieldset>
      <div className="sus-kpis">
        <Kpi l="Affected spaces" v={n(imp.affected)} />
        <Kpi l="Remaining capacity" v={n(imp.remaining)} />
        <Kpi l="Revenue at risk" v={aed(imp.revenueAtRisk)} />
        <Kpi l="Alternative capacity" v={n(imp.alternative)} s="free at other facilities" />
        <Kpi l="Completion" v={`${imp.completion}:00`} />
        <Kpi l="Lowest-demand window" v={`${imp.recommendedStart}:00`} s={`for ${hours} h`} />
      </div>
      {imp.note && <p className="ops-small">{imp.note}</p>}
      <section className="ops-sec">
        <h4>Scheduled ({maint.length})</h4>
        {maint.map((m) => (
          <div key={m.id} className="ops-row ops-small">
            <span>
              {facilityById(m.facility)?.name} · {m.scope}
              {m.scope === 'row' ? ` ${(m.row ?? 0) + 1}` : ''} · {m.startH}:00 +{m.hours} h
            </span>
            <button className="ops-chip" onClick={() => remove(m.id)}>
              Cancel
            </button>
          </div>
        ))}
        <p className="ops-small ops-muted">Bays under maintenance turn yellow in the 3D city while their window is active.</p>
      </section>
    </div>
  );
}

function Development() {
  const opps = useMemo(() => opportunities().slice(0, 6), []);
  const sel = usePark((s) => s.selectedOpp);
  const select = usePark((s) => s.selectOpp);
  const setTab = usePark((s) => s.setTab);
  const setCost = usePark((s) => s.setCost);
  const o = opps.find((x) => x.id === sel);
  return (
    <div className="ops-tab">
      <p className="ops-note">Demand signals are estimated from the layout (offices, malls, homes and infill within 300 m minus free PARKNEX supply). Simulated, not verified market data.</p>
      {opps.map((x) => (
        <button
          key={x.id}
          className={`sus-rank-row ${x.id === sel ? 'is-sel' : ''}`}
          onClick={() => {
            select(x.id);
            useTwinStore.getState().focusPlace(x.site.x, x.site.z, 30);
          }}
        >
          <span>
            <b>{x.district}</b> <span className="ops-muted">{x.id}</span>
          </span>
          <span className="ops-small">
            demand {n(x.demand)} · supply {n(x.supply)} · gap {n(x.gap)}
          </span>
          <b>score {x.score}</b>
        </button>
      ))}
      {o && (
        <section className="ops-sec sus-detail">
          <h4>{o.district} — proposed site</h4>
          <div className="sus-grid2 ops-small">
            <span>Land area</span>
            <b>{n(o.areaM2)} m²</b>
            <span>Proposed capacity</span>
            <b>{n(o.capacity)} bays (surface)</b>
            <span>Road access</span>
            <b>{o.roadAccess}</b>
            <span>Nearby</span>
            <b>{o.nearby.join(', ') || '—'}</b>
            <span>Signals</span>
            <b>{o.signals.join(' · ') || '—'}</b>
            <span>Constraints</span>
            <b>{o.constraints.join(' · ') || 'none identified'}</b>
          </div>
          <button
            className="ops-btn primary"
            onClick={() => {
              setCost({ ...COST_DEFAULTS, bays: o.capacity, siteM2: o.areaM2 });
              setTab('roi');
            }}
          >
            Estimate cost and ROI
          </button>
        </section>
      )}
    </div>
  );
}

function Roi() {
  const cost = usePark((s) => s.cost);
  const setCost = usePark((s) => s.setCost);
  const rev = usePark((s) => s.rev);
  const setRev = usePark((s) => s.setRev);
  const sel = usePark((s) => s.selectedOpp);
  const proposals = usePark((s) => s.proposals);
  const upsert = usePark((s) => s.upsertProposal);
  const opp = useMemo(() => opportunities().find((x) => x.id === sel) ?? opportunities()[0], [sel]);
  const r = roi(cost, rev);
  const c = constructionCost(cost);
  const sc = (['conservative', 'base', 'optimistic'] as const).map((k) => ({ k, r: scenarioRoi(cost, rev, k) }));
  const prop = proposals.find((p) => p.oppId === opp.id);
  const step = (status: Proposal['status'], note: string, extra: Partial<Proposal> = {}) => {
    const base: Proposal = prop ?? { id: `prop-${opp.id}`, oppId: opp.id, x: opp.site.x, z: opp.site.z, w: opp.site.w, d: opp.site.d, bays: cost.bays, status: 'Opportunity identified', progress: 0, history: [], capex: r.cost.capex, roiPct: r.roiPct, payback: r.payback };
    upsert({ ...base, ...extra, bays: cost.bays, capex: r.cost.capex, roiPct: r.roiPct, payback: r.payback, status, history: [...base.history, { status, note, seq: base.history.length + 1 }] });
  };
  const decide = () => {
    const d = authorityDecision({ roiPct: r.roiPct, payback: r.payback, constraints: opp.constraints, bays: cost.bays });
    step(d.approved ? 'Approved' : 'Rejected', d.approved ? 'Meets the simulated authority criteria (ROI ≥ 6 %, payback ≤ 12 y, ≤ 1,200 bays).' : d.reasons.join('; '));
    announce(d.approved ? 'Development proposal approved in the simulation.' : 'Development proposal rejected in the simulation.');
  };
  const cur = prop?.status ?? 'Opportunity identified';
  return (
    <div className="ops-tab">
      <p className="ops-note">Estimates in AED from the editable assumptions below. Projections, not guaranteed returns. The approval is a simulation, not a government submission.</p>
      <h4>
        {opp.district} · {opp.id}
      </h4>
      <fieldset className="ops-inputs">
        <legend>Construction</legend>
        <div className="ops-row">
          <label className="ops-select">
            <span>Structure</span>
            <select value={cost.structure} onChange={(e) => setCost({ structure: e.target.value as 'surface' | 'multistorey', floors: e.target.value === 'surface' ? 1 : Math.max(2, cost.floors) })}>
              <option value="surface">Surface</option>
              <option value="multistorey">Multistorey</option>
            </select>
          </label>
        </div>
        <Range l="Bays" v={cost.bays} min={40} max={1200} step={10} on={(x) => setCost({ bays: x })} />
        {cost.structure === 'multistorey' && <Range l="Floors" v={cost.floors} min={2} max={8} step={1} on={(x) => setCost({ floors: x })} />}
        <Range l="Land" v={cost.landPerM2} min={0} max={4000} step={100} u="AED/m²" on={(x) => setCost({ landPerM2: x })} />
        <Range l="Civil works" v={cost.structure === 'surface' ? cost.civilPerBaySurface : cost.civilPerBayDeck} min={2000} max={90000} step={500} u="AED/bay" on={(x) => setCost(cost.structure === 'surface' ? { civilPerBaySurface: x } : { civilPerBayDeck: x })} />
        <Range l="EV chargers" v={cost.evChargers} min={0} max={80} step={2} on={(x) => setCost({ evChargers: x })} />
        <Range l="ANPR cameras" v={cost.anpr} min={0} max={16} step={1} on={(x) => setCost({ anpr: x })} />
        <Range l="Contingency" v={cost.contingencyPct} min={0} max={25} step={1} u="%" on={(x) => setCost({ contingencyPct: x })} />
        <Range l="Opex per bay" v={cost.opexPerBayYear} min={200} max={2000} step={50} u="AED/yr" on={(x) => setCost({ opexPerBayYear: x })} />
      </fieldset>
      <fieldset className="ops-inputs">
        <legend>Revenue</legend>
        <Range l="Occupancy" v={rev.occupancy * 100} min={10} max={95} step={5} u="%" on={(x) => setRev({ occupancy: x / 100 })} />
        <Range l="Tariff" v={rev.tariffHour} min={1} max={20} step={0.5} u="AED/h" on={(x) => setRev({ tariffHour: x })} />
        <Range l="Hours open" v={rev.hoursOpen} min={8} max={24} step={1} u="h" on={(x) => setRev({ hoursOpen: x })} />
        <Range l="Average stay" v={rev.avgStayH} min={0.5} max={8} step={0.5} u="h" on={(x) => setRev({ avgStayH: x })} />
      </fieldset>
      <div className="sus-kpis">
        <Kpi l="Construction" v={aed(c.capex)} s={`${aed(c.perBay)}/bay`} />
        <Kpi l="Technology" v={aed(c.technology)} />
        <Kpi l="Land" v={aed(c.land)} />
        <Kpi l="Opex / year" v={aed(c.opexYear)} s={`maintenance ${aed(c.maintenanceYear)}`} />
        <Kpi l="Vehicles / day" v={n(r.vehiclesDay)} />
        <Kpi l="Revenue" v={aed(r.daily)} s={`/day · ${aed(r.monthly)}/month`} />
        <Kpi l="Annual NOI" v={aed(r.noi)} s={`gross ${aed(r.annual)}`} />
        <Kpi l="ROI" v={`${n(r.roiPct, 1)} %`} s={`payback ${r.payback === null ? 'never' : `${n(r.payback, 1)} y`}`} />
      </div>
      <section className="ops-sec">
        <h4>Scenarios</h4>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th />
                <th>Capex</th>
                <th>Annual NOI</th>
                <th>ROI</th>
                <th>Payback</th>
              </tr>
            </thead>
            <tbody>
              {sc.map((x) => (
                <tr key={x.k}>
                  <th>{x.k}</th>
                  <td>{aed(x.r.cost.capex)}</td>
                  <td>{aed(x.r.noi)}</td>
                  <td>{n(x.r.roiPct, 1)} %</td>
                  <td>{x.r.payback === null ? 'never' : `${n(x.r.payback, 1)} y`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h5>Five-year projection (base)</h5>
        <Bars rows={r.years.map((y) => ({ k: `Year ${y.year}`, v: y.noi }))} unit=" AED NOI" />
        <p className="ops-small ops-muted">ROI = annual NOI ÷ initial investment; payback = years until cumulative NOI covers the investment (3 % revenue growth, 2 % cost growth).</p>
      </section>
      <section className="ops-sec">
        <h4>Approval workflow · {cur}</h4>
        <ol className="pk-steps">
          {STATUSES.filter((s) => s !== 'Rejected' || cur === 'Rejected').map((s) => (
            <li key={s} className={s === cur ? 'is-now' : prop?.history.some((h) => h.status === s) ? 'is-done' : ''}>
              {s}
            </li>
          ))}
        </ol>
        <div className="ops-row">
          {cur === 'Opportunity identified' && (
            <button className="ops-btn" onClick={() => step('Under feasibility review', `Feasibility: ${aed(r.cost.capex)} capex, ${n(r.roiPct, 1)} % ROI.`)}>
              Start feasibility review
            </button>
          )}
          {cur === 'Under feasibility review' && (
            <button className="ops-btn" onClick={() => step('Proposal prepared', 'Proposal generated from the cost and revenue model.')}>
              Prepare proposal
            </button>
          )}
          {cur === 'Proposal prepared' && (
            <button className="ops-btn primary" onClick={() => step('Submitted for approval', 'Submitted to the simulated authority.')}>
              Submit for approval (simulated)
            </button>
          )}
          {cur === 'Submitted for approval' && (
            <button className="ops-btn primary" onClick={decide}>
              Get decision
            </button>
          )}
          {cur === 'Approved' && (
            <button className="ops-btn primary" onClick={() => (step('Under construction', 'Construction started (simulated).', { progress: 0 }), useTwinStore.getState().focusPlace(opp.site.x, opp.site.z, 25))}>
              Begin construction
            </button>
          )}
          {cur === 'Rejected' && (
            <button className="ops-btn" onClick={() => step('Under feasibility review', 'Revised after rejection.')}>
              Revise
            </button>
          )}
        </div>
        {prop && (
          <ul className="ops-small">
            {prop.history.map((h) => (
              <li key={h.seq}>
                <b>{h.status}</b> — {h.note}
              </li>
            ))}
          </ul>
        )}
        {prop && (prop.status === 'Under construction' || prop.status === 'Operational') && (
          <div>
            <div className="pk-meter big">
              <span style={{ width: `${prop.progress * 100}%`, background: '#f59e0b' }} />
            </div>
            <p className="ops-small">
              {Math.round(prop.progress * 100)} % · {stageAt(prop.progress)}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Intelligence() {
  const o = useOps();
  const [q, setQ] = useState('Which facility has the most available spaces?');
  const [a, setA] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const ask = (text: string) => {
    const r = answer(text, o);
    setA(r);
    announce(r);
  };
  const runAgent = () => {
    const run = plan(q.match(/pric|tariff|revenue|turned|full/i) ? q : 'PARKNEX Central parking is full at peak. Test a 20% more tariff and reduce drivers turned away by 30%.');
    useOpsStore.getState().setRun(run);
    useOpsStore.getState().setTab('agent');
    useOpsStore.getState().setOpen(true);
  };
  return (
    <div className="ops-tab">
      <fieldset className="ops-inputs">
        <legend>Ask PARKNEX</legend>
        <textarea className="ops-goal" rows={2} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ops-row">
          <button className="ops-btn primary" onClick={() => ask(q)}>
            Answer
          </button>
          <button
            className="ops-btn"
            disabled={listening}
            onClick={() => {
              const r = recognise(
                (t) => (setQ(t), ask(t)),
                () => setListening(false),
              );
              if (r) setListening(true);
              else setA('Voice input is not supported in this browser; type the question instead.');
            }}
          >
            <Mic size={13} /> {listening ? 'Listening…' : 'Speak'}
          </button>
          <button className="ops-btn" onClick={runAgent}>
            Run Parking Intelligence Agent (approval-gated)
          </button>
        </div>
        <div className="sus-chips">
          {['Which facility has the most available spaces?', 'Which facility is generating the highest revenue?', 'Which area is approaching capacity?', 'How many sensors are currently offline?', 'Where should we develop another parking facility?', 'What is the estimated ROI of the proposed facility?', 'How much revenue can we generate from unused tenant spaces?', 'How many spaces are needed for the upcoming event?', 'What happens if we close row 1 at PARKNEX Central for maintenance?', 'Direct incoming visitors to the nearest available parking cluster.'].map((x) => (
            <button key={x} className="ops-chip" onClick={() => (setQ(x), ask(x))}>
              {x}
            </button>
          ))}
        </div>
      </fieldset>
      {a && <p className="ops-note">{a}</p>}
      <section className="ops-sec">
        <h4>Announcements (text log)</h4>
        <ul className="ops-small">
          {LOG.slice(0, 8).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const TABS: [string, string][] = [
  ['overview', 'Overview'],
  ['insights', 'ROI Insights'],
  ['facilities', 'Facilities'],
  ['occupancy', 'Occupancy'],
  ['anpr', 'Live ANPR'],
  ['sensors', 'Sensors & Infrastructure'],
  ['events', 'Events'],
  ['revenue', 'Revenue'],
  ['tenants', 'Tenants & Visitors'],
  ['maintenance', 'Maintenance'],
  ['development', 'Development'],
  ['roi', 'Construction & ROI'],
  ['ai', 'AI Intelligence'],
];

export function ParknexPanel() {
  const open = usePark((s) => s.open);
  const setOpen = usePark((s) => s.setOpen);
  const tab = usePark((s) => s.tab);
  const setTab = usePark((s) => s.setTab);
  const hour = usePark((s) => s.ops.hour);
  const setOps = usePark((s) => s.setOps);
  const playing = usePark((s) => s.playing);
  const setPlaying = usePark((s) => s.setPlaying);
  const audio = usePark((s) => s.audio);
  const setAudio = usePark((s) => s.setAudio);
  // parking becomes the primary view: the other side panels close while PARKNEX is open
  useEffect(() => {
    if (!open) return;
    useOpsStore.getState().setOpen(false);
    useSusStore.getState().setOpen(false);
    const t = useTwinStore.getState();
    t.setAirPanel(false);
    t.setClimatePanel(false);
    t.setLayerPanel(false);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <aside className="ops-panel pk-panel" role="dialog" aria-labelledby="pk-title">
      <header className="ops-head">
        <ParkingSquare size={20} aria-hidden className="pk-logo" />
        <div>
          <h3 id="pk-title">PARKNEX</h3>
          <div className="ops-small ops-muted">Intelligent Parking &amp; Urban Mobility · simulated operations, estimated AED</div>
        </div>
        <button className="ops-chip" onClick={() => setAudio(!audio)} aria-pressed={audio} aria-label={audio ? 'Mute announcements' : 'Turn announcements on'}>
          {audio ? <Volume2 size={13} /> : <VolumeX size={13} />}
        </button>
        <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
          <X size={16} />
        </button>
      </header>
      <div className="ops-row pk-clock">
        <button className="ops-chip" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause simulation' : 'Play simulation'}>
          {playing ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <label className="ops-range" style={{ flex: 1 }}>
          <span>
            Simulated time <b>{String(Math.floor(hour)).padStart(2, '0')}:{String(Math.floor((hour % 1) * 60)).padStart(2, '0')}</b>
          </span>
          <input type="range" min={0} max={23.75} step={0.25} value={hour} onChange={(e) => setOps({ hour: Number(e.target.value) })} />
        </label>
      </div>
      <div className="ops-tabs sus-tabs" role="tablist">
        {TABS.map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`ops-tabbtn ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>
            {l}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="ops-body">
        {tab === 'overview' && <Overview />}
        {tab === 'insights' && <Insights />}
        {tab === 'facilities' && <Facilities />}
        {tab === 'occupancy' && <Occupancy />}
        {tab === 'anpr' && <AnprFeed />}
        {tab === 'sensors' && <Sensors />}
        {tab === 'events' && <Events />}
        {tab === 'revenue' && <Revenue />}
        {tab === 'tenants' && <Tenants />}
        {tab === 'maintenance' && <Maintenance />}
        {tab === 'development' && <Development />}
        {tab === 'roi' && <Roi />}
        {tab === 'ai' && <Intelligence />}
      </div>
    </aside>
  );
}

/** for the agent's audit: approve the latest parking plan as the given operator */
export const approveParkingRun = (by: string) => {
  const r = useOpsStore.getState().run;
  if (r && r.scenarioId === 'parking' && r.state === 'awaiting-approval') useOpsStore.getState().setRun(approve(r, { by, role: 'operator' }));
};
