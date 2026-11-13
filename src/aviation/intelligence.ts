/**
 * MRR AVIATION intelligence layer (Phase 3). Specialist agents RECOMMEND only. Every recommendation waits for a human decision.
 * All figures are simulated and every financial or emissions factor is a labelled assumption, not a measured value.
 */
import { FLEET, FLIGHTS, SIM_NOW, hm, scenarioDelayMin } from './model';
import { AIRCRAFT, baggageTracking, gseHealth, INCIDENTS, runwayConflicts, standStatus, WEATHER_DELAY_MIN, type Weather, opsKpis } from './ops';

export type AgentId = 'turnaround' | 'baggage' | 'maintenance' | 'stand' | 'weather' | 'safety';
export const AGENTS: { id: AgentId; name: string; scope: string }[] = [
  { id: 'turnaround', name: 'Turnaround agent', scope: 'Sequencing of ramp activities and delay estimates' },
  { id: 'baggage', name: 'Baggage agent', scope: 'Tractor allocation and bag tracking' },
  { id: 'maintenance', name: 'Maintenance agent', scope: 'Predictive maintenance on GSE and aircraft' },
  { id: 'stand', name: 'Stand and runway agent', scope: 'Stand allocation and runway sequencing' },
  { id: 'weather', name: 'Weather agent', scope: 'Scenario impact of weather on capacity' },
  { id: 'safety', name: 'Safety agent', scope: 'Checks and incident triage, always human-owned' },
];

export interface Recommendation {
  id: string;
  agent: AgentId;
  title: string;
  rationale: string;
  impact: string;
  confidence: number; // 0..1, simulated
  dataSource: string;
}

export interface WhatIf { weather: Weather; extraDelay: number; bagsScale: number }

/** Build all current recommendations from the simulated state. Deterministic. */
export function recommendations(s: { baggageTractorFailed: boolean; replacementAssigned: boolean; weather: Weather; extraDelay: number }): Recommendation[] {
  const out: Recommendation[] = [];
  const hi = gseHealth().filter((h) => h.risk === 'High');
  const urgent = AIRCRAFT.filter((a) => a.flag === 'Urgent');
  if (s.baggageTractorFailed && !s.replacementAssigned) {
    const pick = FLEET.find((g) => g.category === 'Baggage tractor' && g.status === 'Available');
    out.push({
      id: 'rec-bt-replacement', agent: 'baggage',
      title: pick ? `Assign ${pick.id} to SH204 baggage loading` : 'No spare baggage tractor. Escalate to ramp supervisor',
      rationale: 'BT-01 failed while serving SH204. An available tractor is on standby. BT-03 stays on charge and BT-04 stays in service.',
      impact: 'Saves about 6 minutes of baggage loading delay on SH204.', confidence: pick ? 0.9 : 0.4, dataSource: 'GSE status feed (simulated)',
    });
  }
  for (const h of hi) {
    out.push({
      id: `rec-gse-${h.id}`, agent: 'maintenance',
      title: `Pull ${h.id} for inspection within ${h.failInDays} days`,
      rationale: `Health score ${h.score}/100. Vibration ${h.vibration} mm/s and temperature ${h.tempC} °C are both high for its ${h.hours} running hours.`,
      impact: 'Avoids an unplanned breakdown during peak turnarounds.', confidence: 0.78, dataSource: 'GSE telemetry (simulated)',
    });
  }
  for (const a of urgent) {
    out.push({
      id: `rec-check-${a.tail}`, agent: 'maintenance',
      title: `Schedule a check for ${a.tail} (${a.hoursToCheck} h to limit)`,
      rationale: 'Hours to the next heavy check are below the planning threshold. Move it into the next night-stop window.',
      impact: 'Keeps the aircraft within its maintenance limit. Needs a licensed engineer to confirm.', confidence: 0.85, dataSource: 'Aircraft maintenance plan (fictional)',
    });
  }
  const conf = runwayConflicts(s.weather, s.extraDelay);
  if (conf.length > 0) {
    out.push({
      id: 'rec-resequence', agent: 'stand',
      title: `Re-sequence ${conf.length} runway movement pair${conf.length > 1 ? 's' : ''} under ${s.weather.toLowerCase()}`,
      rationale: `Separation is below the ${s.weather.toLowerCase()} minimum at ${conf.length} point${conf.length > 1 ? 's' : ''}. Hold one arrival for 5 minutes.`,
      impact: 'Restores minimum separation. The arrival is held, not cancelled.', confidence: 0.7, dataSource: 'Runway schedule (simulated)',
    });
  }
  if (s.weather !== 'Clear') {
    out.push({
      id: 'rec-weather', agent: 'weather',
      title: `Plan for ${s.weather.toLowerCase()}: add ${WEATHER_DELAY_MIN[s.weather]} min to arrivals`,
      rationale: 'Scenario weather reduces runway capacity and widens separation.',
      impact: 'Better passenger communication and stand planning.', confidence: 0.65, dataSource: 'Weather scenario (simulated)',
    });
  }
  const open = INCIDENTS.filter((i) => i.status === 'Open' && i.severity === 'High');
  for (const i of open) {
    out.push({
      id: `rec-safety-${i.id}`, agent: 'safety',
      title: `Confirm the safety owner for ${i.id}`,
      rationale: `${i.type} at ${i.area}. Only a human safety owner can close or escalate this.`,
      impact: 'Ensures the incident is owned and tracked.', confidence: 1, dataSource: 'Incident log (simulated)',
    });
  }
  return out;
}

