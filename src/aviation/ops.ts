/**
 * MRR AVIATION operations layer (Phase 2). Pure functions and fictional data only: no React, no three.js, so it can be unit tested.
 * Every number is simulated and deterministic. Nothing here connects to a real airline, airport, ATC or government system.
 */
import { FLEET, FLIGHTS, SIM_NOW, hm, type Flight } from './model';

export const DATA_NOTE = 'Simulated data. Fictional airport, airline and flights. No live feeds are connected.';

// ---------- Runway and stand allocation ----------

export type Weather = 'Clear' | 'Fog' | 'Gusty crosswind' | 'Thunderstorm';

/** Minimum runway separation between movements (minutes) per weather state. Bad weather widens it, which reduces capacity. */
export const SEPARATION_MIN: Record<Weather, number> = { Clear: 3, Fog: 5, 'Gusty crosswind': 4, Thunderstorm: 7 };
/** Extra arrival delay (minutes) that weather adds to arriving flights in this simulation. */
export const WEATHER_DELAY_MIN: Record<Weather, number> = { Clear: 0, Fog: 15, 'Gusty crosswind': 10, Thunderstorm: 25 };

export interface Movement { flightId: string; kind: 'Arrival' | 'Departure'; t: number }

/** Runway movements in time order (arrival and departure of every flight). */
export function movements(): Movement[] {
  const m: Movement[] = [];
  for (const f of FLIGHTS) {
    m.push({ flightId: f.id, kind: 'Arrival', t: f.arrMin });
    m.push({ flightId: f.id, kind: 'Departure', t: f.depMin });
  }
  return m.sort((a, b) => a.t - b.t);
}

/** Pairs of consecutive movements closer together than the weather separation. */
export function runwayConflicts(weather: Weather, extraDelay = 0) {
  const sep = SEPARATION_MIN[weather];
  const m = movements().map((x) => (x.kind === 'Arrival' ? { ...x, t: x.t + extraDelay } : x)).sort((a, b) => a.t - b.t);
  const out: { a: Movement; b: Movement; gap: number }[] = [];
  for (let i = 1; i < m.length; i++) {
    const gap = m[i].t - m[i - 1].t;
    if (gap < sep) out.push({ a: m[i - 1], b: m[i], gap });
  }
  return out;
}

/** Runway utilisation over 06:00–22:00 from movement count and separation, capped at 100 %. */
export function runwayUtilisation(weather: Weather) {
  const window = 16 * 60;
  const capacity = Math.floor(window / SEPARATION_MIN[weather]);
  return Math.min(1, movements().length / capacity);
}

/** Stand occupancy at the clock, and which stands are free for the next arrival. */
export function standStatus(now = SIM_NOW) {
  const occupied = FLIGHTS.filter((f) => f.arrMin <= now && now < f.depMin).map((f) => f.stand);
  const all = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'R1', 'R2'];
  return all.map((s) => ({ stand: s, occupiedBy: FLIGHTS.find((f) => f.stand === s && f.arrMin <= now && now < f.depMin)?.id ?? null, free: !occupied.includes(s) }));
}

/** Stand conflicts in the static schedule (two flights on one stand overlapping in time). Should be empty. */
export function standConflicts() {
  const out: [string, string][] = [];
  for (let i = 0; i < FLIGHTS.length; i++) for (let j = i + 1; j < FLIGHTS.length; j++) {
    const a = FLIGHTS[i], b = FLIGHTS[j];
    if (a.stand === b.stand && a.arrMin < b.depMin && b.arrMin < a.depMin) out.push([a.id, b.id]);
  }
  return out;
}

// ---------- Flight board ----------

export interface BoardRow extends Flight { arrEst: number; depEst: number; state: 'Scheduled' | 'Approaching' | 'On stand' | 'Departed' | 'Delayed' }

/** Board with estimated times. Weather adds arrival delay. The scenario flight adds its own delay when the tractor fails. */
export function flightBoard(weather: Weather, extraDelay: number, scenarioDelay: number, now = SIM_NOW): BoardRow[] {
  return FLIGHTS.map((f) => {
    const arrDelay = WEATHER_DELAY_MIN[weather] + extraDelay + (f.id === 'SH204' ? scenarioDelay : 0);
    const arrEst = f.arrMin + arrDelay;
    const depEst = f.depMin + arrDelay;
    let state: BoardRow['state'] = 'Scheduled';
    if (depEst <= now) state = 'Departed';
    else if (arrEst <= now) state = 'On stand';
    else if (arrEst - 20 <= now) state = 'Approaching';
    if (arrDelay > 0 && depEst > f.depMin && state !== 'Departed') state = 'Delayed';
    return { ...f, arrEst, depEst, state };
  });
}

