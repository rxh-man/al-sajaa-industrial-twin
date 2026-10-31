import { FACILITIES } from '../../sustainability/facilities';
import { nearestNode, roadGraph, shortestFrom } from '../graphs';
import { change, inputsKey, num, recommend, round } from '../engine';
import type { InputValues, KpiDef, OptionResult, ScenarioDef, ScenarioResult, XZ } from '../types';

/**
 * Freight round optimisation: a truck from the largest depot serves the busiest logistics and cold-storage sites.
 * Travel times and distances come from shortest paths on the road graph (a full matrix); visiting orders are
 * compared: as listed (baseline), nearest-neighbour, nearest-neighbour + 2-opt, and two trucks split by sector.
 */

const KG_PER_KM = 0.85; // heavy truck CO₂ (assumption, same fleet factor as the sustainability model)
const STOP_MIN = 20; // loading/unloading per stop (assumption)

export const KPIS: KpiDef[] = [
  { id: 'km', label: 'Distance per round', unit: 'km', better: 'lower', basis: 'Simulated', how: 'Σ road-graph shortest distances along the visiting order' },
  { id: 'hours', label: 'Round duration (longest truck)', unit: 'h', better: 'lower', basis: 'Simulated', how: 'driving at class speeds + 20 min per stop' },
  { id: 'co2Kg', label: 'CO₂ per round', unit: 'kg', better: 'lower', basis: 'Estimated', how: 'km × 0.85 kg/km' },
  { id: 'trucks', label: 'Trucks used', unit: 'trucks', better: 'lower', basis: 'Simulated', how: 'vehicles in the plan' },
];

