import { cityKpis, eventPlan, facilityById, facilityKpis, FACILITIES, maintenanceImpact, opportunities, roi, COST_DEFAULTS, REV_DEFAULTS, tenantRelease, type OpsState } from './model';
import { usePark } from './store';

/**
 * Deterministic answers to operator questions, computed from the current PARKNEX state and models (no language
 * model). Each answer names the numbers it used.
 */
const n = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d });

export function answer(q: string, ops: OpsState): string {
  const t = q.toLowerCase();
  const k = cityKpis(ops);
  const by = (f: (p: (typeof k.per)[number]) => number) => [...k.per].sort((a, b) => f(b) - f(a));
  if (/most (available|vacant|free)|nearest available|direct incoming/.test(t)) {
    const best = by((p) => p.available)[0];
    return /direct/.test(t)
      ? `Guidance set: incoming visitors are directed to ${best.name}, ${n(best.available)} spaces free (${n(best.occupancy * 100)} % full). Signs at the other facilities point there when they pass 90 %.`
      : `${best.name} has the most free spaces: ${n(best.available)} of ${n(best.capacity)} (${n(best.occupancy * 100)} % full).`;
  }
  if (/highest revenue|most revenue|generating/.test(t)) {
    const best = by((p) => p.revenueToday)[0];
    return `${best.name} has earned the most today: AED ${n(best.revenueToday)} (simulated), AED ${n(best.revenuePerH)} per hour now.`;
  }
  if (/approaching capacity|nearly full|saturat/.test(t)) {
    const hot = k.per.filter((p) => p.occupancy >= 0.85);
    return hot.length ? `Approaching capacity: ${hot.map((p) => `${p.name} ${n(p.occupancy * 100)} %`).join(', ')}.` : `No facility is above 85 %. The fullest is ${by((p) => p.occupancy)[0].name} at ${n(by((p) => p.occupancy)[0].occupancy * 100)} %.`;
  }
  if (/sensor/.test(t)) return `${n(k.sensorsOffline)} sensors are offline and ${n(k.sensorsFaulty)} faulty out of ${n(k.sensorsOk + k.sensorsOffline + k.sensorsFaulty)} (simulated device states).`;
  if (/develop|another parking|new facility|where should/.test(t)) {
    const o = opportunities()[0];
    return `Best opportunity: ${o.district} (${o.id}), score ${o.score}: estimated demand ${n(o.demand)} vs free supply ${n(o.supply)} within 300 m; a ${n(o.capacity)}-bay surface facility fits on ${n(o.areaM2)} m². Signals: ${o.signals.join('; ') || 'none'}.`;
  }
  if (/roi|viable|payback/.test(t)) {
    const s = usePark.getState();
    const r = roi(s.cost ?? COST_DEFAULTS, s.rev ?? REV_DEFAULTS);
    return `With the current assumptions: investment AED ${n(r.cost.capex)}, annual net operating income AED ${n(r.noi)}, ROI ${n(r.roiPct, 1)} %, payback ${r.payback === null ? 'not reached' : `${n(r.payback, 1)} years`}. ${r.roiPct >= 6 && r.payback !== null && r.payback <= 12 ? 'Viable under the simulated criteria.' : 'Not viable under the simulated criteria.'} Estimates, not guaranteed returns.`;
  }
  if (/tenant/.test(t)) {
    const f = facilityById('residential') ?? FACILITIES[0];
    const r = tenantRelease(f, { protectPct: 10, maxRelease: 999, visitorDemand: 80, hours: 8, tariff: f.tariffHour });
    return `${f.name}: ${n(r.allocated)} tenant bays, ${n(r.expected)} expected in use 09–17; ${n(r.eligible)} can be released after a ${n(r.protectedBays)}-bay buffer. Selling ${n(r.sold)} to visitors adds about AED ${n(r.extraRevenueDay)} a day (AED ${n(r.extraRevenueMonth)} a month).`;
  }
  if (/event/.test(t)) {
    const e = usePark.getState().event;
    const p = eventPlan(e, ops);
    return `${e.type} with ${n(e.attendance)} attendees needs about ${n(p.vehicles)} spaces; ${n(p.available)} are free within 3 km at ${e.startH}:00, shortage ${n(p.shortage)}${p.shortage ? ' — plan overflow or shuttles' : ''}. Estimated event revenue AED ${n(p.revenue)}.`;
  }
  if (/maintenance|close (row|cluster)/.test(t)) {
    const f = facilityById(/business/.test(t) ? 'business' : /residential/.test(t) ? 'residential' : 'central') ?? FACILITIES[0];
    const m = maintenanceImpact(f, 'row', { row: 0, hours: 4, startH: Math.floor(ops.hour) }, ops);
    return `Closing row 1 at ${f.name} for 4 h removes ${n(m.affected)} spaces (${n(m.remaining)} remain), puts about AED ${n(m.revenueAtRisk)} at risk, with ${n(m.alternative)} free spaces elsewhere. Lowest-demand start: ${m.recommendedStart}:00.`;
  }
  if (/pric|tariff/.test(t)) {
    const f = by((p) => p.occupancy)[0];
    return `${f.name} is the fullest (${n(f.occupancy * 100)} %). Run the Parking Intelligence Agent to compare a tariff rise, peak pricing and tenant release; it needs operator approval before any change.`;
  }
  const f = facilityKpis(FACILITIES[0], ops);
  return `City-wide: ${n(k.occupied)} of ${n(k.capacity)} spaces occupied (${n(k.occupancy * 100)} %), ${n(k.available)} free; ${f.name} ${n(f.available)} free. Try: most available spaces, highest revenue, sensors offline, where to develop, ROI.`;
}
