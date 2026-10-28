/**
 * Freight routing on the existing road polylines. Pure functions (no 3D or JSON imports).
 * The route is a deterministic shortest path on the road graph (Dijkstra). It is a model, not
 * GPS data: no vehicle positions or live traffic are used.
 * Scene units: 1 = 10 m; lengths are returned in scene units (multiply by 10 for metres).
 */

export type XZ = [number, number];

export interface RoadLike {
  c: string;
  p: XZ[];
}

/** Road classes a heavy goods vehicle may use in the model (no footways, paths or cycleways). */
export const FREIGHT_CLASSES = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
  'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'service',
]);

export interface RoadGraph {
  nodes: XZ[];
  adj: { to: number; w: number }[][];
}

const key = (x: number, z: number) => `${x.toFixed(2)},${z.toFixed(2)}`;

/** Build an undirected graph whose nodes are road vertices. Coincident points (to 0.01 units) are one node. */
export function buildRoadGraph(roads: readonly RoadLike[], classes: ReadonlySet<string> = FREIGHT_CLASSES): RoadGraph {
  const index = new Map<string, number>();
  const nodes: XZ[] = [];
  const adj: { to: number; w: number }[][] = [];
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
      const w = Math.hypot(nodes[b][0] - nodes[a][0], nodes[b][1] - nodes[a][1]);
      adj[a].push({ to: b, w });
      adj[b].push({ to: a, w });
    }
  }
  return { nodes, adj };
}

/** Index of the graph node closest to a point, or -1 for an empty graph. */
export function nearestNode(g: RoadGraph, p: XZ): number {
  let best = -1;
  let bd = Infinity;
  g.nodes.forEach((n, i) => {
    const d = (n[0] - p[0]) ** 2 + (n[1] - p[1]) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Minimal binary min-heap keyed by distance. */
class MinHeap {
  private a: { d: number; v: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(d: number, v: number) {
    const a = this.a;
    a.push({ d, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].d <= a[i].d) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): { d: number; v: number } | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].d < a[m].d) m = l;
        if (r < a.length && a[r].d < a[m].d) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Shortest path between two graph nodes as node indices, or null when they are not connected. */
export function shortestPath(g: RoadGraph, from: number, to: number): number[] | null {
  if (from < 0 || to < 0 || from >= g.nodes.length || to >= g.nodes.length) return null;
  const dist = new Float64Array(g.nodes.length).fill(Infinity);
  const prev = new Int32Array(g.nodes.length).fill(-1);
  dist[from] = 0;
  const heap = new MinHeap();
  heap.push(0, from);
  while (heap.size > 0) {
    const { d, v } = heap.pop()!;
    if (d > dist[v]) continue;
    if (v === to) break;
    for (const e of g.adj[v]) {
      const nd = d + e.w;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = v;
        heap.push(nd, e.to);
      }
    }
  }
  if (!Number.isFinite(dist[to])) return null;
  const path: number[] = [];
  for (let v = to; v !== -1; v = prev[v]) path.push(v);
  return path.reverse();
}

export interface FreightRoute {
  points: XZ[];
  /** Route length in scene units (1 unit = 10 m). */
  lengthUnits: number;
}

/** The k graph nodes closest to a point, nearest first. */
export function nearestNodes(g: RoadGraph, p: XZ, k: number): number[] {
  return g.nodes
    .map((n, i) => ({ i, d: (n[0] - p[0]) ** 2 + (n[1] - p[1]) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.max(0, k))
    .map((x) => x.i);
}

/** Full single-source Dijkstra: distance and predecessor for every node. */
function dijkstraAll(g: RoadGraph, from: number) {
  const dist = new Float64Array(g.nodes.length).fill(Infinity);
  const prev = new Int32Array(g.nodes.length).fill(-1);
  dist[from] = 0;
  const heap = new MinHeap();
  heap.push(0, from);
  while (heap.size > 0) {
    const { d, v } = heap.pop()!;
    if (d > dist[v]) continue;
    for (const e of g.adj[v]) {
      const nd = d + e.w;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = v;
        heap.push(nd, e.to);
      }
    }
  }
  return { dist, prev };
}

/**
 * Route between two free points. The road network is fragmented (yards and some streets are not
 * joined to the main network), so each end is snapped to a road node: the start is tried at its
 * nearest few road nodes, and the end is the reachable node closest to the destination point.
 * A snap longer than `maxSnap` (scene units, 25 = 250 m) is refused. Returns null when the points
 * cannot be connected within that limit, so no route is fabricated.
 */
export function routeBetween(g: RoadGraph, a: XZ, b: XZ, candidates = 12, maxSnap = 25): FreightRoute | null {
  const starts = nearestNodes(g, a, candidates);
  const ends = nearestNodes(g, b, candidates);
  const gap = (i: number, p: XZ) => Math.hypot(g.nodes[i][0] - p[0], g.nodes[i][1] - p[1]);
  for (const s of starts) {
    if (gap(s, a) > maxSnap) break;
    const { dist, prev } = dijkstraAll(g, s);
    let best = -1;
    for (const t of ends) {
      if (!Number.isFinite(dist[t]) || gap(t, b) > maxSnap) continue;
      if (best < 0 || gap(t, b) < gap(best, b) || (gap(t, b) === gap(best, b) && dist[t] < dist[best])) best = t;
    }
    if (best < 0) continue;
    const path: number[] = [];
    for (let v = best; v !== -1; v = prev[v]) path.push(v);
    path.reverse();
    // include the true end points, unless they already coincide with the first/last road node
    const pts: XZ[] = path.map((i) => g.nodes[i]);
    const points: XZ[] = [];
    const push = (p: XZ) => {
      const last = points[points.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) points.push(p);
    };
    push([a[0], a[1]]);
    pts.forEach(push);
    push([b[0], b[1]]);
    let lengthUnits = 0;
    for (let i = 1; i < points.length; i++) lengthUnits += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    return { points, lengthUnits };
  }
  return null;
}
