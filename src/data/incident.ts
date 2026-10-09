import { STREET_Z, BUILDINGS } from './city';
import { LAYERS, INCIDENT_SEGMENT, WATER_NETWORK } from './networks';
import { AD, place } from './abudhabi';

/**
 * Scenario constants for "Sector B-12 Water Network Anomaly".
 * Prototype data — every figure here is a demo simulation, not a measurement.
 */

const WATER_Z = STREET_Z[2] + LAYERS.water.offset; // -2.4

export const LEAK = { x: 1.5, y: LAYERS.water.depth, z: WATER_Z } as const;
export const LEAK_SURFACE = { x: LEAK.x, z: LEAK.z } as const;

/** Excavation trench under Khalifa Street, beside the World Trade Center block. */
export const TRENCH = { minX: -11.5, maxX: 11.5, minZ: -4.5, maxZ: 4.5, floor: -12.2 } as const;

const IMPACT_RADIUS = 54;
const IMPACT_FUTURE_RADIUS = 79;
const POPULATION = 12400;

/**
 * Calibrate the procedural occupancy so that the residents living inside the
 * impact radius add up to the scenario's headline figure — tooltips, sector
 * labels and the recommendation then all tell the same story.
 */
const residentsWithin = (r: number) =>
  BUILDINGS.filter((b) => b.kind !== 'office' && Math.hypot(b.x - LEAK.x, b.z - LEAK.z) <= r).reduce((a, b) => a + b.occupants, 0);
(() => {
  const k = POPULATION / Math.max(1, residentsWithin(IMPACT_RADIUS));
  for (const b of BUILDINGS) b.occupants = Math.round(b.occupants * k);
})();
const FUTURE_POPULATION = Math.round(residentsWithin(IMPACT_FUTURE_RADIUS) / 100) * 100;

export const INCIDENT = {
  scenarioName: 'Sector B-12 Water Network Anomaly',
  sector: 'B-12',
  asset: INCIDENT_SEGMENT.id,
  road: 'Khalifa Street',
  roadShort: 'Khalifa St',
  confidence: 93,
  failureWindow: [36, 52] as [number, number],
  horizonHours: 72,
  population: POPULATION,
  futurePopulation: FUTURE_POPULATION,
  respondWithinHours: 6,
  riskBefore: 87,
  riskFuture: 98,
  riskAfter: 21,
  pressureBaselineBar: 3.926,
} as const;

/** UAE dirhams (AED, pegged at 3.6725 per US dollar). */
export const COSTS = {
  preventive: 660_000,
  preventiveRange: [440_000, 920_000] as [number, number],
  failure: 6_600_000,
  avoided: 5_940_000,
} as const;

export const IMPACT = {
  center: LEAK_SURFACE,
  radius: IMPACT_RADIUS,
  futureRadius: IMPACT_FUTURE_RADIUS,
} as const;

/* Real places from the map; their part in the incident is made up. */
const HOSPITAL = place('hospital');
const SCHOOL = place('school');
const DEPOT = place('depot');

/** Junctions on the main connected street network (cut-off stubs at the map edge left out). */
const MAIN_STREET_NODES = (() => {
  const adj = new Map<string, string[]>();
  for (const r of AD.roads) {
    if (r.c === 'pedestrian') continue;
    for (let i = 1; i < r.k.length; i++) {
      adj.set(r.k[i - 1], [...(adj.get(r.k[i - 1]) ?? []), r.k[i]]);
      adj.set(r.k[i], [...(adj.get(r.k[i]) ?? []), r.k[i - 1]]);
    }
  }
  let best = new Set<string>();
  const seen = new Set<string>();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp = new Set([start]);
    const stack = [start];
    seen.add(start);
    while (stack.length) for (const n of adj.get(stack.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), comp.add(n), stack.push(n));
    if (comp.size > best.size) best = comp;
  }
  return best;
})();

