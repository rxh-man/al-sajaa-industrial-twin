import { AD } from '../../data/abudhabi';
import { nearestNode, roadGraph, route, routeEdges, timeCost, type RoadEdge, type Route } from '../graphs';
import { change, delta, inputsKey, num, pick, recommend, round } from '../engine';
import type { InputValues, KpiDef, OptionResult, ScenarioDef, ScenarioResult, XZ } from '../types';

/**
 * Traffic bottleneck on a named corridor of the twin's road network. The corridor is routed end to end on the
 * road graph; the alternative is the best route with the corridor's own edges closed. Delay follows the standard
 * BPR volume-delay curve t = t0 · (1 + 0.15 (v/c)^4). Demand and capacities are inputs/assumptions, not counts.
 */

/** corridors offered: a named road, optionally limited to a stretch (z window, scene units) */
const CORRIDOR_DEFS: Record<string, { road: string; z?: [number, number] }> = {
  'Al Sajaa Road 1': { road: 'Al Sajaa Road 1' },
  'Al Sajaa Road 4': { road: 'Al Sajaa Road 4' },
  'Al Sajaa Road 10': { road: 'Al Sajaa Road 10' },
};
export const CORRIDORS = Object.keys(CORRIDOR_DEFS);

/** assumed lanes per direction and saturation capacity per lane (veh/h) by class: illustrative planning values */
const LANES: Record<string, number> = { motorway: 4, trunk: 3, primary: 2, secondary: 2, tertiary: 1, unclassified: 1, residential: 1, service: 1, living_street: 1 };
const LANE_CAP: Record<string, number> = { motorway: 1900, trunk: 1800, primary: 1500, secondary: 1100, tertiary: 900, unclassified: 700, residential: 600, service: 500, living_street: 300 };
const bpr = (t0: number, v: number, c: number) => t0 * (1 + 0.15 * (v / Math.max(1, c)) ** 4);

export const KPIS: KpiDef[] = [
  { id: 'avgMin', label: 'Average trip time on the corridor', unit: 'min', better: 'lower', basis: 'Simulated', how: 'demand-weighted BPR travel time over the corridor and the diversion route' },
  { id: 'vehHours', label: 'Vehicle-hours in the peak hour', unit: 'veh-h', better: 'lower', basis: 'Simulated', how: 'Σ flow × BPR travel time, corridor + diverted traffic' },
  { id: 'vcMax', label: 'Peak volume / capacity', unit: 'v/c', better: 'lower', basis: 'Simulated', how: 'highest flow ÷ capacity on either path' },
  { id: 'vehKm', label: 'Vehicle-km travelled', unit: 'veh-km', better: 'lower', basis: 'Simulated', how: 'flow × route length (diversion adds distance)' },
];

/** the corridor's two farthest-apart points, routed on the graph (either direction for one-way carriageways) */
function corridorRoute(name: string, z?: [number, number]) {
  const g = roadGraph();
  const pts = AD.roads.filter((r) => r.n === name).flatMap((r) => r.p as XZ[]).filter((p) => !z || (p[1] >= z[0] && p[1] <= z[1]));
  if (!pts.length) throw new Error(`Road "${name}" is not in the model.`);
  let best: [XZ, XZ] = [pts[0], pts[0]];
  let bd = -1;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
      if (d > bd) [bd, best] = [d, [pts[i], pts[j]]];
    }
  const a = nearestNode(g, best[0]);
  const b = nearestNode(g, best[1]);
  // prefer the named road: other roads cost a little more so the route follows the corridor
  const follow = (e: RoadEdge) => timeCost(e) * (e.road === name ? 1 : 1.5);
  const r = route(g, a, b, follow) ?? route(g, b, a, follow);
  if (!r) throw new Error(`No route along "${name}".`);
  return { g, r };
}