/** On-time performance: share of movements leaving within 15 min of schedule (simulated). */
export function onTimePerformance(weather: Weather, extraDelay: number, scenarioDelay: number, now = SIM_NOW) {
  const b = flightBoard(weather, extraDelay, scenarioDelay, now);
  const ontime = b.filter((r) => r.depEst - r.depMin <= 15).length;
  return ontime / b.length;
}

// ---------- Passenger flow ----------

export interface HourFlow { hour: number; checkIn: number; security: number; boarding: number }

/** Passenger flow per hour across the day: check-in opens 3 h before departure, security 2 h, boarding 40 min. */
export function passengerFlow(): HourFlow[] {
  const rows: HourFlow[] = Array.from({ length: 24 }, (_, hour) => ({ hour, checkIn: 0, security: 0, boarding: 0 }));
  for (const f of FLIGHTS) {
    const spread = (from: number, to: number, key: 'checkIn' | 'security' | 'boarding', total: number) => {
      const mins = Math.max(1, to - from);
      for (let t = from; t < to; t++) {
        const h = Math.floor(t / 60);
        if (h >= 0 && h < 24) rows[h][key] += total / mins;
      }
    };
    spread(f.depMin - 180, f.depMin - 40, 'checkIn', f.pax);
    spread(f.depMin - 120, f.depMin - 30, 'security', f.pax);
    spread(f.depMin - 40, f.depMin, 'boarding', f.pax);
  }
  return rows.map((r) => ({ hour: r.hour, checkIn: Math.round(r.checkIn), security: Math.round(r.security), boarding: Math.round(r.boarding) }));
}

/** Security checkpoint capacity (passengers per hour, simulated) and peak utilisation. */
export const SECURITY_CAPACITY_PER_HOUR = 520;
export function securityPeak() {
  const f = passengerFlow();
  const peak = f.reduce((a, b) => (b.security > a.security ? b : a));
  return { hour: peak.hour, load: peak.security, utilisation: peak.security / SECURITY_CAPACITY_PER_HOUR };
}

// ---------- Baggage ----------

export interface BagRow { flightId: string; bags: number; loaded: number; mishandled: number; status: string }

/** Baggage per flight. Mishandling is simulated at 2.1 per 1,000 bags, plus the failed-tractor effect on SH204 when it applies. */
export function baggageTracking(tractorFailed: boolean, replacementAssigned: boolean, now = SIM_NOW): BagRow[] {
  return FLIGHTS.map((f) => {
    const base = Math.round(f.bags * 0.0021);
    const fault = f.id === 'SH204' && tractorFailed && !replacementAssigned ? Math.ceil(f.bags * 0.02) : 0;
    const mishandled = base + fault;
    const loaded = f.depMin <= now ? f.bags : f.id === 'SH204' && tractorFailed && !replacementAssigned ? Math.round(f.bags * 0.6) : Math.round(f.bags * 0.3);
    const status = f.depMin <= now ? 'Loaded and departed' : fault > 0 ? 'Delayed: tractor shortage' : 'In handling';
    return { flightId: f.id, bags: f.bags, loaded, mishandled, status };
  });
}

// ---------- Ground fleet and predictive maintenance ----------

export interface Health { id: string; hours: number; vibration: number; tempC: number; score: number; risk: 'Low' | 'Medium' | 'High'; failInDays: number | null }

/** Simulated telemetry per GSE unit. Health falls with running hours, vibration and temperature. */
const TELEMETRY: Record<string, { hours: number; vibration: number; tempC: number }> = {
  'BT-01': { hours: 6120, vibration: 6.9, tempC: 88 },
  'BT-02': { hours: 2210, vibration: 3.1, tempC: 61 },
  'BT-03': { hours: 3870, vibration: 4.0, tempC: 70 },
  'BT-04': { hours: 7480, vibration: 7.4, tempC: 84 },
  'CT-01': { hours: 4120, vibration: 4.6, tempC: 66 },
  'GPU-01': { hours: 5600, vibration: 5.8, tempC: 79 },
  'GPU-02': { hours: 1900, vibration: 2.8, tempC: 58 },
  'PT-01': { hours: 3300, vibration: 3.6, tempC: 64 },
  'FB-01': { hours: 4950, vibration: 5.1, tempC: 72 },
  'FB-02': { hours: 6700, vibration: 8.2, tempC: 91 },
};

export function gseHealth(): Health[] {
  return FLEET.map((g) => {
    const t = TELEMETRY[g.id];
    const wear = Math.min(1, t.hours / 9000) * 40;
    const vib = Math.max(0, t.vibration - 3) * 6;
    const heat = Math.max(0, t.tempC - 65) * 0.8;
    const score = Math.max(0, Math.round(100 - wear - vib - heat));
    const risk: Health['risk'] = score < 45 ? 'High' : score < 70 ? 'Medium' : 'Low';
    const failInDays = risk === 'High' ? Math.max(3, Math.round((score - 20) * 0.9)) : risk === 'Medium' ? Math.round(score * 1.2) : null;
    return { id: g.id, hours: t.hours, vibration: t.vibration, tempC: t.tempC, score, risk, failInDays };
  });
}

