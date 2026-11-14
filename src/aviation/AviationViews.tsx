import { useMemo } from 'react';
import { useAviationStore, type AviationTab } from './store';
import { AIRCRAFT, baggageTracking, cargoSummary, DATA_NOTE, flightBoard, gseHealth, INCIDENTS, opsKpis, passengerFlow, runwayConflicts, runwayUtilisation, SAFETY_CHECKS, SECURITY_CAPACITY_PER_HOUR, SEPARATION_MIN, standConflicts, standStatus, securityPeak, WEATHER_DELAY_MIN, type Weather } from './ops';
import { AGENTS, ASSUMPTIONS, emissions, executiveSummary, financials, recommendations, whatIfResult } from './intelligence';
import { FLEET, FLIGHTS, hm, scenarioDelayMin, flightTurnaround, TASKS, type Flight } from './model';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const n = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d });

export function Kpi({ l, v, s, tone }: { l: string; v: string; s?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className={`sus-kpi av-kpi ${tone ? `is-${tone}` : ''}`}>
      <div className="sus-kpi-top">{l}</div>
      <div className="sus-kpi-v">{v}</div>
      {s && <div className="ops-small ops-muted">{s}</div>}
    </div>
  );
}

function Bars({ rows, unit = '' }: { rows: { k: string; v: number }[]; unit?: string }) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.v)));
  return (
    <div className="ops-bars">
      {rows.map((r) => (
        <div key={r.k} className="ops-bar-row">
          <span className="ops-bar-name">{r.k}</span>
          <span className="ops-bar-track"><span className="ops-bar-fill" style={{ width: `${(Math.abs(r.v) / max) * 100}%` }} /></span>
          <span className="ops-bar-val">{n(r.v)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="ops-small ops-muted av-note">{children}</p>;
}

// Shared scenario inputs
export interface Scen { baggageTractorFailed: boolean; replacementAssigned: boolean }

// ---------- Command centre ----------
export function Command({ scen, weather, extraDelay, go }: { scen: Scen; weather: Weather; extraDelay: number; go: (t: AviationTab) => void }) {
  const now = useAviationStore((s) => s.clock);
  const ex = executiveSummary({ ...scen, weather, extraDelay }, now);
  const kp = opsKpis(weather, extraDelay, scenarioDelayMin(scen), scen.baggageTractorFailed, scen.replacementAssigned, now);
  const recs = recommendations({ ...scen, weather, extraDelay }).slice(0, 3);
  const fin = financials(Math.round(kp.otp < 1 ? (1 - kp.otp) * 600 : 0));
  return (
    <div className="ops-tab">
      <div className="sus-kpis">
        <Kpi l="Clock (simulated)" v={ex.clock} s={`${ex.freeStands} of ${ex.standsTotal} stands free`} />
        <Kpi l="On-time performance" v={pct(kp.otp)} s="within 15 min of schedule" tone={kp.otp < 0.8 ? 'warn' : 'ok'} />
        <Kpi l="Open incidents" v={String(ex.openIncidents)} s="needs a human owner" tone={ex.openIncidents > 1 ? 'warn' : 'ok'} />
        <Kpi l="Pending recommendations" v={String(recs.length ? ex.pendingRecs : 0)} s="awaiting operator decision" />
        <Kpi l="Runway utilisation" v={pct(kp.runwayUtil)} s={`${weather} separation ${SEPARATION_MIN[weather]} min`} />
        <Kpi l="Bags mishandled (sim.)" v={`${kp.mishandlePer1000.toFixed(1)} per 1,000`} />
        <Kpi l="GSE availability" v={pct(kp.gseAvailability)} />
        <Kpi l="Delay cost (assumption)" v={`AED ${n(fin.delayCost)}`} s="see Analytics" />
      </div>
      <section className="ops-sec">
        <h4>Top recommendations (human decision required)</h4>
        {recs.length === 0 && <p className="ops-small">No open recommendations.</p>}
        {recs.map((r) => (
          <div key={r.id} className="av-card">
            <div className="ops-small"><strong>{r.title}</strong></div>
            <div className="ops-small ops-muted">{r.rationale}</div>
          </div>
        ))}
        <button className="ops-btn" onClick={() => go('ai')}>Review all recommendations</button>
      </section>
      <section className="ops-sec">
        <h4>Next movements</h4>
        <BoardTable weather={weather} extraDelay={extraDelay} scen={scen} compact onPick={() => go('turnaround')} />
      </section>
      <Note>{DATA_NOTE}</Note>
    </div>
  );
}

// ---------- Flight board ----------
function BoardTable({ weather, extraDelay, scen, compact, onPick }: { weather: Weather; extraDelay: number; scen: Scen; compact?: boolean; onPick?: (f: Flight) => void }) {
  const now = useAviationStore((s) => s.clock);
  const rows = flightBoard(weather, extraDelay, scenarioDelayMin(scen), now);
  const list = compact ? rows.filter((r) => r.depEst > now).slice(0, 5) : rows;
  const select = useAviationStore((s) => s.select);
  return (
    <div className="ops-table-wrap">
      <table className="ops-table">
        <thead><tr><th>Flight</th><th>Type</th><th>Route</th><th>Stand</th><th>Arr sched / est</th><th>Dep sched / est</th><th>State</th></tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id} style={{ cursor: onPick ? 'pointer' : undefined }} onClick={() => { if (onPick) { select(r.id); onPick(r); } }}>
              <td>{r.id}</td><td>{r.type}</td><td>{r.route}</td><td>{r.stand}</td>
              <td>{hm(r.arrMin)} / {hm(r.arrEst)}</td>
              <td>{hm(r.depMin)} / {hm(r.depEst)}</td>
              <td className={r.state === 'Delayed' ? 'av-alert' : ''}>{r.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Control centre ----------
export function Control({ weather, extraDelay, scen }: { weather: Weather; extraDelay: number; scen: Scen }) {
  const setWeather = useAviationStore((s) => s.setWeather);
  const now = useAviationStore((s) => s.clock);
  const setClock = useAviationStore((s) => s.setClock);
  const stands = standStatus(now);
  const conf = runwayConflicts(weather, extraDelay);
  const util = runwayUtilisation(weather);
  const sc = standConflicts();
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>Scenario and clock</h4>
        <label className="ops-small av-slider">Simulated clock: {hm(now)}
          <input type="range" min={6 * 60} max={22 * 60} step={5} value={now} onChange={(e) => setClock(Number(e.target.value))} />
        </label>
        <div className="av-row-btns">
          {(Object.keys(SEPARATION_MIN) as Weather[]).map((w) => (
            <button key={w} className={`ops-chip ${weather === w ? 'is-on' : ''}`} onClick={() => setWeather(w)}>{w}</button>
          ))}
        </div>
        <Note>{weather === 'Clear' ? 'Clear weather: standard separation.' : `${weather}: separation ${SEPARATION_MIN[weather]} min, arrivals +${WEATHER_DELAY_MIN[weather]} min (simulated).`}</Note>
      </section>
      <section className="ops-sec">
        <h4>Stand allocation at {hm(now)}</h4>
        <div className="av-stands">
          {stands.map((s) => (
            <div key={s.stand} className={`av-stand ${s.free ? 'is-free' : 'is-busy'}`}>
              <strong>{s.stand}</strong><span>{s.occupiedBy ?? 'Free'}</span>
            </div>
          ))}
        </div>
        <p className="ops-small">Stand conflicts in the schedule: {sc.length === 0 ? 'none' : sc.map((p) => p.join(' and ')).join('; ')}.</p>
      </section>
      <section className="ops-sec">
        <h4>Runway</h4>
        <p className="ops-small">Utilisation {pct(util)} across 06:00 to 22:00. Movements: {FLIGHTS.length * 2}.</p>
        {conf.length === 0 ? <p className="ops-small">No separation conflicts.</p> : (
          <ul className="ops-small">
            {conf.map((c, i) => (
              <li key={i}>{c.a.flightId} {c.a.kind.toLowerCase()} at {hm(c.a.t)} and {c.b.flightId} {c.b.kind.toLowerCase()} at {hm(c.b.t)}: {c.gap} min apart (minimum {SEPARATION_MIN[weather]}).</li>
            ))}
          </ul>
        )}
      </section>
      <section className="ops-sec">
        <h4>Flights in progress</h4>
        <BoardTable weather={weather} extraDelay={extraDelay} scen={scen} />
      </section>
    </div>
  );
}

// ---------- Flights ----------
export function Flights({ weather, extraDelay, scen, go }: { weather: Weather; extraDelay: number; scen: Scen; go: (t: AviationTab) => void }) {
  const now = useAviationStore((s) => s.clock);
  const states = flightBoard(weather, extraDelay, 0, now).reduce<Record<string, number>>((a, r) => ((a[r.state] = (a[r.state] ?? 0) + 1), a), {});
  return (
    <div className="ops-tab">
      <div className="sus-kpis">
        {Object.entries(states).map(([k, v]) => <Kpi key={k} l={k} v={String(v)} />)}
      </div>
      <section className="ops-sec">
        <h4>Schedule and tracking (fictional flights)</h4>
        <BoardTable weather={weather} extraDelay={extraDelay} scen={scen} onPick={() => go('turnaround')} />
        <Note>Select a flight to open its turnaround timeline. Estimated times include the selected weather and delay.</Note>
      </section>
    </div>
  );
}

// ---------- Turnaround ----------
export function Turnaround({ flightId, scen }: { flightId: string; scen: Scen }) {
  const f = FLIGHTS.find((x) => x.id === flightId) ?? FLIGHTS[1];
  const now = useAviationStore((s) => s.clock);
  const weather = useAviationStore((s) => s.weather) as Weather;
  const extraDelay = useAviationStore((s) => s.extraDelay);
  const scenDelay = scenarioDelayMin(scen);
  // the same arrival delay the board uses, so this timeline and the board row cannot disagree
  const row = flightBoard(weather, extraDelay, scenDelay, now).find((r) => r.id === f.id)!;
  const arrDelay = row.arrEst - f.arrMin;
  const tr = flightTurnaround(f, arrDelay, f.id === 'SH204' ? scen : { baggageTractorFailed: false, replacementAssigned: false });
  const delayVsPlan = row.depEst - f.depMin;
  const span = Math.max(1, tr.departAt - row.arrEst);
  const nowPct = Math.max(0, Math.min(100, ((now - row.arrEst) / span) * 100));
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>{f.id} · {f.reg} · stand {f.stand}</h4>
        <p className="ops-small">Arrival {hm(row.arrEst)}. Estimated departure {hm(row.depEst)} ({delayVsPlan > 0 ? `+${delayVsPlan} min vs plan` : 'on plan'}).</p>
        {scen.baggageTractorFailed && (
          <p className="ops-note">{scen.replacementAssigned ? 'Replacement tractor assigned. Baggage loading is back on plan.' : `Baggage loading held for a charged tractor. Current estimated departure delay: ${delayVsPlan} minutes.`}</p>
        )}
        <div className="av-gantt" role="img" aria-label={`Turnaround timeline for ${f.id}`}>
          {tr.rows.map((r) => (
            <div key={r.id} className="av-row">
              <span className="av-label">{r.label}</span>
              <div className="av-track">
                <div className={`av-bar ${r.alert ? 'is-alert' : ''}`} style={{ left: `${((r.start - row.arrEst) / span) * 100}%`, width: `${Math.max(1.5, (r.dur / span) * 100)}%` }} title={`${hm(r.start)} to ${hm(r.finish)}${r.note ? ` · ${r.note}` : ''}`} />
                <div className="av-now" style={{ left: `${nowPct}%` }} />
              </div>
              <span className="av-time">{hm(r.start)}–{hm(r.finish)}</span>
            </div>
          ))}
        </div>
        <p className="ops-small ops-muted">Activities: {TASKS.length}. Each starts when its dependencies finish. Simulated times.</p>
      </section>
    </div>
  );
}

// ---------- Passengers and bags ----------
export function Passengers({ scen }: { scen: Scen }) {
  const now = useAviationStore((s) => s.clock);
  const flow = passengerFlow().filter((r) => r.checkIn + r.security + r.boarding > 0);
  const peak = securityPeak();
  const bags = baggageTracking(scen.baggageTractorFailed, scen.replacementAssigned, now);
  return (
    <div className="ops-tab">
      <div className="sus-kpis">
        <Kpi l="Security peak" v={`${n(peak.load)} pax/h at ${peak.hour}:00`} s={`${pct(peak.utilisation)} of ${SECURITY_CAPACITY_PER_HOUR}/h capacity`} tone={peak.utilisation > 0.9 ? 'bad' : peak.utilisation > 0.75 ? 'warn' : 'ok'} />
        <Kpi l="Bags tracked" v={n(bags.reduce((a, b) => a + b.bags, 0))} s={`${bags.reduce((a, b) => a + b.mishandled, 0)} mishandled (sim.)`} />
      </div>
      <section className="ops-sec">
        <h4>Passenger flow by hour (simulated)</h4>
        <Bars rows={flow.map((r) => ({ k: `${String(r.hour).padStart(2, '0')}:00 security`, v: r.security }))} />
        <Note>Check-in opens 3 h before departure, security 2 h, boarding 40 min. Passengers per hour.</Note>
      </section>
      <section className="ops-sec">
        <h4>Baggage tracking</h4>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Flight</th><th>Bags</th><th>Loaded</th><th>Mishandled</th><th>Status</th></tr></thead>
            <tbody>
              {bags.map((b) => (
                <tr key={b.flightId} className={b.status.startsWith('Delayed') ? 'av-alert-row' : ''}><td>{b.flightId}</td><td>{b.bags}</td><td>{b.loaded}</td><td>{b.mishandled}</td><td>{b.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------- Ground fleet and maintenance ----------
export function Fleet() {
  const health = gseHealth();
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>Ground support equipment (simulated)</h4>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>ID</th><th>Category</th><th>Status</th><th>Task</th><th>Util.</th><th>Health</th><th>Risk</th><th>Est. days to failure</th></tr></thead>
            <tbody>
              {FLEET.map((g) => {
                const h = health.find((x) => x.id === g.id)!;
                return (
                  <tr key={g.id} className={h.risk === 'High' ? 'av-alert-row' : ''}>
                    <td>{g.id}</td><td>{g.category}</td><td>{g.status}</td><td>{g.task}</td><td>{pct(g.utilisation)}</td><td>{h.score}/100</td><td>{h.risk}</td><td>{h.failInDays ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Note>Predicted failure is a simulated estimate from running hours, vibration and temperature. Not a measured value.</Note>
      </section>
      <section className="ops-sec">
        <h4>Aircraft fleet (fictional tails)</h4>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Tail</th><th>Type</th><th>Hours to check</th><th>Cycles</th><th>Flag</th></tr></thead>
            <tbody>
              {AIRCRAFT.map((a) => (
                <tr key={a.tail} className={a.flag === 'Urgent' ? 'av-alert-row' : ''}><td>{a.tail}</td><td>{a.type}</td><td>{a.hoursToCheck}</td><td>{n(a.cycles)}</td><td>{a.flag}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------- Cargo ----------
export function Cargo() {
  const c = cargoSummary();
  return (
    <div className="ops-tab">
      <div className="sus-kpis">
        <Kpi l="Cargo carried today" v={`${c.tonnes} t`} s="simulated" />
        <Kpi l="Belly cargo (wide-body)" v={`${c.belly} t`} />
        <Kpi l="Cargo terminal utilisation" v={pct(c.warehouseUtil)} />
        <Kpi l="ULDs planned" v={String(c.uldsPlanned)} />
      </div>
      <section className="ops-sec">
        <h4>Cargo by movement (tonnes, simulated)</h4>
        <Bars rows={FLIGHTS.map((f) => ({ k: `${f.id} ${f.route.split(' ')[0]}`, v: f.cargoT }))} unit=" t" />
      </section>
    </div>
  );
}

// ---------- Safety ----------
export function Safety({ scen }: { scen: Scen }) {
  const decisions = useAviationStore((s) => s.decisions);
  const decide = useAviationStore((s) => s.decide);
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>Incidents</h4>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>ID</th><th>Time</th><th>Type</th><th>Severity</th><th>Area</th><th>Status</th><th>Owner</th></tr></thead>
            <tbody>
              {INCIDENTS.map((i) => (
                <tr key={i.id} className={i.severity === 'High' && i.status !== 'Closed' ? 'av-alert-row' : ''}>
                  <td>{i.id}</td><td>{hm(i.t)}</td><td>{i.type}</td><td>{i.severity}</td><td>{i.area}</td><td>{i.status}</td><td>{i.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ops-small">{INCIDENTS.find((i) => i.id === 'INC-0412')?.note} {scen.baggageTractorFailed ? 'Active.' : ''}</p>
      </section>
      <section className="ops-sec">
        <h4>Safety checks (human sign-off)</h4>
        {SAFETY_CHECKS.map((c) => (
          <div key={c.id} className="av-card av-row-inline">
            <div>
              <div className="ops-small"><strong>{c.id}</strong> {c.label}</div>
              <div className="ops-small ops-muted">Owner: {c.owner}</div>
            </div>
            <button className="ops-btn" disabled={decisions[c.id] === 'approved'} onClick={() => decide(c.id, c.label, 'approved')}>
              {decisions[c.id] === 'approved' ? 'Signed off' : 'Sign off'}
            </button>
          </div>
        ))}
        <Note>The simulation never closes a safety item by itself. A named owner signs off.</Note>
      </section>
    </div>
  );
}

// ---------- Analytics ----------
export function Analytics({ scen, weather, extraDelay }: { scen: Scen; weather: Weather; extraDelay: number }) {
  const now = useAviationStore((s) => s.clock);
  const kp = opsKpis(weather, extraDelay, scenarioDelayMin(scen), scen.baggageTractorFailed, scen.replacementAssigned, now);
  const delay = Math.round((1 - kp.otp) * 600);
  const fin = financials(delay);
  const em = emissions();
  return (
    <div className="ops-tab">
      <div className="sus-kpis">
        <Kpi l="Revenue (assumption)" v={`AED ${n(fin.revenue)}`} s="passengers × AED per pax" />
        <Kpi l="Operating cost (assumption)" v={`AED ${n(fin.cost)}`} s="turnarounds + delay cost" />
        <Kpi l="Margin (assumption)" v={`AED ${n(fin.margin)}`} tone={fin.margin > 0 ? 'ok' : 'bad'} />
        <Kpi l="Fuel burn (estimate)" v={`${em.fuelT} t`} s={`${em.co2t} t CO₂`} />
      </div>
      <section className="ops-sec">
        <h4>Assumptions used (not measured)</h4>
        <ul className="ops-small">
          <li>Aero and ancillary revenue: AED {ASSUMPTIONS.revenuePerPaxAED} per passenger.</li>
          <li>Delay cost: AED {ASSUMPTIONS.delayCostPerMinAED} per minute.</li>
          <li>Turnaround cost: AED {n(ASSUMPTIONS.turnaroundCostAED)} each.</li>
          <li>Fuel per movement: narrow-body {n(ASSUMPTIONS.fuelKgPerFlight['Narrow-body'])} kg, wide-body {n(ASSUMPTIONS.fuelKgPerFlight['Wide-body'])} kg, regional {n(ASSUMPTIONS.fuelKgPerFlight.Regional)} kg. CO₂ factor {ASSUMPTIONS.co2PerKgFuel} kg per kg fuel.</li>
          <li>Electric share of ground equipment: {Math.round(ASSUMPTIONS.gseElectricShare * 100)}% (simulated).</li>
        </ul>
      </section>
      <section className="ops-sec">
        <h4>Delay minutes by flight (estimated)</h4>
        <Bars rows={flightBoard(weather, extraDelay, scenarioDelayMin(scen), now).map((r) => ({ k: r.id, v: r.depEst - r.depMin }))} unit=" min" />
      </section>
      <Note>{DATA_NOTE} Revenue, cost and emissions use the labelled assumptions above.</Note>
    </div>
  );
}

// ---------- What-if ----------
export function WhatIf({ scen }: { scen: Scen }) {
  const weather = useAviationStore((s) => s.weather);
  const extraDelay = useAviationStore((s) => s.extraDelay);
  const bagsScale = useAviationStore((s) => s.bagsScale);
  const setExtraDelay = useAviationStore((s) => s.setExtraDelay);
  const setBagsScale = useAviationStore((s) => s.setBagsScale);
  const setWeather = useAviationStore((s) => s.setWeather);
  const now = useAviationStore((s) => s.clock);
  const r = useMemo(() => whatIfResult({ weather, extraDelay, bagsScale, ...scen }, now), [weather, extraDelay, bagsScale, scen, now]);
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>Scenario inputs</h4>
        <div className="av-row-btns">
          {(Object.keys(SEPARATION_MIN) as Weather[]).map((w) => (
            <button key={w} className={`ops-chip ${weather === w ? 'is-on' : ''}`} onClick={() => setWeather(w)}>{w}</button>
          ))}
        </div>
        <label className="ops-small av-slider">Extra arrival delay: {extraDelay} min
          <input type="range" min={0} max={40} step={5} value={extraDelay} onChange={(e) => setExtraDelay(Number(e.target.value))} />
        </label>
        <label className="ops-small av-slider">Bag load: {Math.round(bagsScale * 100)}% of schedule
          <input type="range" min={0.8} max={1.4} step={0.05} value={bagsScale} onChange={(e) => setBagsScale(Number(e.target.value))} />
        </label>
      </section>
      <section className="ops-sec">
        <h4>Result against a clear-weather baseline</h4>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Measure</th><th>Baseline</th><th>This scenario</th></tr></thead>
            <tbody>
              <tr><td>On-time performance</td><td>{pct(r.base.otp)}</td><td>{pct(r.run.otp)}</td></tr>
              <tr><td>Runway utilisation</td><td>{pct(r.base.runwayUtil)}</td><td>{pct(r.run.runwayUtil)}</td></tr>
              <tr><td>Separation conflicts</td><td>{r.base.conflicts}</td><td>{r.run.conflicts}</td></tr>
              <tr><td>Bags mishandled per 1,000</td><td>{r.base.mishandlePer1000.toFixed(1)}</td><td>{r.run.mishandlePer1000.toFixed(1)}</td></tr>
              <tr><td>Bags in this scenario</td><td>{n(FLIGHTS.reduce((a, f) => a + f.bags, 0))}</td><td>{n(r.bagsLoad)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="ops-small">Disruption forecast (next 2 h): {r.forecast.atRisk.length} flights at risk of over 15 min delay ({r.forecast.atRisk.join(', ') || 'none'}). Probability {pct(r.forecast.probability)} (simulated).</p>
      </section>
      <Note>What-if runs do not change the live state. Choose a scenario in Control centre to apply it to the board.</Note>
    </div>
  );
}

// ---------- AI agents ----------
export function Ai({ scen, weather, extraDelay }: { scen: Scen; weather: Weather; extraDelay: number }) {
  const decisions = useAviationStore((s) => s.decisions);
  const decide = useAviationStore((s) => s.decide);
  const assign = useAviationStore((s) => s.assignReplacement);
  const recs = recommendations({ ...scen, weather, extraDelay });
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>Specialist agents</h4>
        <div className="av-agents">
          {AGENTS.map((a) => {
            const mine = recs.filter((r) => r.agent === a.id).length;
            return (
              <div key={a.id} className="av-card">
                <div className="ops-small"><strong>{a.name}</strong> <span className="ops-muted">{mine} open</span></div>
                <div className="ops-small ops-muted">{a.scope}</div>
              </div>
            );
          })}
        </div>
        <Note>Agents recommend only. They cannot assign equipment, change schedules or close safety items.</Note>
      </section>
      <section className="ops-sec">
        <h4>Recommendations</h4>
        {recs.length === 0 && <p className="ops-small">No open recommendations for this scenario.</p>}
        {recs.map((r) => {
          const d = decisions[r.id];
          return (
            <div key={r.id} className="av-card">
              <div className="ops-small"><strong>{r.title}</strong> <span className="ops-muted">· {AGENTS.find((a) => a.id === r.agent)?.name}</span></div>
              <div className="ops-small ops-muted">{r.rationale}</div>
              <div className="ops-small">Impact: {r.impact}</div>
              <div className="ops-small ops-muted">Confidence {pct(r.confidence)} · Source: {r.dataSource}</div>
              <div className="av-row-btns">
                {d ? <span className="ops-small">{d === 'approved' ? 'Approved' : 'Rejected'} by operator</span> : (
                  <>
                    <button className="ops-btn primary" onClick={() => (r.id === 'rec-bt-replacement' ? assign() : decide(r.id, r.title, 'approved'))}>Approve</button>
                    <button className="ops-btn" onClick={() => decide(r.id, r.title, 'rejected')}>Reject</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <Note>Every decision is recorded in the audit trail. Simulated decisions only.</Note>
      </section>
    </div>
  );
}

// ---------- Audit ----------
export function Audit() {
  const audit = useAviationStore((s) => s.audit);
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>Audit trail (this session)</h4>
        {audit.length === 0 && <p className="ops-small">No actions recorded yet. Approvals, sign-offs and scenario changes appear here.</p>}
        {audit.length > 0 && (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>#</th><th>Clock</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>
              <tbody>
                {[...audit].reverse().map((a) => (
                  <tr key={a.seq}><td>{a.seq}</td><td>{a.time}</td><td>{a.actor}</td><td>{a.action}</td><td>{a.detail}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Note>Audit entries are simulated and reset with the guided demo. They are not a compliance record.</Note>
    </div>
  );
}

export { SEPARATION_MIN, TASKS };
export type { Scen as ScenarioFlags };