function pathStats(edges: RoadEdge[]) {
  const t0 = edges.reduce((a, e) => a + timeCost(e), 0);
  // the path's capacity is that of its weakest link
  const cap = Math.min(...edges.map((e) => (AD.roads[e.ri].l ?? LANES[e.cls] ?? 1) * (LANE_CAP[e.cls] ?? 600)));
  const lanes = Math.min(...edges.map((e) => AD.roads[e.ri].l ?? LANES[e.cls] ?? 1));
  const km = edges.reduce((a, e) => a + e.len, 0) / 100;
  return { t0, cap, lanes, km };
}

export function runTraffic(v: InputValues): ScenarioResult {
  const label = pick(v, 'corridor', CORRIDORS);
  const name = CORRIDOR_DEFS[label].road;
  const demand = num(v, 'demand', 100, 8000);
  const lanesClosed = num(v, 'lanesClosed', 0, 3);
  const signalGain = num(v, 'signalGain', 0, 30) / 100;
  const altLoad = num(v, 'altLoad', 0, 95) / 100;
  const share = num(v, 'diversion', 0, 80) / 100;

  const { g, r } = corridorRoute(name, CORRIDOR_DEFS[label].z);
  const cEdges = routeEdges(g, r);
  const C = pathStats(cEdges);
  const open = Math.max(0, C.lanes - lanesClosed);
  if (open === 0) throw new Error(`All ${C.lanes} lane(s) closed on the weakest link of ${name}: the corridor is blocked; increase open lanes.`);
  const capCorr = (C.cap / C.lanes) * open;

  // the alternative: between the first and last junctions on the corridor (where another road joins), with the
  // corridor's own edges closed
  const isJunction = (n: number) => g.adj[n].some((e) => e.road !== name) || g.nodes.some((_, m) => g.adj[m].some((e) => e.to === n && e.road !== name));
  const junctions = r.nodes.filter(isJunction);
  const alt: Route | null =
    junctions.length >= 2 ? route(g, junctions[0], junctions[junctions.length - 1], (e) => (e.road === name ? Infinity : timeCost(e))) : null;
  const aEdges = alt ? routeEdges(g, alt) : [];
  const A = alt ? pathStats(aEdges) : null;
  const altSpare = A ? A.cap * (1 - altLoad) : 0;
  const altBackground = A ? A.cap * altLoad : 0;

  const evaluate = (capC: number, s: number) => {
    const qC = demand * (1 - s);
    const qA = demand * s;
    const tC = bpr(C.t0, qC, capC);
    const tA = A ? bpr(A.t0, altBackground + qA, A.cap) : Infinity;
    const vehHours = (qC * tC + (qA > 0 ? qA * tA : 0)) / 60;
    // background traffic on the alternative is slowed too; count its extra delay against the diversion
    const bgDelay = A && qA > 0 ? (altBackground * (tA - bpr(A.t0, altBackground, A.cap))) / 60 : 0;
    return {
      avgMin: (qC * tC + (qA > 0 ? qA * tA : 0)) / demand,
      vehHours: vehHours + bgDelay,
      vcMax: Math.max(qC / capC, A && qA > 0 ? (altBackground + qA) / A.cap : 0),
      vehKm: qC * C.km + qA * (A?.km ?? 0),
    };
  };

  const baseline: OptionResult = {
    id: 'baseline',
    name: 'Fixed signal plan, no diversion',
    summary: `${round(demand, 0)} veh/h on ${name} with ${open} of ${C.lanes} lane(s) open.`,
    kpis: evaluate(capCorr, 0),
    actions: [],
    feasible: true,
  };
  const retime: OptionResult = {
    id: 'retime',
    name: 'Adaptive signal retiming',
    summary: `Junction green time rebalanced to the corridor: +${round(signalGain * 100, 0)} % effective capacity (assumption).`,
    kpis: evaluate(capCorr * (1 + signalGain), 0),
    actions: [name],
    feasible: signalGain > 0,
    infeasibleWhy: signalGain > 0 ? undefined : 'Signal capacity gain is set to 0 %.',
  };
  const divert: OptionResult = {
    id: 'divert',
    name: `Divert ${round(share * 100, 0)} % via message signs`,
    summary: A ? `Diversion over ${alt!.roads.slice(0, 3).join(' → ')} (${round(A.km, 2)} km vs ${round(C.km, 2)} km).` : 'No alternative route exists with the corridor closed.',
    kpis: A ? evaluate(capCorr, share) : { avgMin: null, vehHours: null, vcMax: null, vehKm: null },
    actions: alt ? alt.roads : [],
    feasible: !!A && share > 0 && demand * share <= altSpare,
    infeasibleWhy: !A ? 'No alternative route.' : share === 0 ? 'Diversion share is set to 0 %.' : demand * share > altSpare ? `The alternative has spare capacity for ${round(altSpare, 0)} veh/h only.` : undefined,
  };
  // search the diversion share that minimises total vehicle-hours with retiming in place (5 % steps)
  let bestS = 0;
  let bestVh = Infinity;
  if (A)
    for (let s = 0; s <= 0.8 + 1e-9; s += 0.05) {
      if (demand * s > altSpare) break;
      const vh = evaluate(capCorr * (1 + signalGain), s).vehHours;
      if (vh < bestVh - 1e-9) [bestVh, bestS] = [vh, s];
    }
  const combined: OptionResult = {
    id: 'combined',
    name: `Retiming + optimised diversion (${round(bestS * 100, 0)} %)`,
    summary: `The diversion share is searched in 5 % steps for the lowest total vehicle-hours, including delay added to traffic already on the alternative.`,
    kpis: evaluate(capCorr * (1 + signalGain), bestS),
    actions: [name, ...(bestS > 0 && alt ? alt.roads : [])],
    feasible: signalGain > 0 || bestS > 0,
    infeasibleWhy: signalGain > 0 || bestS > 0 ? undefined : 'Neither retiming nor diversion helps under these inputs.',
  };
  const options = [retime, divert, combined];
  const weights = { vehHours: 0.6, avgMin: 0.3, vehKm: 0.1 };
  const rec = recommend(baseline, options, KPIS, weights, (best) => {
    const k = (id: string) => KPIS.find((q) => q.id === id)!;
    return `Highest weighted score (vehicle-hours 60 %, trip time 30 %, vehicle-km 10 %). ${delta(k('vehHours'), baseline.kpis.vehHours, best.kpis.vehHours, 0)}; ${delta(k('avgMin'), baseline.kpis.avgMin, best.kpis.avgMin)}.`;
  });

  const vc = baseline.kpis.vcMax!;
  const chosen = options.find((o) => o.id === rec.optionId);
  const ch = change(baseline.kpis.vehHours, chosen?.kpis.vehHours ?? null);
  const mid = r.points[Math.floor(r.points.length / 2)];
  return {
    scenarioId: 'traffic',
    inputsKey: inputsKey(v),
    baseline,
    options,
    kpis: KPIS,
    recommendation: rec,
    findings: [
      `${name}: ${round(C.km, 2)} km routed on the road graph, free-flow ${round(C.t0, 1)} min; weakest link ${C.lanes} lane(s), ${round(capCorr, 0)} veh/h capacity with ${open} open.`,
      `Baseline volume/capacity ${round(vc, 2)}${vc > 1 ? ' — over capacity, queues grow through the hour' : vc > 0.85 ? ' — near capacity' : ''}.${vc > 1.5 ? ' Above v/c 1.5 the BPR curve overstates delay; treat times as indicative only.' : ''}`,
      A ? `Alternative route ${round(A.km, 2)} km, free-flow ${round(A.t0, 1)} min, ${round(altSpare, 0)} veh/h spare at ${round(altLoad * 100, 0)} % background load.` : 'No alternative route exists with the corridor closed.',
      ch.pct === null ? '' : `The recommended option changes vehicle-hours by ${round(ch.pct, 0)} %.`,
    ].filter(Boolean),
    affectedAssets: [name, ...(alt ? alt.roads.filter((q) => q !== name).slice(0, 5) : [])],
    tradeoffs: [
      'Diversion relieves the corridor but adds distance and delays traffic already on the alternative route (counted in vehicle-hours).',
      'Signal retiming in favour of the corridor lengthens red time for the side streets (side-street delay is not modelled).',
    ],
    assumptions: [
      `Demand ${round(demand, 0)} veh/h in the peak direction (input; no traffic counts are connected).`,
      `Lanes and saturation capacities by road class (e.g. trunk 3 lanes × 1,800 veh/h, secondary 2 × 1,100); the corridor's capacity is its weakest link.`,
      'BPR curve with α = 0.15, β = 4; free-flow speeds by class (trunk 80 km/h, secondary 50 km/h).',
      `Signal retiming gain ${round(signalGain * 100, 0)} % (input; typical published ranges are 5–20 %).`,
      'Drivers follow message signs at the chosen share; no route-choice behaviour model.',
    ],
    limitations: [
      'Static one-hour assignment on two paths; no queue spill-back, junction turning delays or network-wide re-routing.',
      'The animated vehicles in the 3D view are visual and are not driven by this model.',
    ],
    unavailable: [
      { metric: 'Measured travel times and counts', needs: 'loop detectors, cameras or probe-vehicle data' },
      { metric: 'Emissions from congestion', needs: 'a speed-dependent emission model and fleet mix' },
    ],
    confidence: { level: 'low', why: 'Routes and distances are computed from the model; demand, capacity and the retiming gain are assumptions.' },
    highlight: {
      points: [{ x: mid[0], z: mid[1], role: 'problem', label: `${name} · v/c ${round(vc, 2)}` }],
      paths: [{ pts: r.points, role: 'problem', label: name }, ...(alt ? [{ pts: alt.points, role: 'alt' as const, label: 'Diversion route' }] : [])],
      focus: { x: mid[0], z: mid[1], r: Math.max(20, C.km * 30) },
    },
  };
}

