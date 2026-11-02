import { AD } from '../data/abudhabi';
import { INFILL } from '../data/infill';
import { findSites, reserveSites, type Site } from '../sustainability/development';
import { DISTRICTS, districtAt } from '../sustainability/districts';
import { hash01 } from '../sustainability/facilities';

/**
 * PARKNEX — the parking network model shared by the 3D scene, the dashboard and the agent.
 * Everything is SIMULATED and deterministic: facilities are sited on vacant, road-accessible land with the same
 * rules as the development simulator; bay states come from hourly demand profiles and stable hashes; money is
 * estimated in AED from editable assumptions. No live sensors, payments, ANPR or government systems.
 */

export type BayCategory = 'visitor' | 'tenant' | 'premium' | 'ev' | 'accessible' | 'event' | 'restricted';
export type BayStatus = 'available' | 'occupied' | 'reserved' | 'maintenance' | 'charging' | 'restricted';
export type FacilityType = 'central' | 'business' | 'residential' | 'event' | 'commercial' | 'premium';

export interface Bay {
  id: string;
  facility: string;
  x: number;
  z: number;
  alongX: boolean;
  category: BayCategory;
  /** row index, used as the maintenance "cluster" */
  row: number;
  /** sensor health: ok, offline (no data) or faulty (wrong readings) */
  sensor: 'ok' | 'offline' | 'faulty';
}

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  site: Site;
  floors: number;
  tariffHour: number;
  tariffDay: number;
  /** mean session length in hours by category */
  stayH: number;
  bays: Bay[];
  barriers: number;
  anpr: number;
  evChargers: number;
  /** tenant bays registered to tenants */
  tenants: number;
}

/** hourly demand profiles (share of bays wanted), 24 values, by facility type — illustrative */
const P = (a: number[]) => a;
export const PROFILE: Record<FacilityType, number[]> = {
  central: P([0.25, 0.2, 0.18, 0.18, 0.2, 0.3, 0.45, 0.62, 0.78, 0.86, 0.88, 0.9, 0.88, 0.86, 0.84, 0.85, 0.82, 0.78, 0.72, 0.66, 0.58, 0.48, 0.38, 0.3]),
  business: P([0.08, 0.06, 0.05, 0.05, 0.06, 0.12, 0.3, 0.62, 0.88, 0.95, 0.96, 0.94, 0.9, 0.93, 0.94, 0.9, 0.78, 0.55, 0.32, 0.2, 0.15, 0.12, 0.1, 0.09]),
  residential: P([0.9, 0.92, 0.93, 0.93, 0.92, 0.88, 0.78, 0.6, 0.48, 0.45, 0.44, 0.45, 0.47, 0.48, 0.5, 0.55, 0.62, 0.72, 0.8, 0.85, 0.88, 0.9, 0.9, 0.9]),
  event: P([0.05, 0.04, 0.03, 0.03, 0.03, 0.04, 0.06, 0.1, 0.14, 0.16, 0.18, 0.2, 0.22, 0.22, 0.22, 0.24, 0.26, 0.3, 0.34, 0.36, 0.34, 0.26, 0.16, 0.08]),
  commercial: P([0.12, 0.08, 0.06, 0.05, 0.05, 0.06, 0.1, 0.2, 0.35, 0.5, 0.62, 0.7, 0.74, 0.72, 0.7, 0.72, 0.78, 0.86, 0.92, 0.94, 0.9, 0.78, 0.55, 0.3]),
  premium: P([0.15, 0.12, 0.1, 0.1, 0.12, 0.2, 0.38, 0.6, 0.78, 0.84, 0.86, 0.85, 0.82, 0.84, 0.85, 0.82, 0.76, 0.66, 0.55, 0.45, 0.36, 0.28, 0.22, 0.18]),
};

