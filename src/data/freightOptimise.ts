/**
 * Green freight optimisation: a genuine baseline-versus-optimised route comparison on the
 * existing road graph.
 *
 * Baseline route  : shortest path by raw distance (what a plain "go the short way" routing does).
 * Optimised route : shortest path by an EMISSIONS cost = distance x a per-road-class factor.
 *                   Minor and service roads carry a higher factor (more stops, idling and lower
 *                   speeds per km), so the optimiser prefers freight-grade roads even when they are
 *                   slightly longer in raw distance.
 *
 * Both routes are produced by a full Dijkstra search over the whole graph, so the optimiser really
 * evaluates alternatives. The CO2 of each resulting path is then scored under the SAME emissions
 * model, and savings are the difference. Because the optimised cost is proportional to the CO2
 * proxy, optimised CO2 is never higher than baseline CO2; when the baseline is already clean the
 * saving is zero. No route is fabricated: if the ends cannot be connected, the result is infeasible.
 *
 * Everything here is modelled, not measured. There is no GPS, live traffic or real vehicle data.
 */
import { FREIGHT_CLASSES, type RoadLike, type XZ } from './freightRoute';
import { ASSUMPTIONS } from './climateAgents';

/** Scene units are 10 m, so one unit is 0.01 km. */
export const UNIT_KM = 0.01;

/**
 * Relative emissions multiplier per road class. 1.0 is a free-flowing freight road; higher values
 * reflect more idling, stops and lower speeds per km on minor roads. Illustrative, not measured.
 */
export const ROAD_EMISSION_FACTOR: Record<string, number> = {
  motorway: 1.0,
  motorway_link: 1.02,
  trunk: 1.02,
  trunk_link: 1.05,
  primary: 1.06,
  primary_link: 1.1,
  secondary: 1.12,
  secondary_link: 1.16,
  tertiary: 1.22,
  tertiary_link: 1.26,
  unclassified: 1.32,
  residential: 1.42,
  service: 1.55,
};
export const DEFAULT_EMISSION_FACTOR = 1.3;
export const emissionFactor = (cls: string): number => ROAD_EMISSION_FACTOR[cls] ?? DEFAULT_EMISSION_FACTOR;

interface ClsEdge {
  to: number;
  len: number;
  cls: string;
}
export interface ClassGraph {
  nodes: XZ[];
  adj: ClsEdge[][];
}

const key = (x: number, z: number) => `${x.toFixed(2)},${z.toFixed(2)}`;

/** Build an undirected graph whose edges keep both geometric length and road class. */
export function buildClassGraph(roads: readonly RoadLike[], classes: ReadonlySet<string> = FREIGHT_CLASSES): ClassGraph {
  const index = new Map<string, number>();
  const nodes: XZ[] = [];
  const adj: ClsEdge[][] = [];
  const node = (p: XZ) => {
    const k = key(p[0], p[1]);
    let i = index.get(k);
    if (i === undefined) {
      i = nodes.length;
      index.set(k, i);
      nodes.push([p[0], p[1]]);
      adj.push([]);
    }
    return i;
  };
  for (const r of roads) {
    if (!classes.has(r.c)) continue;
    for (let i = 1; i < r.p.length; i++) {
      const a = node(r.p[i - 1]);
      const b = node(r.p[i]);
      if (a === b) continue;
      const len = Math.hypot(nodes[b][0] - nodes[a][0], nodes[b][1] - nodes[a][1]);
      adj[a].push({ to: b, len, cls: r.c });
      adj[b].push({ to: a, len, cls: r.c });
    }
  }
  return { nodes, adj };
}