// ---------- Forecasts and what-if ----------

/** Disruption forecast for the next 2 hours: flights at risk of a delay above 15 minutes. */
export function disruptionForecast(s: WhatIf, baggageTractorFailed: boolean, now = SIM_NOW) {
  const at = FLIGHTS.filter((f) => f.arrMin >= now && f.arrMin <= now + 120);
  const extra = WEATHER_DELAY_MIN[s.weather] + s.extraDelay;
  const atRisk = at.filter((f) => extra + (f.id === 'SH204' ? scenarioDelayMin({ baggageTractorFailed, replacementAssigned: false }) : 0) > 15).map((f) => f.id);
  return { horizonMin: 120, atRisk, probability: Math.min(0.95, 0.12 + extra / 60) };
}

/** Full what-if run: KPIs for the chosen weather, extra delay and baggage load. */
export function whatIfResult(s: WhatIf & { baggageTractorFailed: boolean; replacementAssigned: boolean }, now = SIM_NOW) {
  const scen = s.bagsScale;
  const base = opsKpis('Clear', 0, 0, false, false, now);
  const run = opsKpis(s.weather, s.extraDelay, scenarioDelayMin({ baggageTractorFailed: s.baggageTractorFailed, replacementAssigned: s.replacementAssigned }), s.baggageTractorFailed, s.replacementAssigned, now);
  const bagsLoad = Math.round(FLIGHTS.reduce((a, f) => a + f.bags, 0) * scen);
  return { base, run, bagsLoad, forecast: disruptionForecast(s, s.baggageTractorFailed, now) };
}

// ---------- Cost, revenue, emissions (labelled assumptions) ----------

/** Fictional planning assumptions. These are not measured values. */
export const ASSUMPTIONS = {
  revenuePerPaxAED: 85,       // aero and ancillary revenue per passenger
  delayCostPerMinAED: 75,     // cost of one minute of delay per flight
  turnaroundCostAED: 1400,    // ramp and handling cost per turnaround
  fuelKgPerFlight: { 'Narrow-body': 2300, 'Wide-body': 9800, Regional: 1100 } as Record<string, number>,
  co2PerKgFuel: 3.16,         // kg CO2 per kg jet fuel (standard combustion factor)
  gseElectricShare: 0.45,     // share of GSE assumed to be electric (simulated)
};

export function financials(delayMin: number) {
  const pax = FLIGHTS.reduce((a, f) => a + f.pax, 0);
  const revenue = pax * ASSUMPTIONS.revenuePerPaxAED;
  const turns = FLIGHTS.length;
  const cost = turns * ASSUMPTIONS.turnaroundCostAED + delayMin * ASSUMPTIONS.delayCostPerMinAED;
  return { revenue, cost, margin: revenue - cost, delayCost: delayMin * ASSUMPTIONS.delayCostPerMinAED };
}

export function emissions() {
  const fuel = FLIGHTS.reduce((a, f) => a + ASSUMPTIONS.fuelKgPerFlight[f.type] * 2, 0); // arrival and departure
  const co2t = (fuel * ASSUMPTIONS.co2PerKgFuel) / 1000;
  const gseElectric = Math.round(ASSUMPTIONS.gseElectricShare * 100);
  return { fuelT: Math.round(fuel / 1000 * 10) / 10, co2t: Math.round(co2t * 10) / 10, gseElectric };
}

// ---------- Executive summary ----------

export function executiveSummary(s: { baggageTractorFailed: boolean; replacementAssigned: boolean; weather: Weather; extraDelay: number }, now = SIM_NOW) {
  const kp = opsKpis(s.weather, s.extraDelay, scenarioDelayMin({ baggageTractorFailed: s.baggageTractorFailed, replacementAssigned: s.replacementAssigned }), s.baggageTractorFailed, s.replacementAssigned, now);
  const recs = recommendations(s);
  const stands = standStatus(now);
  return {
    otp: kp.otp,
    openIncidents: kp.openIncidents,
    pendingRecs: recs.length,
    freeStands: stands.filter((x) => x.free).length,
    standsTotal: stands.length,
    clock: hm(now),
    baggageMishandled: baggageTracking(s.baggageTractorFailed, s.replacementAssigned, now).reduce((a, b) => a + b.mishandled, 0),
  };
}

// ---------- Audit trail ----------

export interface AuditEntry { seq: number; time: string; actor: 'System' | 'Operator' | 'Agent'; action: string; detail: string }