const DEFS: { id: string; name: string; type: FacilityType; district: string; floors: number; tariffHour: number; stayH: number; tenants: number }[] = [
  { id: 'central', name: 'PARKNEX Central', type: 'central', district: 'central', floors: 3, tariffHour: 6, stayH: 2.2, tenants: 0 },
  { id: 'business', name: 'PARKNEX Business District', type: 'business', district: 'north-mixed', floors: 2, tariffHour: 5, stayH: 6.5, tenants: 60 },
  { id: 'residential', name: 'PARKNEX Residential Hub', type: 'residential', district: 'rahmaniya', floors: 1, tariffHour: 4, stayH: 3, tenants: 200 },
  { id: 'event', name: 'PARKNEX Event Arena', type: 'event', district: 'east-res', floors: 1, tariffHour: 5, stayH: 3.5, tenants: 0 },
  { id: 'commercial', name: 'PARKNEX Commercial Zone', type: 'commercial', district: 'west-logistics', floors: 1, tariffHour: 4, stayH: 1.8, tenants: 0 },
  { id: 'premium', name: 'PARKNEX EV & Premium Parking', type: 'premium', district: 'far-north', floors: 1, tariffHour: 10, stayH: 2.8, tenants: 0 },
];

/** the bay grid on a site: double rows of 2.5 × 5 m bays with a 6 m aisle, as in a real surface lot */
function layBays(fid: string, s: Site, tenants: number, type: FacilityType): Bay[] {
  const out: Bay[] = [];
  const alongX = s.w >= s.d;
  const L = (alongX ? s.w : s.d) - 1.4; // 7 m for the entry lane and pedestrian path at the ends
  const D = alongX ? s.d : s.w;
  const n = Math.floor(L / 0.25);
  const rowsZ: number[] = [];
  for (let v = -D / 2 + 0.55; v + 0.25 <= D / 2 - 0.3; ) {
    rowsZ.push(v);
    if (v + 0.5 + 0.25 <= D / 2 - 0.3) rowsZ.push(v + 0.5);
    v += 1.0 + 0.6; // bay + bay + aisle
  }
  let k = 0;
  rowsZ.forEach((v, row) => {
    for (let i = 0; i < n; i++, k++) {
      const u = -L / 2 + 0.125 + i * 0.25;
      const [x, z] = alongX ? [s.x + u, s.z + v] : [s.x + v, s.z + u];
      // categories: first bays near the entrance are accessible and EV, then premium; tenants on the far rows
      const r = hash01(k, 91);
      let category: BayCategory = 'visitor';
      if (row === 0 && i < 4) category = 'accessible';
      else if (row === 0 && i < 4 + (type === 'premium' ? 24 : 8)) category = 'ev';
      else if (type === 'premium' && row <= 1) category = 'premium';
      else if (row === rowsZ.length - 1 && i > n - 4) category = 'restricted';
      else if (type === 'event' && row >= 1) category = 'event';
      out.push({ id: `${fid}-${String(row + 1).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`, facility: fid, x, z, alongX, category, row, sensor: r < 0.018 ? 'offline' : r < 0.026 ? 'faulty' : 'ok' });
    }
  });
  // tenant allocation from the far rows inward
  let t = tenants;
  for (let i = out.length - 1; i >= 0 && t > 0; i--) if (out[i].category === 'visitor') (out[i].category = 'tenant'), t--;
  return out;
}

function build(): Facility[] {
  const used: Site[] = [];
  const out: Facility[] = [];
  for (const d of DEFS) {
    const free = (s: Site) => !used.some((u) => Math.abs(u.x - s.x) < (u.w + s.w) / 2 + 1 && Math.abs(u.z - s.z) < (u.d + s.d) / 2 + 1);
    const site = findSites(d.district, 'large', 6).find(free) ?? findSites(d.district, 'medium', 8).find(free);
    if (!site) continue;
    used.push(site);
    const bays = layBays(d.id, site, d.tenants, d.type);
    out.push({ ...d, site, tariffDay: d.tariffHour * 6, bays, barriers: 2, anpr: 2 + d.floors, evChargers: bays.filter((b) => b.category === 'ev').length, tenants: d.tenants });
  }
  reserveSites(used);
  return out;
}

