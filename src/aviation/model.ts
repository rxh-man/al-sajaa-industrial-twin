/**
 * MRR AVIATION (fictional). Simulated airport and airline state, deterministic so the same actions
 * always give the same numbers. Nothing here is real flight, airport, passenger or financial data.
 */

export const AIRPORT = 'Sahra Gateway International Airport (fictional)';

export type FlightStatus = 'Scheduled' | 'Approaching' | 'On stand' | 'Turnaround' | 'Ready for departure' | 'Departed' | 'Delayed';

/** Simulated operations clock (minutes from 00:00). Fixed so every view shows the same picture. */
export const SIM_NOW = 9 * 60 + 58;

export interface Flight {
  id: string;            // fictional flight number
  reg: string;           // fictional registration
  type: 'Narrow-body' | 'Wide-body' | 'Regional';
  route: string;         // fictional route
  direction: 'Arrival+Departure' | 'Arrival' | 'Departure';
  stand: string;
  arrMin: number;        // scheduled arrival, minutes from 00:00
  depMin: number;        // scheduled departure, minutes from 00:00
  pax: number;
  bags: number;
  cargoT: number;        // simulated cargo tonnes carried on this movement
}

/** Ten fictional rotations on one runway. Stand letters are fictional. */
export const FLIGHTS: Flight[] = [
  { id: 'SH112', reg: 'SH-112', type: 'Narrow-body', route: 'Muscat (fictional) → Al Sajaa', direction: 'Arrival+Departure', stand: 'A1', arrMin: 7 * 60 + 30, depMin: 8 * 60 + 5, pax: 150, bags: 160, cargoT: 1.8 },
  { id: 'SH201', reg: 'SH-201', type: 'Narrow-body', route: 'Al Sajaa → Muscat (fictional)', direction: 'Arrival+Departure', stand: 'A3', arrMin: 6 * 60 + 10, depMin: 7 * 60 + 15, pax: 164, bags: 180, cargoT: 2.1 },
  { id: 'SH204', reg: 'SH-204', type: 'Narrow-body', route: 'Doha (fictional) → Al Sajaa', direction: 'Arrival+Departure', stand: 'A5', arrMin: 9 * 60 + 40, depMin: 10 * 60 + 37, pax: 172, bags: 196, cargoT: 2.4 },
  { id: 'SH310', reg: 'SH-310', type: 'Wide-body', route: 'Al Sajaa → London (fictional)', direction: 'Arrival+Departure', stand: 'B1', arrMin: 11 * 60 + 5, depMin: 13 * 60 + 30, pax: 286, bags: 330, cargoT: 9.6 },
  { id: 'SH118', reg: 'SH-118', type: 'Regional', route: 'Al Sajaa → Salalah (fictional)', direction: 'Arrival+Departure', stand: 'R2', arrMin: 12 * 60 + 20, depMin: 13 * 60 + 10, pax: 78, bags: 84, cargoT: 0.7 },
  { id: 'SH330', reg: 'SH-330', type: 'Narrow-body', route: 'Riyadh (fictional) → Al Sajaa', direction: 'Arrival+Departure', stand: 'A4', arrMin: 12 * 60 + 50, depMin: 13 * 60 + 45, pax: 168, bags: 182, cargoT: 1.9 },
  { id: 'SH455', reg: 'SH-455', type: 'Narrow-body', route: 'Kuwait City (fictional) → Al Sajaa', direction: 'Arrival+Departure', stand: 'A2', arrMin: 14 * 60, depMin: 15 * 60 + 20, pax: 160, bags: 172, cargoT: 1.6 },
  { id: 'SH520', reg: 'SH-520', type: 'Narrow-body', route: 'Cairo (fictional) → Al Sajaa', direction: 'Arrival+Departure', stand: 'A5', arrMin: 15 * 60 + 30, depMin: 16 * 60 + 40, pax: 176, bags: 190, cargoT: 2.2 },
  { id: 'SH625', reg: 'SH-625', type: 'Regional', route: 'Al Sajaa → Fujairah (fictional)', direction: 'Arrival+Departure', stand: 'R1', arrMin: 16 * 60 + 10, depMin: 16 * 60 + 55, pax: 70, bags: 80, cargoT: 0.5 },
  { id: 'SH740', reg: 'SH-740', type: 'Wide-body', route: 'Dhaka (fictional) → Al Sajaa', direction: 'Arrival+Departure', stand: 'B2', arrMin: 18 * 60 + 20, depMin: 20 * 60 + 10, pax: 268, bags: 310, cargoT: 10.4 },
];

