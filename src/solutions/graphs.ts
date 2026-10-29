import { AD, type AdRoad } from '../data/abudhabi';
import type { Network, PipeSegment } from '../data/networks';
import type { XZ } from './types';

/**
 * Graph helpers over the existing city data (no new geometry):
 *  - the road graph: every drivable road polyline (rail and footpaths excluded), nodes at shared coordinates,
 *    edges carrying the road's name, class and length, so routes can be timed by class and closures applied;
 *  - utility network reachability: which segments stay connected to the network's source when some are isolated.
 * Scene units: 1 = 10 m.
 */

export const DRIVE_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street']);

/** Assumed free-flow speeds by road class, km/h (illustrative, not measured; no live traffic). */
export const SPEED_KMH: Record<string, number> = {
  motorway: 100,
  trunk: 80,
  primary: 60,
  secondary: 50,
  tertiary: 40,
  unclassified: 35,
  residential: 30,
  living_street: 15,
  service: 20,
};

export interface RoadEdge {
  to: number;
  len: number;
  cls: string;
  road: string;
  /** the road record's index in AD.roads */
  ri: number;
}
export interface RoadGraph {
  nodes: XZ[];
  adj: RoadEdge[][];
}

let cached: RoadGraph | null = null;

export function roadGraph(roads: readonly AdRoad[] = AD.roads): RoadGraph {
  if (cached && roads === AD.roads) return cached;
  const index = new Map<string, number>();
  const nodes: XZ[] = [];
  const adj: RoadEdge[][] = [];
  const node = (p: XZ) => {
    const k = `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
    let i = index.get(k);
    if (i === undefined) {
      i = nodes.length;
      index.set(k, i);
      nodes.push([p[0], p[1]]);
      adj.push([]);
    }
    return i;
  };
  roads.forEach((r, ri) => {
    if (!DRIVE_CLASSES.has(r.c)) return;
    const oneWay = r.x === 1 || /Roundabout/.test(r.n);
    for (let i = 1; i < r.p.length; i++) {
      const a = node(r.p[i - 1] as XZ);
      const b = node(r.p[i] as XZ);
      if (a === b) continue;
      const len = Math.hypot(nodes[b][0] - nodes[a][0], nodes[b][1] - nodes[a][1]);
      adj[a].push({ to: b, len, cls: r.c, road: r.n, ri });
      if (!oneWay) adj[b].push({ to: a, len, cls: r.c, road: r.n, ri });
    }
  });
  const g = { nodes, adj };
  if (roads === AD.roads) cached = g;
  return g;
}

export function nearestNode(g: RoadGraph, p: XZ, connectedOnly = true): number {
  let best = -1;
  let bd = Infinity;
  g.nodes.forEach((n, i) => {
    if (connectedOnly && g.adj[i].length === 0) return;
    const d = (n[0] - p[0]) ** 2 + (n[1] - p[1]) ** 2;
    if (d < bd) [bd, best] = [d, i];
  });
  return best;
}

export type EdgeCost = (e: RoadEdge, from: number) => number;
/** travel time in minutes for an edge at its class speed (optionally slowed by a factor) */
export const timeCost = (e: RoadEdge) => ((e.len * 10) / 1000 / (SPEED_KMH[e.cls] ?? 30)) * 60;
export const lengthCost = (e: RoadEdge) => e.len;

export interface Route {
  nodes: number[];
  points: XZ[];
  /** km */
  km: number;
  /** minutes at the class speeds */
  minutes: number;
  roads: string[];
}

/** Dijkstra with a cost per edge; edges whose cost is Infinity are closed. Null when unreachable. */
export function route(g: RoadGraph, from: number, to: number, cost: EdgeCost = timeCost): Route | null {
  if (from < 0 || to < 0) return null;
  const n = g.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const prevE: (RoadEdge | null)[] = new Array(n).fill(null);
  dist[from] = 0;
  // binary heap of [d, v]
  const heap: [number, number][] = [[0, from]];
  const push = (d: number, v: number) => {
    heap.push([d, v]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, v] = pop();
    if (d > dist[v]) continue;
    if (v === to) break;
    for (const e of g.adj[v]) {
      const c = cost(e, v);
      if (!Number.isFinite(c)) continue;
      const nd = d + c;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = v;
        prevE[e.to] = e;
        push(nd, e.to);
      }
    }
  }
  if (!Number.isFinite(dist[to])) return null;
  const nodes: number[] = [];
  for (let v = to; v !== -1; v = prev[v]) nodes.push(v);
  nodes.reverse();
  let len = 0;
  let minutes = 0;
  const roads: string[] = [];
  for (const v of nodes) {
    const e = prevE[v];
    if (!e) continue;
    len += e.len;
    minutes += timeCost(e);
    if (roads[roads.length - 1] !== e.road) roads.push(e.road);
  }
  return { nodes, points: nodes.map((i) => g.nodes[i]), km: (len * 10) / 1000, minutes, roads };
}

/** the edges of a route, in order (for loading and closure tests) */
export function routeEdges(g: RoadGraph, r: Route): RoadEdge[] {
  const out: RoadEdge[] = [];
  for (let i = 1; i < r.nodes.length; i++) {
    const e = g.adj[r.nodes[i - 1]].find((q) => q.to === r.nodes[i]);
    if (e) out.push(e);
  }
  return out;
}

/* ---------------- utility networks ---------------- */

const nkey = (x: number, z: number) => `${x.toFixed(2)},${z.toFixed(2)}`;

/** segments still connected to the network source when the `isolated` segment ids are closed */
export function connectedSegments(net: Network, isolated: ReadonlySet<string>): Set<string> {
  const byNode = new Map<string, PipeSegment[]>();
  for (const s of net.segments) {
    if (isolated.has(s.id)) continue;
    for (const k of [nkey(s.a[0], s.a[1]), nkey(s.b[0], s.b[1])]) byNode.set(k, [...(byNode.get(k) ?? []), s]);
  }
  const seen = new Set<string>();
  const nodes = new Set<string>([net.sourceKey]);
  const stack = [net.sourceKey];
  while (stack.length) {
    const k = stack.pop()!;
    for (const s of byNode.get(k) ?? []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      for (const nk of [nkey(s.a[0], s.a[1]), nkey(s.b[0], s.b[1])]) if (!nodes.has(nk)) (nodes.add(nk), stack.push(nk));
    }
  }
  return seen;
}

/** segments that lose supply when `isolated` are closed (the isolated ones themselves included) */
export function cutOff(net: Network, isolated: ReadonlySet<string>): PipeSegment[] {
  const live = connectedSegments(net, isolated);
  return net.segments.filter((s) => !live.has(s.id));
}

/** distance from a point to a segment */
export function segDist(p: XZ, a: XZ, b: XZ) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const L2 = dx * dx + dz * dz || 1e-12;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** AD buildings whose centre lies within `reach` of any of the segments, with floor area (m²) */
export function buildingsAlong(segments: { a: XZ; b: XZ }[], reach: number) {
  const out: { id: number; name: string; kind: string; x: number; z: number; floorM2: number }[] = [];
  if (!segments.length) return out;
  const xs = segments.flatMap((s) => [s.a[0], s.b[0]]);
  const zs = segments.flatMap((s) => [s.a[1], s.b[1]]);
  const [x0, x1, z0, z1] = [Math.min(...xs) - reach, Math.max(...xs) + reach, Math.min(...zs) - reach, Math.max(...zs) + reach];
  for (const b of AD.buildings) {
    const [x, z] = b.c;
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    if (!segments.some((s) => segDist([x, z], s.a, s.b) <= reach)) continue;
    const footprint = b.b.reduce((a, [bx0, bz0, bx1, bz1]) => a + (bx1 - bx0) * (bz1 - bz0) * 100, 0);
    const floors = Math.max(1, Math.round((b.h * 10) / 3.5));
    out.push({ id: b.id, name: b.n, kind: b.k, x, z, floorM2: footprint * floors });
  }
  return out;
}