export const FACILITIES: Facility[] = build();
export const ALL_BAYS: Bay[] = FACILITIES.flatMap((f) => f.bays);
export const facilityById = (id: string) => FACILITIES.find((f) => f.id === id);

/* ------------------------------------------------------------------ state at an hour */

export interface OpsState {
  hour: number;
  /** tariff multiplier per facility (pricing changes), default 1 */
  tariffMul: Record<string, number>;
  /** bays under maintenance (ids) and whole facilities closed at entry */
  maintenance: Set<string>;
  /** extra demand at a facility from an event (vehicles) */
  eventVehicles: Record<string, number>;
  /** tenant bays temporarily released to visitors, per facility */
  released: Record<string, number>;
  /** reserved bays (pre-booked), share of visitor bays */
  reserveShare: number;
}

export const BASE_OPS: OpsState = { hour: 10, tariffMul: {}, maintenance: new Set(), eventVehicles: {}, released: {}, reserveShare: 0.04 };

/** price response: occupancy scales with (price ratio)^ELASTICITY (assumption, short-run parking studies ~ -0.3) */
export const ELASTICITY = -0.35;

const lerpHour = (p: number[], h: number) => {
  const a = Math.floor(h) % 24;
  const t = h - Math.floor(h);
  return p[a] * (1 - t) + p[(a + 1) % 24] * t;
};

export function demandShare(f: Facility, ops: OpsState, hour = ops.hour) {
  const mul = ops.tariffMul[f.id] ?? 1;
  return Math.min(0.99, lerpHour(PROFILE[f.type], hour) * mul ** ELASTICITY);
}

/** status of every bay at the given state (deterministic) */
export function bayStatus(b: Bay, f: Facility, ops: OpsState, extraShare = 0): BayStatus {
  if (ops.maintenance.has(b.id) || ops.maintenance.has(`${f.id}:all`) || ops.maintenance.has(`${f.id}:row${b.row}`)) return 'maintenance';
  if (b.category === 'restricted') return 'restricted';
  const r = hash01(Number.parseInt(b.id.replace(/\D/g, ''), 10) + f.id.length * 7919, Math.floor(ops.hour * 4));
  if (b.category === 'tenant') {
    const released = ops.released[f.id] ?? 0;
    // tenants follow their facility's own pattern (residents at night, office permit-holders by day)
    const tenantUse = lerpHour(PROFILE[f.type], ops.hour) * 0.92;
    return r < tenantUse ? 'occupied' : released > 0 && r < tenantUse + 0.2 ? 'occupied' : 'reserved';
  }
  const share = Math.min(0.995, demandShare(f, ops) + extraShare);
  if (b.category !== 'ev' && hash01(Number.parseInt(b.id.replace(/\D/g, ''), 10), 5) < ops.reserveShare && r > share) return 'reserved';
  if (r < share) return b.category === 'ev' ? 'charging' : 'occupied';
  return 'available';
}

export interface FacilityKpis {
  id: string;
  name: string;
  capacity: number;
  occupied: number;
  available: number;
  reserved: number;
  maintenance: number;
  charging: number;
  paidOccupied: number;
  occupancy: number;
  sensorsOk: number;
  sensorsOffline: number;
  sensorsFaulty: number;
  entriesPerH: number;
  exitsPerH: number;
  revenueToday: number;
  revenuePerH: number;
  forecastDay: number;
  avgStayH: number;
  waitMin: number;
}