export const TRAFFIC: ScenarioDef = {
  id: 'traffic',
  title: 'Traffic bottleneck',
  titleAr: 'اختناق مروري',
  icon: 'car',
  problem: 'A corridor is over capacity in the peak hour (e.g. a lane closed by works). Retime signals, divert traffic, or both?',
  why: 'Congestion costs drivers and freight time, raises idling emissions and delays emergency vehicles; diverting badly just moves the queue.',
  infrastructure: ['Named road corridor', 'Junction signals', 'Variable message signs', 'Alternative route on the road graph'],
  inputs: [
    { kind: 'select', id: 'corridor', label: 'Corridor', options: CORRIDORS.map((c) => ({ value: c, label: c })) },
    { kind: 'range', id: 'demand', label: 'Peak demand', min: 500, max: 7000, step: 100, unit: 'veh/h' },
    { kind: 'range', id: 'lanesClosed', label: 'Lanes closed (works / incident)', min: 0, max: 2, step: 1, unit: 'lanes' },
    { kind: 'range', id: 'signalGain', label: 'Capacity gain from retiming', min: 0, max: 20, step: 1, unit: '%' },
    { kind: 'range', id: 'diversion', label: 'Diversion share (sign-only option)', min: 0, max: 60, step: 5, unit: '%' },
    { kind: 'range', id: 'altLoad', label: 'Background load on the alternative', min: 0, max: 90, step: 5, unit: '%' },
  ],
  defaults: { corridor: 'Al Sajaa Road 1', demand: 4200, lanesClosed: 1, signalGain: 10, diversion: 20, altLoad: 40 },
  run: runTraffic,
};