/** Flight state at a given clock time. SH204 is the scenario flight; its status is shown as Delayed by the panel when the tractor fails. */
export function flightState(f: Flight, now: number): FlightStatus {
  if (f.depMin <= now) return 'Departed';
  if (f.arrMin <= now) return f.id === 'SH204' ? 'Turnaround' : 'On stand';
  if (f.arrMin - 20 <= now) return 'Approaching';
  return 'Scheduled';
}

export type GseCategory = 'Baggage tractor' | 'Catering truck' | 'Ground power unit' | 'Pushback tractor' | 'Fuel bowser';
export type GseStatus = 'Available' | 'Busy' | 'Charging' | 'Under maintenance' | 'Unavailable';

export interface Gse {
  id: string;
  category: GseCategory;
  status: GseStatus;
  task: string;
  utilisation: number; // 0..1 (simulated)
}

export const FLEET: Gse[] = [
  { id: 'BT-01', category: 'Baggage tractor', status: 'Busy', task: 'SH204 baggage unloading', utilisation: 0.82 },
  { id: 'BT-02', category: 'Baggage tractor', status: 'Available', task: 'Standby', utilisation: 0.41 },
  { id: 'BT-03', category: 'Baggage tractor', status: 'Charging', task: 'Battery charging', utilisation: 0.67 },
  { id: 'BT-04', category: 'Baggage tractor', status: 'Under maintenance', task: 'Scheduled service', utilisation: 0 },
  { id: 'CT-01', category: 'Catering truck', status: 'Busy', task: 'SH204 catering', utilisation: 0.7 },
  { id: 'GPU-01', category: 'Ground power unit', status: 'Busy', task: 'SH204 ground power', utilisation: 0.6 },
  { id: 'GPU-02', category: 'Ground power unit', status: 'Available', task: 'Standby', utilisation: 0.35 },
  { id: 'PT-01', category: 'Pushback tractor', status: 'Available', task: 'Standby', utilisation: 0.3 },
  { id: 'FB-01', category: 'Fuel bowser', status: 'Busy', task: 'SH204 refuelling', utilisation: 0.55 },
  { id: 'FB-02', category: 'Fuel bowser', status: 'Unavailable', task: 'Sensor fault, out of service', utilisation: 0 },
];

/** Turnaround activities (minutes) and their dependencies, in the order the spec lists them. */
export interface Task { id: string; label: string; team: string; dur: number; deps: string[]; equipment?: GseCategory }

export const TASKS: Task[] = [
  { id: 'chocks', label: 'Stand alignment and wheel chocks', team: 'Ramp', dur: 2, deps: [] },
  { id: 'disembark', label: 'Passenger disembarkation', team: 'Ground handling', dur: 12, deps: ['chocks'] },
  { id: 'unload', label: 'Baggage unloading', team: 'Baggage', dur: 10, deps: ['chocks'], equipment: 'Baggage tractor' },
  { id: 'clean', label: 'Cabin cleaning', team: 'Cabin crew support', dur: 15, deps: ['disembark'] },
  { id: 'catering', label: 'Catering servicing', team: 'Catering', dur: 12, deps: ['disembark'], equipment: 'Catering truck' },
  { id: 'fuel', label: 'Refuelling', team: 'Fuel', dur: 18, deps: ['chocks'], equipment: 'Fuel bowser' },
  { id: 'power', label: 'Ground power connection', team: 'Ramp', dur: 2, deps: ['chocks'], equipment: 'Ground power unit' },
  { id: 'load', label: 'Baggage loading', team: 'Baggage', dur: 16, deps: ['unload', 'power'], equipment: 'Baggage tractor' },
  { id: 'board', label: 'Passenger boarding', team: 'Gate', dur: 20, deps: ['clean', 'catering'] },
  { id: 'checks', label: 'Final load and operational checks', team: 'Ramp', dur: 5, deps: ['load', 'board', 'fuel'] },
  { id: 'push', label: 'Pushback', team: 'Ramp', dur: 3, deps: ['checks'], equipment: 'Pushback tractor' },
];