/** floors: the rendered deck is one level; capacity and money scale with the number of floors */
export function facilityKpis(f: Facility, ops: OpsState): FacilityKpis {
  const extra = (ops.eventVehicles[f.id] ?? 0) / Math.max(1, f.bays.length * f.floors);
  const c = { occupied: 0, available: 0, reserved: 0, maintenance: 0, charging: 0, paid: 0 };
  for (const b of f.bays) {
    const s = bayStatus(b, f, ops, extra);
    if (s === 'occupied') {
      c.occupied++;
      if (b.category !== 'tenant' && b.category !== 'accessible') c.paid++;
    } else if (s === 'charging') {
      c.charging++;
      c.paid++;
    } else if (s === 'available') c.available++;
    else if (s === 'reserved') c.reserved++;
    else if (s === 'maintenance') c.maintenance++;
  }
  const fl = f.floors;
  const capacity = f.bays.length * fl;
  const occupied = (c.occupied + c.charging) * fl;
  const tariff = f.tariffHour * (ops.tariffMul[f.id] ?? 1);
  const paidOcc = c.paid * fl;
  // turnover: a bay occupied for stayH hours sees 1/stayH entries an hour
  const entries = paidOcc / f.stayH + (ops.eventVehicles[f.id] ? ops.eventVehicles[f.id] / 2 : 0);
  // revenue: integral of paid occupancy × tariff from midnight to now, capped by the daily tariff per bay
  const paidShare = paidOcc / Math.max(1, occupied || 1);
  let today = 0;
  let day = 0;
  for (let h = 0; h < 24; h += 0.5) {
    const v = demandShare(f, ops, h) * capacity * Math.min(1, paidShare || 0.7) * tariff * 0.5;
    day += v;
    if (h < ops.hour) today += v;
  }
  const cap = capacity * f.tariffDay * (ops.tariffMul[f.id] ?? 1) * 1.6;
  const sensors = f.bays.reduce((a, b) => ((a[b.sensor] += fl), a), { ok: 0, offline: 0, faulty: 0 });
  const occ = occupied / Math.max(1, capacity - c.maintenance * fl);
  return {
    id: f.id,
    name: f.name,
    capacity,
    occupied,
    available: c.available * fl,
    reserved: c.reserved * fl,
    maintenance: c.maintenance * fl,
    charging: c.charging * fl,
    paidOccupied: paidOcc,
    occupancy: occ,
    sensorsOk: sensors.ok,
    sensorsOffline: sensors.offline,
    sensorsFaulty: sensors.faulty,
    entriesPerH: entries,
    exitsPerH: entries * (ops.hour < 17 ? 0.85 : 1.25),
    revenueToday: Math.min(today, cap),
    revenuePerH: paidOcc * tariff,
    forecastDay: Math.min(day, cap),
    avgStayH: f.stayH,
    // queueing at the barrier: grows sharply as the facility fills (M/M/1-style, 20 s service, illustrative)
    waitMin: Math.min(15, (1 / 3) * (occ > 0.97 ? 8 : 1 / Math.max(0.05, 1 - occ)) * 0.2),
  };
}

export function cityKpis(ops: OpsState) {
  const per = FACILITIES.map((f) => facilityKpis(f, ops));
  const sum = (k: keyof FacilityKpis) => per.reduce((a, p) => a + (p[k] as number), 0);
  const capacity = sum('capacity');
  const occupied = sum('occupied');
  return {
    per,
    facilities: per.length,
    capacity,
    occupied,
    available: sum('available'),
    reserved: sum('reserved'),
    maintenance: sum('maintenance'),
    paidOccupied: sum('paidOccupied'),
    activeSessions: occupied,
    occupancy: occupied / Math.max(1, capacity - sum('maintenance')),
    sensorsOk: sum('sensorsOk'),
    sensorsOffline: sum('sensorsOffline'),
    sensorsFaulty: sum('sensorsFaulty'),
    entriesPerH: sum('entriesPerH'),
    exitsPerH: sum('exitsPerH'),
    avgStayH: per.reduce((a, p) => a + p.avgStayH * p.occupied, 0) / Math.max(1, occupied),
    avgWaitMin: per.reduce((a, p) => a + p.waitMin, 0) / Math.max(1, per.length),
    revenueToday: sum('revenueToday'),
    revenuePerH: sum('revenuePerH'),
    forecastDay: sum('forecastDay'),
  };
}