/** The depot's gate: the connected street point nearest the utility compound, where the crew joins traffic. */
const DEPOT_GATE = (() => {
  const x = DEPOT?.x ?? 60;
  const z = DEPOT?.z ?? -40;
  let best: [number, number] = [x, z];
  let bd = Infinity;
  for (const r of AD.roads) {
    if (r.c === 'pedestrian') continue;
    r.p.forEach((p, i) => {
      if (!MAIN_STREET_NODES.has(r.k[i])) return;
      const d = Math.hypot(p[0] - x, p[1] - z);
      if (d < bd) [bd, best] = [d, p];
    });
  }
  return best;
})();

export const POI = {
  hospital: { name: HOSPITAL?.n ?? 'Hospital', distanceM: Math.round((HOSPITAL?.m ?? 320) / 10) * 10, x: HOSPITAL?.x ?? 0, z: HOSPITAL?.z ?? -30, y: HOSPITAL?.h ?? 2 },
  school: { name: SCHOOL?.n ?? 'School', distanceM: Math.round((SCHOOL?.m ?? 480) / 10) * 10, x: SCHOOL?.x ?? -20, z: SCHOOL?.z ?? -50, y: SCHOOL?.h ?? 1.2 },
  depot: { name: 'Utility depot', x: DEPOT_GATE[0], z: DEPOT_GATE[1], y: 0.6 },
} as const;

export interface ValveDef {
  id: string;
  x: number;
  z: number;
  isolation: boolean;
}

/** Snap a valve onto the nearest junction of the real water network. */
function onWaterMain(x: number, z: number): [number, number] {
  let best: [number, number] = [x, z];
  let bd = Infinity;
  for (const n of WATER_NETWORK.nodes) {
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bd) {
      bd = d;
      best = [n.x, n.z];
    }
  }
  return best;
}

export const VALVES: ValveDef[] = [
  { id: 'V-B12-02', x: -9.5, z: WATER_Z, isolation: true },
  { id: 'V-B12-03', x: 9.0, z: WATER_Z, isolation: true },
  ...(
    [
      ['V-A12-01', -2, STREET_Z[1] + LAYERS.water.offset],
      ['V-B13-05', 30, WATER_Z],
      ['V-C11-02', -16.4, 14],
      ['V-D12-01', 0, STREET_Z[3] + LAYERS.water.offset],
      ['V-B10-03', -44.4, -16],
    ] as const
  ).map(([id, x, z]) => {
    const [sx, sz] = onWaterMain(x, z);
    return { id, x: sx, z: sz, isolation: false };
  }),
];

export interface RepairStep {
  id: number;
  title: string;
  detail: string;
}

export const REPAIR_STEPS: RepairStep[] = [
  { id: 1, title: 'Isolate upstream valve', detail: 'Close V-B12-02 and V-B12-03' },
  { id: 2, title: 'Reroute water flow', detail: 'Supply B-12 via the A|B loop' },
  { id: 3, title: 'Dispatch repair crew', detail: 'Crew 07 from the utility depot' },
  { id: 4, title: 'Replace damaged pipe section', detail: `${INCIDENT_SEGMENT.id} · 3.2 m ductile iron` },
  { id: 5, title: 'Pressure test and restore', detail: 'Reopen valves · verify 3.92 bar' },
];