/** Aircraft fleet (fictional tails): hours to next heavy check and predicted maintenance flag. */
export interface AircraftRow { tail: string; type: string; hoursToCheck: number; cycles: number; flag: 'OK' | 'Plan check' | 'Urgent' }
export const AIRCRAFT: AircraftRow[] = [
  { tail: 'SH-112', type: 'Narrow-body', hoursToCheck: 640, cycles: 1820, flag: 'OK' },
  { tail: 'SH-201', type: 'Narrow-body', hoursToCheck: 88, cycles: 2410, flag: 'Plan check' },
  { tail: 'SH-204', type: 'Narrow-body', hoursToCheck: 512, cycles: 1990, flag: 'OK' },
  { tail: 'SH-310', type: 'Wide-body', hoursToCheck: 34, cycles: 1310, flag: 'Urgent' },
  { tail: 'SH-118', type: 'Regional', hoursToCheck: 905, cycles: 2740, flag: 'OK' },
  { tail: 'SH-455', type: 'Narrow-body', hoursToCheck: 230, cycles: 1600, flag: 'OK' },
];

// ---------- Cargo ----------

export function cargoSummary() {
  const tonnes = FLIGHTS.reduce((a, f) => a + f.cargoT, 0);
  const wide = FLIGHTS.filter((f) => f.type === 'Wide-body').reduce((a, f) => a + f.cargoT, 0);
  const capacityT = 22;
  return { tonnes: Math.round(tonnes * 10) / 10, belly: Math.round(wide * 10) / 10, warehouseUtil: Math.min(1, tonnes / (capacityT * 2)), uldsPlanned: Math.round(tonnes * 3.2) };
}

// ---------- Incidents, safety and disruption ----------

export type Severity = 'Low' | 'Medium' | 'High';
export interface Incident { id: string; t: number; type: string; severity: Severity; area: string; status: 'Open' | 'Monitoring' | 'Closed'; owner: string; note: string; flights: string[] }

export const INCIDENTS: Incident[] = [
  { id: 'INC-0412', t: 9 * 60 + 52, type: 'Equipment fault', severity: 'High', area: 'Stand A5 ramp', status: 'Open', owner: 'Ramp supervisor (fictional)', note: 'Baggage tractor BT-01 failed while serving SH204.', flights: ['SH204'] },
  { id: 'INC-0411', t: 8 * 60 + 40, type: 'Bird activity', severity: 'Low', area: 'Runway 12 threshold', status: 'Closed', owner: 'Airside safety (fictional)', note: 'Patrol cleared the area. No movement impact.', flights: [] },
  { id: 'INC-0409', t: 7 * 60 + 15, type: 'Fuel bowser fault', severity: 'Medium', area: 'Fuel farm', status: 'Monitoring', owner: 'Fuel team (fictional)', note: 'FB-02 out of service. Sensor fault, FB-01 covering.', flights: [] },
  { id: 'INC-0407', t: 6 * 60 + 30, type: 'Passenger assistance', severity: 'Low', area: 'Gate B1', status: 'Closed', owner: 'Gate team (fictional)', note: 'Wheelchair assistance delivered. Boarding unaffected.', flights: ['SH201'] },
];

/** Safety and compliance checks run by the simulation. Each has a human owner who must sign off. */
export const SAFETY_CHECKS = [
  { id: 'SC-1', label: 'Runway separation within weather minimum', owner: 'Airside operations (fictional)' },
  { id: 'SC-2', label: 'Fuel bowser sensors reporting', owner: 'Fuel team (fictional)' },
  { id: 'SC-3', label: 'Ground power connections checked before pushback', owner: 'Ramp supervisor (fictional)' },
  { id: 'SC-4', label: 'Stand clearance before arrival', owner: 'Stand control (fictional)' },
];

// ---------- Operational KPIs ----------

export function opsKpis(weather: Weather, extraDelay: number, scenarioDelay: number, tractorFailed: boolean, replacementAssigned: boolean, now = SIM_NOW) {
  const otp = onTimePerformance(weather, extraDelay, scenarioDelay, now);
  const bags = baggageTracking(tractorFailed, replacementAssigned, now);
  const totalBags = bags.reduce((a, b) => a + b.bags, 0);
  const mishandled = bags.reduce((a, b) => a + b.mishandled, 0);
  const availableGse = FLEET.filter((g) => g.status === 'Available' || g.status === 'Busy' || g.status === 'Charging').length;
  return {
    otp,
    mishandlePer1000: (mishandled / totalBags) * 1000,
    gseAvailability: availableGse / FLEET.length,
    runwayUtil: runwayUtilisation(weather),
    securityPeak: securityPeak().utilisation,
    conflicts: runwayConflicts(weather, extraDelay).length,
    openIncidents: INCIDENTS.filter((i) => i.status !== 'Closed').length,
  };
}

export { hm };