/** hourly occupancy curve (city or one facility) */
export const hourlyOccupancy = (ops: OpsState, f?: Facility) =>
  Array.from({ length: 24 }, (_, h) => {
    const list = f ? [f] : FACILITIES;
    const cap = list.reduce((a, x) => a + x.bays.length * x.floors, 0);
    return list.reduce((a, x) => a + demandShare(x, ops, h) * x.bays.length * x.floors, 0) / cap;
  });

/* ------------------------------------------------------------------ pricing */

export function pricingScenario(f: Facility, ops: OpsState, mul: number) {
  const o = { ...ops, tariffMul: { ...ops.tariffMul, [f.id]: mul } };
  const k = facilityKpis(f, o);
  return { mul, tariff: f.tariffHour * mul, occupancy: k.occupancy, forecastDay: k.forecastDay };
}

/* ------------------------------------------------------------------ tenants */

export function tenantRelease(f: Facility, opts: { protectPct: number; maxRelease: number; visitorDemand: number; hours: number; tariff: number }) {
  const allocated = f.bays.filter((b) => b.category === 'tenant').length * f.floors;
  // expected tenant use during working hours (09–17): residential profile, peak-to-working ratio
  const work = [9, 10, 11, 12, 13, 14, 15, 16].map((h) => PROFILE[f.type][h] * 0.92);
  const expected = Math.ceil(allocated * Math.max(...work));
  const unused = Math.max(0, allocated - expected);
  const protectedBays = Math.ceil(allocated * (opts.protectPct / 100));
  const eligible = Math.max(0, unused - protectedBays);
  const release = Math.min(eligible, opts.maxRelease);
  const sold = Math.min(release, opts.visitorDemand);
  return { allocated, expected, unused, protectedBays, eligible, release, visitorDemand: opts.visitorDemand, sold, extraRevenueDay: sold * opts.tariff * opts.hours, extraRevenueMonth: sold * opts.tariff * opts.hours * 22 };
}

/* ------------------------------------------------------------------ events */

export const EVENT_TYPES = ['Concert', 'Exhibition', 'Conference', 'Sporting event', 'Festival', 'Corporate event'] as const;

export function eventPlan(o: { venue: string; attendance: number; vehPerAttendee: number; startH: number; durationH: number; vipBays: number; reservedBays: number; tariff: number }, ops: OpsState) {
  const vehicles = Math.round(o.attendance * o.vehPerAttendee);
  const venue = facilityById(o.venue) ?? FACILITIES[0];
  const dist = (f: Facility) => Math.hypot(f.site.x - venue.site.x, f.site.z - venue.site.z) * 10;
  // free capacity at the start time, nearest first (within 3 km)
  const at = { ...ops, hour: o.startH };
  const pool = [...FACILITIES].sort((a, b) => dist(a) - dist(b)).filter((f) => dist(f) <= 3000);
  let need = vehicles;
  const allocation: { id: string; name: string; vehicles: number; distanceM: number }[] = [];
  for (const f of pool) {
    const k = facilityKpis(f, at);
    const free = Math.max(0, k.available - (f.id === venue.id ? o.vipBays + o.reservedBays : 0));
    const take = Math.min(need, free);
    if (take > 0) allocation.push({ id: f.id, name: f.name, vehicles: take, distanceM: Math.round(dist(f)) });
    need -= take;
    if (need <= 0) break;
  }
  const placed = vehicles - Math.max(0, need);
  // arrivals: 70 % in the hour before the start, 30 % in the first half hour; departures within 45 min of the end
  return {
    vehicles,
    available: pool.reduce((a, f) => a + facilityKpis(f, at).available, 0),
    placed,
    shortage: Math.max(0, need),
    arrivalPeakPerH: Math.round(vehicles * 0.7),
    departurePeakPerH: Math.round(vehicles / 0.75),
    allocation,
    revenue: placed * o.tariff,
    overflowNeeded: need > 0,
  };
}