/** Does a street segment pass through the dig site (with a small margin)? */
function crossesDigSite(a: [number, number], b: [number, number], pad = 0.8) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  for (const [p, q] of [
    [-dx, a[0] - (TRENCH.minX - pad)],
    [dx, TRENCH.maxX + pad - a[0]],
    [-dz, a[1] - (TRENCH.minZ - pad)],
    [dz, TRENCH.maxZ + pad - a[1]],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * Shortest drive along the real streets to a junction, always on roads. Driving against a
 * one-way street costs 6× so the route only does it where nothing legal connects (the
 * cut-off street ends at the edge of the map).
 */
function streetRoute(from: [number, number], goal: string): [number, number][] {
  const pos = new Map<string, [number, number]>();
  const back = new Map<string, { to: string; w: number }[]>();
  const link = (a: string, b: string, w: number) => back.set(b, [...(back.get(b) ?? []), { to: a, w }]);
  for (const r of AD.roads) {
    if (r.c === 'pedestrian') continue;
    r.k.forEach((id, i) => pos.set(id, r.p[i]));
    for (let i = 1; i < r.k.length; i++) {
      if (crossesDigSite(r.p[i - 1], r.p[i])) continue; // the street is closed at the dig site
      const w = Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
      link(r.k[i - 1], r.k[i], w);
      link(r.k[i], r.k[i - 1], r.o ? w * 6 : w);
    }
  }
  const dist = new Map<string, number>([[goal, 0]]);
  const next = new Map<string, string>();
  const open = new Set([goal]);
  while (open.size) {
    let cur = '';
    let cd = Infinity;
    for (const k of open) if (dist.get(k)! < cd) [cd, cur] = [dist.get(k)!, k];
    open.delete(cur);
    for (const e of back.get(cur) ?? []) {
      if (cd + e.w < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, cd + e.w);
        next.set(e.to, cur);
        open.add(e.to);
      }
    }
  }
  let start = '';
  let best = Infinity;
  for (const k of dist.keys()) {
    const p = pos.get(k)!;
    const d = Math.hypot(p[0] - from[0], p[1] - from[1]);
    if (d < best) [best, start] = [d, k];
  }
  const path: [number, number][] = [from];
  for (let k: string | undefined = start; k; k = next.get(k)) path.push(pos.get(k)!);
  return path;
}

/**
 * The crew arrives along Khalifa Street's z≈0 carriageway in its direction of travel and
 * stops just before the dig site, so it never drives through the open trench.
 */
function crewRoute(): [number, number][] {
  const lane = AD.roads.filter((r) => /^Khalifa/.test(r.n) && r.p.some(([x, z]) => Math.abs(z) < 0.4 && Math.abs(x) < 20));
  const pts = lane.flatMap((r) => r.p.map((p, i) => ({ p, id: r.k[i], r })));
  const seg = lane.flatMap((r) => r.p.slice(1).map((q, i) => [r.p[i], q] as const)).find(([a, b]) => Math.min(a[0], b[0]) < 0 && Math.max(a[0], b[0]) > 0);
  const westbound = seg ? seg[1][0] < seg[0][0] : true;
  const stopX = westbound ? TRENCH.maxX + 2 : TRENCH.minX - 2;
  // last junction before the stop point, on the approach side
  const before = pts.filter(({ p }) => (westbound ? p[0] > stopX : p[0] < stopX) && Math.abs(p[1]) < 0.6).sort((a, b) => Math.abs(a.p[0] - stopX) - Math.abs(b.p[0] - stopX))[0];
  if (!before) return [[POI.depot.x, POI.depot.z], [stopX, 0]];
  const path = streetRoute([POI.depot.x, POI.depot.z], before.id);
  return [...path, [stopX, before.p[1]]];
}

/** Crew route from the utility depot to the kerb beside the work zone, along real streets (xz). */
export const CREW_ROUTE: [number, number][] = crewRoute();
if (import.meta.env.DEV) {
  const km = CREW_ROUTE.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - CREW_ROUTE[i][0], p[1] - CREW_ROUTE[i][1]), 0) / 100;
  console.info(`[twin] crew route: ${CREW_ROUTE.length} points, ${km.toFixed(2)} km`);
}

export const EXPLAIN_FEATURES = [
  { label: 'Pressure deviation', level: 'HIGH', weight: 0.86 },
  { label: 'Moisture correlation', level: 'HIGH', weight: 0.81 },
  { label: 'Flow imbalance', level: 'MEDIUM', weight: 0.52 },
  { label: 'Temperature variance', level: 'LOW', weight: 0.24 },
] as const;

/** "AED 660K", "AED 5.94M". */
export function formatMoney(v: number) {
  if (v >= 1_000_000) return `AED ${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (v >= 1000) return `AED ${Math.round(v / 1000)}K`;
  return `AED ${v}`;
}