class MinHeap {
  private d: number[] = [];
  private v: number[] = [];
  get size() {
    return this.d.length;
  }
  push(dist: number, node: number) {
    this.d.push(dist);
    this.v.push(node);
    let i = this.d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.d[p] <= this.d[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop() {
    const n = this.d.length;
    if (n === 0) return null;
    const dist = this.d[0];
    const node = this.v[0];
    const ld = this.d.pop()!;
    const lv = this.v.pop()!;
    if (n > 1) {
      this.d[0] = ld;
      this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < this.d.length && this.d[l] < this.d[s]) s = l;
        if (r < this.d.length && this.d[r] < this.d[s]) s = r;
        if (s === i) break;
        this.swap(i, s);
        i = s;
      }
    }
    return { dist, node };
  }
  private swap(a: number, b: number) {
    [this.d[a], this.d[b]] = [this.d[b], this.d[a]];
    [this.v[a], this.v[b]] = [this.v[b], this.v[a]];
  }
}

type Cost = (e: ClsEdge) => number;

interface DijkstraResult {
  dist: Float64Array;
  prev: Int32Array;
  prevEdge: (ClsEdge | null)[];
  settled: number;
}

function dijkstra(g: ClassGraph, from: number, cost: Cost): DijkstraResult {
  const dist = new Float64Array(g.nodes.length).fill(Infinity);
  const prev = new Int32Array(g.nodes.length).fill(-1);
  const prevEdge: (ClsEdge | null)[] = new Array(g.nodes.length).fill(null);
  dist[from] = 0;
  let settled = 0;
  const heap = new MinHeap();
  heap.push(0, from);
  const done = new Uint8Array(g.nodes.length);
  while (heap.size > 0) {
    const top = heap.pop()!;
    const v = top.node;
    if (top.dist > dist[v]) continue;
    if (done[v]) continue;
    done[v] = 1;
    settled++;
    for (const e of g.adj[v]) {
      const nd = dist[v] + cost(e);
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = v;
        prevEdge[e.to] = e;
        heap.push(nd, e.to);
      }
    }
  }
  return { dist, prev, prevEdge, settled };
}