/* ------------------------------------------------------------------ maintenance */

export type MaintScope = 'bay' | 'row' | 'facility' | 'barrier' | 'anpr' | 'ev' | 'lighting' | 'payment';

export function maintenanceImpact(f: Facility, scope: MaintScope, opts: { row?: number; hours: number; startH: number }, ops: OpsState) {
  const fl = f.floors;
  const affected =
    scope === 'row' ? f.bays.filter((b) => b.row === (opts.row ?? 0)).length * fl
    : scope === 'facility' ? f.bays.length * fl
    : scope === 'barrier' ? Math.round(f.bays.length * fl * 0.5) // one of two lanes shut: half the entry throughput
    : scope === 'ev' ? f.bays.filter((b) => b.category === 'ev').length * fl
    : scope === 'lighting' ? Math.round(f.bays.length * fl * 0.25) // dark zone closed at night only
    : scope === 'payment' ? 0
    : scope === 'anpr' ? 0
    : 1;
  let risk = 0;
  for (let h = opts.startH; h < opts.startH + opts.hours; h += 0.5) risk += affected * demandShare(f, ops, h % 24) * f.tariffHour * (ops.tariffMul[f.id] ?? 1) * 0.5;
  if (scope === 'payment') risk = facilityKpis(f, ops).revenuePerH * opts.hours * 0.3; // manual collection loses ~30 % (assumption)
  const others = FACILITIES.filter((x) => x.id !== f.id).reduce((a, x) => a + facilityKpis(x, { ...ops, hour: opts.startH }).available, 0);
  // best window: the lowest-demand stretch of the same length
  let best = 0;
  let bestV = Infinity;
  for (let s = 0; s < 24; s++) {
    let v = 0;
    for (let h = s; h < s + opts.hours; h++) v += PROFILE[f.type][h % 24];
    if (v < bestV) [bestV, best] = [v, s];
  }
  return { affected, remaining: f.bays.length * fl - affected, revenueAtRisk: risk, alternative: others, recommendedStart: best, completion: (opts.startH + opts.hours) % 24, note: scope === 'anpr' ? 'Entry by ticket while the camera is down; no capacity lost.' : scope === 'payment' ? 'Manual payment at the exit; slower exits, ~30 % collection loss assumed.' : '' };
}

/* ------------------------------------------------------------------ development */

const DEMAND_KINDS: Record<string, number> = { office: 1 / 35, mall: 1 / 25, hotel: 1 / 60, residential: 1 / 90, house: 1 / 120, school: 1 / 150, mosque: 1 / 60 };