export function runFreight(v: InputValues): ScenarioResult {
  const nStops = Math.round(num(v, 'stops', 3, 12));
  const rounds = num(v, 'roundsPerDay', 1, 20);
  const g = roadGraph();
  const depot = [...FACILITIES].filter((f) => f.category.id === 'depot').sort((a, b) => b.floorM2 - a.floorM2 || a.id - b.id)[0];
  const stops = [...FACILITIES].filter((f) => f.category.id === 'logistics' || f.category.id === 'cold').sort((a, b) => b.trucksDay - a.trucksDay || a.id - b.id).slice(0, nStops);
  const pts: XZ[] = [[depot.x, depot.z], ...stops.map((s) => [s.x, s.z] as XZ)];
  const nodes = pts.map((p) => nearestNode(g, p));
  const sp = nodes.map((n) => shortestFrom(g, n));
  const N = pts.length;
  const T = (i: number, j: number) => sp[i].dist[nodes[j]];
  const path = (i: number, j: number) => sp[i].pathTo(nodes[j]);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (!Number.isFinite(T(i, j))) throw new Error(`Stop ${j} is not reachable from stop ${i} on the road graph.`);
  const KM = (i: number, j: number) => path(i, j)!.km;
  const tour = (order: number[]) => [0, ...order, 0];
  const cost = (t: number[], f: (i: number, j: number) => number) => t.slice(1).reduce((a, j, k) => a + f(t[k], j), 0);
  const nn = (set: number[]) => {
    const left = new Set(set);
    const out: number[] = [];
    let cur = 0;
    while (left.size) {
      let best = -1;
      let bd = Infinity;
      for (const j of left) if (T(cur, j) < bd) [bd, best] = [T(cur, j), j];
      out.push(best);
      left.delete(best);
      cur = best;
    }
    return out;
  };
  const twoOpt = (order: number[]) => {
    let o = [...order];
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < o.length - 1; i++)
        for (let k = i + 1; k < o.length; k++) {
          const cand = [...o.slice(0, i), ...o.slice(i, k + 1).reverse(), ...o.slice(k + 1)];
          if (cost(tour(cand), T) < cost(tour(o), T) - 1e-9) {
            o = cand;
            improved = true;
          }
        }
    }
    return o;
  };
  const kp = (tours: number[][]) => {
    const km = tours.reduce((a, t) => a + cost(t, KM), 0);
    const hours = Math.max(...tours.map((t) => (cost(t, T) + (t.length - 2) * STOP_MIN) / 60));
    return { km: km * rounds, hours, co2Kg: km * KG_PER_KM * rounds, trucks: tours.length };
  };
  const all = stops.map((_, i) => i + 1);
  const listed = tour(all);
  const nnT = tour(nn(all));
  const optT = tour(twoOpt(nn(all)));
  // two trucks: split stops by bearing from the depot, each routed with NN + 2-opt
  const bearing = (i: number) => Math.atan2(pts[i][1] - pts[0][1], pts[i][0] - pts[0][0]);
  const byAngle = [...all].sort((a, b) => bearing(a) - bearing(b));
  const half = Math.ceil(byAngle.length / 2);
  const split = [tour(twoOpt(nn(byAngle.slice(0, half)))), tour(twoOpt(nn(byAngle.slice(half))))];

  const baseline: OptionResult = { id: 'baseline', name: 'Stops in list order', summary: `One truck visits the ${nStops} sites in the order they are listed.`, kpis: kp([listed]), actions: [], feasible: true };
  const options: OptionResult[] = [
    { id: 'nn', name: 'Nearest-neighbour order', summary: 'Always drive to the closest unvisited stop next.', kpis: kp([nnT]), actions: nnT.slice(1, -1).map((i) => `#${stops[i - 1].id}`), feasible: true },
    { id: 'opt', name: 'Nearest-neighbour + 2-opt', summary: 'Then remove crossings by reversing sub-routes while that shortens the round.', kpis: kp([optT]), actions: optT.slice(1, -1).map((i) => `#${stops[i - 1].id}`), feasible: true },
    { id: 'split', name: 'Two trucks by sector', summary: 'Split the stops by direction from the depot; each truck runs an optimised round.', kpis: kp(split), actions: split.flatMap((t) => t.slice(1, -1).map((i) => `#${stops[i - 1].id}`)), feasible: nStops >= 4, infeasibleWhy: nStops >= 4 ? undefined : 'Too few stops to split.' },
  ];
  const rec = recommend(baseline, options, KPIS, { co2Kg: 0.5, km: 0.2, hours: 0.2, trucks: 0.1 }, (o) => `Lowest weighted cost (CO₂ 50 %, distance 20 %, duration 20 %, trucks 10 %): ${round(o.kpis.km ?? 0, 1)} km/day vs ${round(baseline.kpis.km ?? 0, 1)} km in list order.`);
  const chosen = options.find((o) => o.id === rec.optionId)!;
  const chosenTours = rec.optionId === 'split' ? split : [rec.optionId === 'nn' ? nnT : optT];
  const c = change(baseline.kpis.co2Kg, chosen.kpis.co2Kg);
  return {
    scenarioId: 'freight',
    inputsKey: inputsKey(v),
    baseline,
    options,
    kpis: KPIS,
    recommendation: rec,
    findings: [
      `Depot: truck depot #${depot.id}; ${nStops} busiest logistics/cold-storage sites (by modelled truck movements).`,
      `Distance matrix from ${N} shortest-path searches on the road graph.`,
      c.pct === null ? '' : `The recommended plan changes CO₂ per day by ${round(c.pct, 0)} % (${round(baseline.kpis.co2Kg ?? 0, 0)} → ${round(chosen.kpis.co2Kg ?? 0, 0)} kg).`,
    ].filter(Boolean),
    affectedAssets: [`depot #${depot.id}`, ...stops.map((s) => `#${s.id}`)],
    tradeoffs: ['Two trucks finish sooner but add a driver and a vehicle; distance may rise.', 'Optimised orders ignore delivery time windows (not modelled).'],
    assumptions: [`${STOP_MIN} min per stop; ${KG_PER_KM} kg CO₂/km; ${rounds} round(s) per day; class speeds on the road graph, no congestion.`, 'Stops are the busiest modelled sites, not real customers.'],
    limitations: ['No vehicle capacity, time windows or driver hours.', 'Heuristic (nearest-neighbour + 2-opt), not a proven optimum.'],
    unavailable: [{ metric: 'Fuel cost and delivery revenue (AED)', needs: 'fleet fuel prices and contract data' }],
    confidence: { level: 'medium', why: 'Distances are computed on the road model; loads and timings are assumptions.' },
    highlight: {
      points: [{ x: depot.x, z: depot.z, role: 'facility', label: `Depot #${depot.id}` }, ...stops.map((s) => ({ x: s.x, z: s.z, role: 'action' as const, label: `#${s.id} ${s.category.label}` }))],
      paths: chosenTours.flatMap((t, ti) => t.slice(1).map((j, k) => ({ pts: path(t[k], j)!.points, role: (ti === 0 ? 'route' : 'alt') as 'route' | 'alt', label: `Truck ${ti + 1}` }))),
      focus: { x: depot.x, z: depot.z, r: 90 },
    },
  };
}

export const FREIGHT: ScenarioDef = {
  id: 'freight',
  title: 'Freight round optimisation',
  titleAr: 'تحسين جولات الشحن',
  icon: 'truck',
  problem: 'A depot truck serves the busiest warehouses every day. In what order, and with how many trucks?',
  why: 'Freight is a large share of district traffic and CO₂; a better visiting order cuts distance at no cost.',
  infrastructure: ['Truck depot', 'Logistics and cold-storage sites', 'Road network'],
  inputs: [
    { kind: 'range', id: 'stops', label: 'Sites to serve', min: 4, max: 10, step: 1, unit: 'sites' },
    { kind: 'range', id: 'roundsPerDay', label: 'Rounds per day', min: 1, max: 6, step: 1, unit: '' },
  ],
  defaults: { stops: 8, roundsPerDay: 2 },
  run: runFreight,
};