export interface Scenario { baggageTractorFailed: boolean; replacementAssigned: boolean }

/** Schedule every activity from the aircraft's arrival. A failed tractor holds baggage loading for 30 min (a charged or repaired unit) until a replacement arrives (2 min handover). */
export function turnaround(arrMin: number, s: Scenario) {
  const end: Record<string, number> = {};
  const rows = TASKS.map((t) => {
    const start = Math.max(arrMin, ...t.deps.map((d) => end[d]));
    let dur = t.dur;
    let note = '';
    if (t.id === 'load' && s.baggageTractorFailed) {
      const extra = s.replacementAssigned ? 2 : 30;
      dur += extra;
      note = s.replacementAssigned ? 'Replacement tractor assigned (2 min handover)' : 'Tractor BT-01 failed: loading held until a tractor is charged';
    }
    end[t.id] = start + dur;
    const alert = t.id === 'load' && s.baggageTractorFailed && !s.replacementAssigned;
    return { ...t, start, finish: start + dur, dur, note, alert };
  });
  const baseline = scheduleBaseline(arrMin);
  const ready = end.checks;
  return { rows, readyAt: ready, departAt: end.push, delayMin: end.push - baseline };
}

function scheduleBaseline(arrMin: number) {
  const end: Record<string, number> = {};
  for (const t of TASKS) end[t.id] = Math.max(arrMin, ...t.deps.map((d) => end[d])) + t.dur;
  return end.push;
}

/** Departure delay (min) that the scenario causes for SH204, taken from the turnaround timeline itself. */
export function scenarioDelayMin(s: Scenario): number {
  return turnaround(FLIGHTS[1].arrMin, s).delayMin;
}

export const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Deterministic recommendation for a failed baggage tractor: pick an available tractor (not charging, not in maintenance, not busy). */
export function recommendReplacement(): { id: string; text: string; confidence: number } | null {
  const pick = FLEET.find((g) => g.category === 'Baggage tractor' && g.status === 'Available');
  if (!pick) return null;
  return {
    id: pick.id,
    text: `Assign ${pick.id} (available, baggage tractor) to SH204 baggage loading. Keep BT-03 charging and BT-04 in service.`,
    confidence: 0.9,
  };
}

export const STANDS = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'R1', 'R2'];

/** Dashboard KPIs computed from the same flight list, clock and scenario. */
export function kpis(s: Scenario) {
  const onGround = FLIGHTS.filter((f) => f.arrMin <= SIM_NOW && SIM_NOW < f.depMin).length;
  const tr = turnaround(FLIGHTS[1].arrMin, s);
  return {
    flights: FLIGHTS.length,
    arrivals: FLIGHTS.filter((f) => f.arrMin <= 12 * 60).length,
    departures: FLIGHTS.filter((f) => f.depMin <= 12 * 60).length,
    onGround,
    stands: STANDS.length,
    standsFree: STANDS.length - onGround,
    gse: FLEET.length,
    available: FLEET.filter((g) => g.status === 'Available').length,
    busy: FLEET.filter((g) => g.status === 'Busy').length,
    unavailable: FLEET.filter((g) => g.status === 'Unavailable' || g.status === 'Under maintenance').length,
    sh204Turnaround: tr.departAt - FLIGHTS[1].arrMin,
    sh204Delay: tr.delayMin,
    pax: FLIGHTS.reduce((a, f) => a + f.pax, 0),
    bags: FLIGHTS.reduce((a, f) => a + f.bags, 0),
  };
}