export function opportunities() {
  const cands = DISTRICTS.filter((d) => d.id !== 'lagoons').flatMap((d) => findSites(d.id, 'large', 3).slice(0, 2).map((s) => ({ s, district: d })));
  return cands
    .map(({ s, district }, i) => {
      const R = 30; // 300 m walking catchment
      let demand = 0;
      const near: string[] = [];
      for (const b of AD.buildings) {
        const k = DEMAND_KINDS[b.k];
        if (!k) continue;
        const dd = Math.hypot(b.c[0] - s.x, b.c[1] - s.z);
        if (dd > R) continue;
        const floors = Math.max(1, Math.round((b.h * 10) / 3.5));
        const m2 = b.b.reduce((a, [x0, z0, x1, z1]) => a + Math.abs(x1 - x0) * Math.abs(z1 - z0) * 100, 0) * floors;
        demand += m2 * k * (1 - dd / R / 2);
        if (near.length < 4 && !near.includes(b.n)) near.push(b.n);
      }
      for (const n of INFILL) if (Math.hypot(n.x - s.x, n.z - s.z) < R && n.kind !== 'park') demand += 25;
      const supply = FACILITIES.filter((f) => Math.hypot(f.site.x - s.x, f.site.z - s.z) < R * 2).reduce((a, f) => a + f.bays.length * f.floors * (1 - facilityKpis(f, { ...BASE_OPS, hour: 11 }).occupancy), 0);
      const gap = Math.max(0, demand * 0.85 - supply);
      const capacity = Math.round(s.w * s.d * 100 / 25 / 10) * 10; // ~25 m² per bay incl. aisles, surface
      const score = Math.round(Math.min(100, (gap / Math.max(40, capacity)) * 60 + (district.id === 'central' || district.id === 'rahmaniya' ? 15 : 5) + 20));
      const signals = [
        gap > capacity * 0.6 && 'High parking demand detected',
        supply < demand * 0.3 && 'Existing capacity approaching saturation',
        near.some((n) => /Residential|Apartment|villa|Townhouse/i.test(n)) && 'Residential development nearby',
        near.some((n) => /Office|Mall|office/.test(n)) && 'Commercial activity in the catchment',
      ].filter(Boolean) as string[];
      return { id: `opp-${i + 1}`, site: s, district: district.name, areaM2: Math.round(s.w * s.d * 100), demand: Math.round(demand), supply: Math.round(supply), gap: Math.round(gap), capacity, nearby: near, roadAccess: 'Within 25 m of a road (layout)', constraints: districtAt(s.x, s.z).id === 'rahmaniya' ? ['Residential area: night-time noise limits'] : [], score, signals };
    })
    .sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------------------ construction cost and ROI (AED) */

export interface CostInputs {
  bays: number;
  structure: 'surface' | 'multistorey';
  floors: number;
  siteM2: number;
  /** land purchase, AED/m² (0 for government land provided under concession) */
  landPerM2: number;
  landPrepPerM2: number;
  civilPerBaySurface: number;
  civilPerBayDeck: number;
  asphaltMarkingsPerBay: number;
  lightingPerBay: number;
  barriers: number;
  barrierUnit: number;
  anpr: number;
  anprUnit: number;
  sensorPerBay: number;
  paymentTerminals: number;
  paymentUnit: number;
  evChargers: number;
  evUnit: number;
  landscapingPerM2: number;
  security: number;
  contingencyPct: number;
  opexPerBayYear: number;
  staffYear: number;
  maintenancePctCapex: number;
}

export const COST_DEFAULTS: CostInputs = {
  bays: 200,
  structure: 'surface',
  floors: 1,
  siteM2: 5400,
  landPerM2: 1500,
  landPrepPerM2: 60,
  civilPerBaySurface: 9000,
  civilPerBayDeck: 55000,
  asphaltMarkingsPerBay: 2200,
  lightingPerBay: 1400,
  barriers: 2,
  barrierUnit: 45000,
  anpr: 4,
  anprUnit: 25000,
  sensorPerBay: 450,
  paymentTerminals: 3,
  paymentUnit: 35000,
  evChargers: 12,
  evUnit: 28000,
  landscapingPerM2: 120,
  security: 80000,
  contingencyPct: 10,
  opexPerBayYear: 650,
  staffYear: 240000,
  maintenancePctCapex: 2,
};

export function constructionCost(c: CostInputs) {
  const civil = c.bays * (c.structure === 'surface' ? c.civilPerBaySurface : c.civilPerBayDeck);
  const site = c.siteM2 * c.landPrepPerM2 + c.siteM2 * 0.1 * c.landscapingPerM2;
  const finishes = c.bays * (c.asphaltMarkingsPerBay + c.lightingPerBay);
  const tech = c.barriers * c.barrierUnit + c.anpr * c.anprUnit + c.bays * c.sensorPerBay + c.paymentTerminals * c.paymentUnit + c.evChargers * c.evUnit + c.security;
  const land = c.siteM2 * c.landPerM2;
  const sub = civil + site + finishes + tech;
  const contingency = (sub * c.contingencyPct) / 100;
  const capex = sub + contingency + land;
  const maintenance = ((capex - land) * c.maintenancePctCapex) / 100;
  const opex = c.bays * c.opexPerBayYear + c.staffYear + maintenance;
  return { land, civil, site, finishes, technology: tech, contingency, capex, perBay: capex / Math.max(1, c.bays), opexYear: opex, maintenanceYear: maintenance };
}

export interface RevenueInputs {
  occupancy: number;
  tariffHour: number;
  hoursOpen: number;
  avgStayH: number;
  evRevenuePerChargerDay: number;
  growthPct: number;
}
export const REV_DEFAULTS: RevenueInputs = { occupancy: 0.45, tariffHour: 4, hoursOpen: 14, avgStayH: 2.5, evRevenuePerChargerDay: 60, growthPct: 3 };

export function roi(c: CostInputs, r: RevenueInputs) {
  const cost = constructionCost(c);
  const occupiedBayHours = c.bays * r.occupancy * r.hoursOpen;
  const daily = occupiedBayHours * r.tariffHour + c.evChargers * r.evRevenuePerChargerDay;
  const vehiclesDay = occupiedBayHours / Math.max(0.5, r.avgStayH);
  const annual = daily * 365;
  const noi = annual - cost.opexYear;
  const years = Array.from({ length: 5 }, (_, i) => {
    const g = (1 + r.growthPct / 100) ** i;
    const rev = annual * g;
    const op = cost.opexYear * (1.02 ** i);
    return { year: i + 1, revenue: rev, opex: op, noi: rev - op };
  });
  let cum = -cost.capex;
  let payback: number | null = null;
  for (let y = 0; y < 30; y++) {
    const n = annual * (1 + r.growthPct / 100) ** y - cost.opexYear * 1.02 ** y;
    if (n <= 0) break;
    if (cum + n >= 0) {
      payback = y + -cum / n;
      break;
    }
    cum += n;
  }
  return { cost, vehiclesDay, daily, monthly: daily * 30.4, annual, noi, roiPct: (noi / cost.capex) * 100, payback, years };
}

export const SCENARIOS = {
  conservative: { occ: 0.75, tariff: 0.9, capex: 1.15 },
  base: { occ: 1, tariff: 1, capex: 1 },
  optimistic: { occ: 1.15, tariff: 1.05, capex: 0.95 },
} as const;

export function scenarioRoi(c: CostInputs, r: RevenueInputs, k: keyof typeof SCENARIOS) {
  const s = SCENARIOS[k];
  const cc = { ...c, civilPerBaySurface: c.civilPerBaySurface * s.capex, civilPerBayDeck: c.civilPerBayDeck * s.capex };
  return roi(cc, { ...r, occupancy: Math.min(0.98, r.occupancy * s.occ), tariffHour: r.tariffHour * s.tariff });
}

/* ------------------------------------------------------------------ approval workflow */

export const STATUSES = ['Opportunity identified', 'Under feasibility review', 'Proposal prepared', 'Submitted for approval', 'Approved', 'Rejected', 'Under construction', 'Operational'] as const;
export type ProposalStatus = (typeof STATUSES)[number];

/** simulated authority criteria (not a real government process) */
export function authorityDecision(p: { roiPct: number; payback: number | null; constraints: string[]; bays: number }) {
  const reasons: string[] = [];
  if (p.payback === null || p.payback > 12) reasons.push('Payback beyond 12 years');
  if (p.roiPct < 6) reasons.push('Annual ROI below 6 %');
  if (p.bays > 1200) reasons.push('Capacity above the area traffic-impact limit (1,200 bays)');
  if (p.constraints.some((c) => /prohibited/i.test(c))) reasons.push('Site constraint');
  return { approved: reasons.length === 0, reasons };
}

/** construction stages by progress 0–1 */
export const STAGES = [
  { at: 0, label: 'Site preparation' },
  { at: 0.25, label: 'Civil works and drainage' },
  { at: 0.5, label: 'Asphalt and markings' },
  { at: 0.75, label: 'Barriers, ANPR, sensors and signage' },
  { at: 1, label: 'Operational' },
] as const;
export const stageAt = (p: number) => [...STAGES].reverse().find((s) => p >= s.at)!.label;