export function nearestNodes(g: ClassGraph, p: XZ, k: number): number[] {
  return g.nodes
    .map((n, i) => ({ i, d: (n[0] - p[0]) ** 2 + (n[1] - p[1]) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.max(0, k))
    .map((x) => x.i);
}

export interface RouteResult {
  points: XZ[];
  lengthUnits: number;
  lengthKm: number;
  /** modelled CO2 for one one-way trip, kg */
  co2Kg: number;
  /** road classes used, longest share first */
  classes: string[];
}

export interface RouteComparison {
  feasible: boolean;
  baseline: RouteResult | null;
  optimised: RouteResult | null;
  savings: { distanceUnits: number; distancePct: number; co2Kg: number; co2Pct: number } | null;
  /** graph nodes the optimiser settled: evidence it searched real alternatives */
  evaluatedNodes: number;
  assumptions: string[];
  note: string;
}

/** Score a path's modelled CO2 (kg) under the emissions model, and collect its road classes. */
function scorePath(_nodes: XZ[], edges: ClsEdge[]): { lengthUnits: number; co2Kg: number; classes: string[] } {
  const kgPerKm = ASSUMPTIONS.kgCo2PerKm.v;
  let lengthUnits = 0;
  let co2Kg = 0;
  const byClass = new Map<string, number>();
  for (const e of edges) {
    lengthUnits += e.len;
    co2Kg += e.len * UNIT_KM * kgPerKm * emissionFactor(e.cls);
    byClass.set(e.cls, (byClass.get(e.cls) ?? 0) + e.len);
  }
  const classes = [...byClass.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  return { lengthUnits, co2Kg, classes };
}

/** Reconstruct the node path and the edges used, from a Dijkstra result. */
function reconstruct(g: ClassGraph, r: DijkstraResult, end: number): { nodes: XZ[]; edges: ClsEdge[] } {
  const idx: number[] = [];
  for (let v = end; v !== -1; v = r.prev[v]) idx.push(v);
  idx.reverse();
  const nodes = idx.map((i) => g.nodes[i]);
  const edges: ClsEdge[] = [];
  for (let i = end, c = 0; r.prev[i] !== -1 && c < idx.length; i = r.prev[i], c++) {
    const e = r.prevEdge[i];
    if (e) edges.push(e);
  }
  edges.reverse();
  return { nodes, edges };
}

/**
 * Compare a distance-minimising baseline route with an emissions-optimised route between two points.
 * Both ends are snapped to the nearest reachable road node (snap longer than `maxSnap` is refused).
 */
export function compareRoutes(g: ClassGraph, a: XZ, b: XZ, candidates = 12, maxSnap = 25): RouteComparison {
  const assumptions = [
    `Truck CO2: ${ASSUMPTIONS.kgCo2PerKm.v} kg/km (${ASSUMPTIONS.kgCo2PerKm.note}).`,
    'Per-road-class emission factors are illustrative multipliers for idling and stops, not measured.',
    `Ends are snapped to the road network within ${maxSnap} units (${maxSnap * 10} m); a longer gap is refused.`,
    'Shortest path on the modelled road graph. No GPS, live traffic or real vehicle data.',
  ];
  const starts = nearestNodes(g, a, candidates);
  const ends = nearestNodes(g, b, candidates);
  const gap = (i: number, p: XZ) => Math.hypot(g.nodes[i][0] - p[0], g.nodes[i][1] - p[1]);

  const distCost: Cost = (e) => e.len;
  const emitCost: Cost = (e) => e.len * emissionFactor(e.cls);

  let evaluatedNodes = 0;
  for (const s of starts) {
    if (gap(s, a) > maxSnap) break;
    const base = dijkstra(g, s, distCost);
    // pick the reachable end node closest to b
    let best = -1;
    for (const t of ends) {
      if (!Number.isFinite(base.dist[t]) || gap(t, b) > maxSnap) continue;
      if (best < 0 || gap(t, b) < gap(best, b)) best = t;
    }
    if (best < 0) continue;
    const opt = dijkstra(g, s, emitCost);
    evaluatedNodes = opt.settled;

    const bp = reconstruct(g, base, best);
    const op = reconstruct(g, opt, best);
    const withEnds = (nodes: XZ[]): XZ[] => {
      const pts: XZ[] = [];
      const push = (p: XZ) => {
        const last = pts[pts.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
      };
      push([a[0], a[1]]);
      nodes.forEach(push);
      push([b[0], b[1]]);
      return pts;
    };
    const bs = scorePath(bp.nodes, bp.edges);
    const os = scorePath(op.nodes, op.edges);
    const baseline: RouteResult = { points: withEnds(bp.nodes), lengthUnits: bs.lengthUnits, lengthKm: bs.lengthUnits * UNIT_KM, co2Kg: bs.co2Kg, classes: bs.classes };
    const optimised: RouteResult = { points: withEnds(op.nodes), lengthUnits: os.lengthUnits, lengthKm: os.lengthUnits * UNIT_KM, co2Kg: os.co2Kg, classes: os.classes };
    const co2Saved = baseline.co2Kg - optimised.co2Kg;
    const savings = {
      distanceUnits: baseline.lengthUnits - optimised.lengthUnits,
      distancePct: baseline.lengthUnits > 0 ? ((baseline.lengthUnits - optimised.lengthUnits) / baseline.lengthUnits) * 100 : 0,
      co2Kg: co2Saved,
      co2Pct: baseline.co2Kg > 0 ? (co2Saved / baseline.co2Kg) * 100 : 0,
    };
    const note =
      co2Saved > 1e-9
        ? 'The optimised route lowers modelled emissions by favouring freight-grade roads over minor-road idling.'
        : 'The baseline route is already on the cleanest roads the model has, so there is no emissions saving.';
    return { feasible: true, baseline, optimised, savings, evaluatedNodes, assumptions, note };
  }
  return { feasible: false, baseline: null, optimised: null, savings: null, evaluatedNodes, assumptions, note: 'No route found: the ends cannot be connected on the road network within the snap limit.' };
}
