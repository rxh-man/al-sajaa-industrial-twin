import { DIORAMA, sectorAt, UNIT_METERS } from './city';
import { AD, onLand, place } from './abudhabi';
import { mulberry32, hashString } from './rng';

export type LayerId = 'electric' | 'telecom' | 'water' | 'cooling' | 'sewage';

export const LAYER_ORDER: LayerId[] = ['electric', 'telecom', 'water', 'cooling', 'sewage'];

export interface FlowStyle {
  /** world units between pulses */
  spacing: number;
  /** world units / second */
  speed: number;
  /** pulse width as a fraction of spacing */
  width: number;
  /** emissive strength of pulses */
  strength: number;
}

export interface LayerDef {
  id: LayerId;
  label: string;
  short: string;
  color: string;
  glow: string;
  depth: number;
  radius: number;
  offset: number;
  prefix: string;
  explodedY: number;
  flow: FlowStyle;
  description: string;
}

export const LAYERS: Record<LayerId, LayerDef> = {
  electric: {
    id: 'electric',
    label: 'Electricity',
    short: 'ELEC',
    color: '#e8b931',
    glow: '#ffd75e',
    depth: -2.6,
    radius: 0.26,
    offset: 3.0,
    prefix: 'ELC',
    explodedY: 3,
    flow: { spacing: 16, speed: 13, width: 0.16, strength: 2.4 },
    description: '11 kV distribution feeders',
  },
  telecom: {
    id: 'telecom',
    label: 'Telecom',
    short: 'TEL',
    color: '#25c2a6',
    glow: '#5ff5d6',
    depth: -3.6,
    radius: 0.19,
    offset: 1.8,
    prefix: 'TEL',
    explodedY: -6,
    flow: { spacing: 10, speed: 22, width: 0.07, strength: 3.2 },
    description: 'Fiber backbone ducts',
  },
  water: {
    id: 'water',
    label: 'Water',
    short: 'WTR',
    color: '#2f9fe0',
    glow: '#62d4ff',
    depth: -5.2,
    radius: 0.42,
    offset: -2.4,
    prefix: 'WTR',
    explodedY: -15,
    flow: { spacing: 2.6, speed: 3.6, width: 0.3, strength: 0.85 },
    description: 'Potable water mains',
  },
  cooling: {
    id: 'cooling',
    label: 'District Cooling',
    short: 'DCL',
    color: '#9fe3f0',
    glow: '#d2f8ff',
    depth: -7.2,
    radius: 0.3,
    offset: -0.4,
    prefix: 'DCL',
    explodedY: -24,
    flow: { spacing: 4.5, speed: 2.4, width: 0.28, strength: 0.9 },
    description: 'Chilled water supply / return',
  },
  sewage: {
    id: 'sewage',
    label: 'Sewage',
    short: 'SWR',
    color: '#d48a3c',
    glow: '#f3b26a',
    depth: -9.8,
    radius: 0.58,
    offset: 0.5,
    prefix: 'SWR',
    explodedY: -33,
    flow: { spacing: 3.4, speed: 1.1, width: 0.4, strength: 0.55 },
    description: 'Gravity sewer mains',
  },
};

export interface SegmentMeta {
  material: string;
  diameterMm: number;
  installYear: number;
  health: number;
  spec: string;
}

export interface PipeSegment {
  index: number;
  id: string;
  layer: LayerId;
  variant: 'main' | 'supply' | 'return';
  a: [number, number];
  b: [number, number];
  y: number;
  radius: number;
  sector: string;
  length: number;
  trunk: boolean;
  /** +1 flows a→b, -1 flows b→a, 0 = no flow */
  flowDir: number;
  /** flow direction while the incident segment is isolated */
  flowDirIso: number;
  reroute: boolean;
  meta: SegmentMeta;
}

export interface NetNode {
  key: string;
  x: number;
  z: number;
  y: number;
  edges: number[];
  boundary: boolean;
}

export interface Riser {
  x: number;
  z: number;
  y0: number;
  y1: number;
  radius: number;
}

export interface Network {
  layer: LayerDef;
  variant: 'main' | 'supply' | 'return';
  segments: PipeSegment[];
  nodes: NetNode[];
  risers: Riser[];
  sourceKey: string;
}

/* ------------------------------------------------------------------ */

const key = (x: number, z: number) => `${x.toFixed(2)},${z.toFixed(2)}`;

interface RawEdge {
  a: string;
  b: string;
  trunk: boolean;
  radiusScale: number;
}

class NetBuilder {
  nodes = new Map<string, { x: number; z: number }>();
  edges: RawEdge[] = [];
  risers: Riser[] = [];
  constructor(public layer: LayerDef, public offset: number) {}

  node(x: number, z: number) {
    const k = key(x, z);
    if (!this.nodes.has(k)) this.nodes.set(k, { x, z });
    return k;
  }

  edge(ax: number, az: number, bx: number, bz: number, trunk = false, radiusScale = 1) {
    if (Math.abs(ax - bx) < 1e-6 && Math.abs(az - bz) < 1e-6) return;
    const a = this.node(ax, az);
    const b = this.node(bx, bz);
    if (this.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) return;
    this.edges.push({ a, b, trunk, radiusScale });
  }

  /** Keep only the biggest connected piece so no pipe floats on its own. */
  keepLargestComponent() {
    const adj = new Map<string, number[]>();
    this.edges.forEach((e, i) => {
      adj.set(e.a, [...(adj.get(e.a) ?? []), i]);
      adj.set(e.b, [...(adj.get(e.b) ?? []), i]);
    });
    const seen = new Set<string>();
    let best: Set<number> = new Set();
    for (const start of adj.keys()) {
      if (seen.has(start)) continue;
      const comp = new Set<number>();
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const k = stack.pop()!;
        for (const ei of adj.get(k) ?? []) {
          comp.add(ei);
          const e = this.edges[ei];
          for (const n of [e.a, e.b]) {
            if (!seen.has(n)) {
              seen.add(n);
              stack.push(n);
            }
          }
        }
      }
      if (comp.size > best.size) best = comp;
    }
    this.edges = this.edges.filter((_, i) => best.has(i));
    const keep = new Set(this.edges.flatMap((e) => [e.a, e.b]));
    for (const k of [...this.nodes.keys()]) if (!keep.has(k)) this.nodes.delete(k);
  }

  riser(x: number, z: number, top = 0.15) {
    this.risers.push({ x, z, y0: this.layer.depth, y1: top, radius: this.layer.radius * 0.8 });
  }

  /** Split edges at any node that lies strictly inside them (axis-aligned edges only). */
  finalize() {
    let changed = true;
    while (changed) {
      changed = false;
      for (let ei = 0; ei < this.edges.length && !changed; ei++) {
        const e = this.edges[ei];
        const A = this.nodes.get(e.a)!;
        const B = this.nodes.get(e.b)!;
        for (const [k, n] of this.nodes) {
          if (k === e.a || k === e.b) continue;
          const onX = Math.abs(A.x - B.x) < 1e-6 && Math.abs(n.x - A.x) < 1e-6 && n.z > Math.min(A.z, B.z) + 1e-6 && n.z < Math.max(A.z, B.z) - 1e-6;
          const onZ = Math.abs(A.z - B.z) < 1e-6 && Math.abs(n.z - A.z) < 1e-6 && n.x > Math.min(A.x, B.x) + 1e-6 && n.x < Math.max(A.x, B.x) - 1e-6;
          if (onX || onZ) {
            this.edges.splice(ei, 1, { ...e, b: k }, { ...e, a: k });
            changed = true;
            break;
          }
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Flow solving                                                        */
/* ------------------------------------------------------------------ */

function dijkstra(nodeKeys: string[], pos: Map<string, { x: number; z: number }>, edges: RawEdge[], source: string, skip?: number) {
  const dist = new Map<string, number>(nodeKeys.map((k) => [k, Infinity]));
  const adj = new Map<string, { to: string; w: number; ei: number }[]>(nodeKeys.map((k) => [k, []]));
  edges.forEach((e, ei) => {
    if (ei === skip) return;
    const A = pos.get(e.a)!;
    const B = pos.get(e.b)!;
    const w = Math.hypot(A.x - B.x, A.z - B.z);
    adj.get(e.a)!.push({ to: e.b, w, ei });
    adj.get(e.b)!.push({ to: e.a, w, ei });
  });
  dist.set(source, 0);
  const done = new Set<string>();
  while (done.size < nodeKeys.length) {
    let best: string | null = null;
    let bd = Infinity;
    for (const [k, d] of dist) {
      if (!done.has(k) && d < bd) {
        bd = d;
        best = k;
      }
    }
    if (!best) break;
    done.add(best);
    for (const { to, w } of adj.get(best)!) {
      const nd = bd + w;
      if (nd < dist.get(to)!) dist.set(to, nd);
    }
  }
  return dist;
}

/* ------------------------------------------------------------------ */
/* Asset metadata                                                      */
/* ------------------------------------------------------------------ */

function metaFor(layer: LayerId, id: string, trunk: boolean, variant: string): SegmentMeta {
  const r = mulberry32(hashString(id));
  const year = Math.round(1968 + r() * 51);
  const health = Math.round(82 + r() * 16);
  switch (layer) {
    case 'water':
      return {
        material: year < 1985 ? 'Cast Iron' : r() < 0.7 ? 'Ductile Iron' : 'HDPE',
        diameterMm: trunk ? 800 : r() < 0.5 ? 600 : 400,
        installYear: year,
        health,
        spec: 'Potable water main',
      };
    case 'electric':
      return { material: 'XLPE cable in PVC duct bank', diameterMm: 160, installYear: Math.max(year, 1990), health, spec: '11 kV distribution feeder' };
    case 'telecom':
      return { material: 'HDPE micro-duct', diameterMm: 110, installYear: Math.max(year, 2004), health: Math.max(health, 90), spec: '288-core fiber backbone' };
    case 'cooling':
      return {
        material: 'Pre-insulated steel',
        diameterMm: 500,
        installYear: Math.max(year, 2008),
        health: Math.max(health, 88),
        spec: variant === 'return' ? 'Chilled water return · 13.5 °C' : 'Chilled water supply · 5.5 °C',
      };
    case 'sewage':
      return { material: year < 1990 ? 'Vitrified clay' : 'Reinforced concrete', diameterMm: trunk ? 1200 : 900, installYear: year, health: Math.max(78, health - 6), spec: trunk ? 'Interceptor sewer' : 'Gravity sewer main' };
  }
}

/* ------------------------------------------------------------------ */
/* Network definitions                                                 */
/* ------------------------------------------------------------------ */

export const INCIDENT_SEGMENT_ID = 'WTR-B12-04';

function build(layerId: LayerId, variant: 'main' | 'supply' | 'return', offset: number, define: (b: NetBuilder) => { source: [number, number]; sink?: boolean }): Network {
  const layer = LAYERS[layerId];
  const b = new NetBuilder(layer, offset);
  const { source, sink } = define(b);
  b.finalize();

  const keys = [...b.nodes.keys()];
  const sourceKey = key(source[0], source[1]);
  const leakIdx = layerId === 'water' ? nearestEdge(b, LEAK_AT[0], LEAK_AT[1]) : -1;
  const dist = dijkstra(keys, b.nodes, b.edges, sourceKey);
  const distIso = leakIdx >= 0 ? dijkstra(keys, b.nodes, b.edges, sourceKey, leakIdx) : dist;

  const counters = new Map<string, number>();
  const segments: PipeSegment[] = b.edges.map((e, i) => {
    const A = b.nodes.get(e.a)!;
    const B = b.nodes.get(e.b)!;
    const mid = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
    // assign to the block north / west of the street the segment runs along
    const horizontal = Math.abs(A.z - B.z) < 1e-6;
    const probe = horizontal ? { x: mid.x, z: mid.z - 8 } : { x: mid.x - 8, z: mid.z };
    const sector = sectorAt(probe.x, probe.z)?.id ?? 'A-10';
    const base = `${layer.prefix}-${sector.replace('-', '')}`;
    const n = (counters.get(base) ?? 0) + 1;
    counters.set(base, n);
    let id = `${base}-${String(n).padStart(2, '0')}`;
    if (variant !== 'main') id += variant === 'supply' ? 'S' : 'R';

    const dirFrom = (d: Map<string, number>) => {
      const da = d.get(e.a)!;
      const db = d.get(e.b)!;
      if (!isFinite(da) && !isFinite(db)) return 0;
      let dir = da <= db ? 1 : -1;
      if (sink) dir = -dir; // sewer: flow toward the outfall
      return dir;
    };

    return {
      index: i,
      id,
      layer: layerId,
      variant,
      a: [A.x, A.z],
      b: [B.x, B.z],
      y: layer.depth,
      radius: layer.radius * e.radiusScale * (e.trunk ? 1.3 : 1),
      sector,
      length: Math.hypot(A.x - B.x, A.z - B.z),
      trunk: e.trunk,
      flowDir: dirFrom(dist),
      flowDirIso: i === leakIdx ? 0 : dirFrom(distIso),
      reroute: false,
      meta: metaFor(layerId, id, e.trunk, variant),
    };
  });

  // force the incident segment ID (swap with whichever segment already owns it)
  if (leakIdx >= 0) {
    const owner = segments.find((s) => s.id === INCIDENT_SEGMENT_ID);
    const leak = segments[leakIdx];
    if (owner && owner !== leak) owner.id = leak.id;
    leak.id = INCIDENT_SEGMENT_ID;
    leak.meta = { material: 'Ductile Iron', diameterMm: 600, installYear: 2011, health: 67, spec: 'Potable water main' };
    for (const s of segments) if (owner && s === owner) s.meta = metaFor('water', s.id, s.trunk, 'main');
  }

  const nodes: NetNode[] = keys.map((k) => {
    const p = b.nodes.get(k)!;
    const edges = segments.filter((s) => key(s.a[0], s.a[1]) === k || key(s.b[0], s.b[1]) === k).map((s) => s.index);
    const boundary = Math.abs(p.x - DIORAMA.minX) < 1e-3 || Math.abs(p.x - DIORAMA.maxX) < 1e-3 || Math.abs(p.z - DIORAMA.minZ) < 1e-3 || Math.abs(p.z - DIORAMA.maxZ) < 1e-3;
    return { key: k, x: p.x, z: p.z, y: layer.depth, edges, boundary };
  });

  return { layer, variant, segments, nodes, risers: b.risers, sourceKey };
}

/* ------------------------------------------------------------------ */
/* Real streets → pipe routes                                          */
/* ------------------------------------------------------------------ */

/** The demo leak sits on the water main beside Khalifa Street, at the scene origin. */
const LEAK_AT: [number, number] = [1.5, LAYERS.water.offset];

/** Street centre-line pieces from OpenStreetMap (underpasses and footpaths excluded). */
const STREET_EDGES = AD.roads.filter((r) => r.c !== 'pedestrian').flatMap((r) => r.p.slice(1).map((q, i) => ({ a: r.p[i], b: q, cls: r.c, oneway: r.o === 1 })));

/**
 * A dual carriageway is two one-way roads side by side; a utility runs under one of them, not both.
 * Keep the one-way pieces heading this way (for Khalifa Street, the carriageway over the demo leak).
 */
const KEEP_DIR: [number, number] = [0.94, 0.33];
const keptCarriageway = (e: (typeof STREET_EDGES)[number]) => !e.oneway || (e.b[0] - e.a[0]) * KEEP_DIR[0] + (e.b[1] - e.a[1]) * KEEP_DIR[1] >= 0;

/** Clip a segment to the slab so pipes end flush with its cut faces. */
function clipToSlab(ax: number, az: number, bx: number, bz: number): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [p, q] of [
    [-dx, ax - DIORAMA.minX],
    [dx, DIORAMA.maxX - ax],
    [-dz, az - DIORAMA.minZ],
    [dz, DIORAMA.maxZ - az],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return null;
    }
  }
  return [ax + dx * t0, az + dz * t0, ax + dx * t1, az + dz * t1];
}

/** One utility under every street of the given classes, shifted sideways like a real service corridor. */
function underStreets(b: NetBuilder, classes: RegExp, trunk?: RegExp, near?: [number, number, number]) {
  const o = b.offset;
  for (const e of STREET_EDGES) {
    if (!classes.test(e.cls) || !keptCarriageway(e)) continue;
    const mx = (e.a[0] + e.b[0]) / 2 + o;
    const mz = (e.a[1] + e.b[1]) / 2 + o;
    if (near && Math.hypot(mx - near[0], mz - near[1]) > near[2]) continue;
    if (!onLand(mx, mz)) continue;
    const c = clipToSlab(e.a[0] + o, e.a[1] + o, e.b[0] + o, e.b[1] + o);
    if (c) b.edge(c[0], c[1], c[2], c[3], !!trunk?.test(e.cls));
  }
  if (b.layer.id === 'water') b.keepLargestComponent(); // the leak needs a connected water main
}

function nearestNode(b: NetBuilder, x: number, z: number): [number, number] {
  let best: [number, number] = [x, z];
  let bd = Infinity;
  for (const n of b.nodes.values()) {
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bd) {
      bd = d;
      best = [n.x, n.z];
    }
  }
  return best;
}

function nearestEdge(b: NetBuilder, x: number, z: number) {
  let best = -1;
  let bd = Infinity;
  b.edges.forEach((e, i) => {
    const A = b.nodes.get(e.a)!;
    const B = b.nodes.get(e.b)!;
    const L2 = (B.x - A.x) ** 2 + (B.z - A.z) ** 2 || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - A.x) * (B.x - A.x) + (z - A.z) * (B.z - A.z)) / L2));
    const d = Math.hypot(A.x + t * (B.x - A.x) - x, A.z + t * (B.z - A.z) - z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Segment indices along the shortest way between two nodes, avoiding one segment. */
function shortestPath(segments: PipeSegment[], from: string, to: string, skip: number) {
  const adj = new Map<string, { to: string; w: number; i: number }[]>();
  for (const s of segments) {
    if (s.index === skip) continue;
    const a = key(s.a[0], s.a[1]);
    const b = key(s.b[0], s.b[1]);
    adj.set(a, [...(adj.get(a) ?? []), { to: b, w: s.length, i: s.index }]);
    adj.set(b, [...(adj.get(b) ?? []), { to: a, w: s.length, i: s.index }]);
  }
  const dist = new Map<string, number>([[from, 0]]);
  const via = new Map<string, { prev: string; i: number }>();
  const open = new Set([from]);
  while (open.size) {
    let cur = '';
    let cd = Infinity;
    for (const k of open) {
      const d = dist.get(k)!;
      if (d < cd) {
        cd = d;
        cur = k;
      }
    }
    open.delete(cur);
    if (cur === to) break;
    for (const e of adj.get(cur) ?? []) {
      const nd = cd + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        via.set(e.to, { prev: cur, i: e.i });
        open.add(e.to);
      }
    }
  }
  const out: number[] = [];
  for (let k = to; via.has(k); k = via.get(k)!.prev) out.push(via.get(k)!.i);
  return out;
}

const WATER = build('water', 'main', LAYERS.water.offset, (b) => {
  underStreets(b, /^(trunk|primary|secondary|tertiary)$/, /^(trunk|primary)$/);
  return { source: nearestNode(b, 40, DIORAMA.minZ) };
});

const SUBSTATION = place('substation');
const ELECTRIC = build('electric', 'main', LAYERS.electric.offset, (b) => {
  underStreets(b, /^(primary|secondary)$/, /^primary$/);
  const src = nearestNode(b, SUBSTATION?.x ?? 0, SUBSTATION?.z ?? 20);
  b.riser(src[0], src[1]);
  return { source: src };
});

const TELECOM = build('telecom', 'main', LAYERS.telecom.offset, (b) => {
  underStreets(b, /^(trunk|primary|secondary)$/);
  return { source: nearestNode(b, DIORAMA.minX, 0) };
});

/** District cooling serves the tower cluster around The Landmark and ADIA. */
const COOLING_AREA: [number, number, number] = [72, 4, 32];
function coolingDef(b: NetBuilder) {
  underStreets(b, /^(primary|secondary|tertiary)$/, /^(primary|secondary)$/, COOLING_AREA);
  const src = nearestNode(b, 86, 14);
  b.riser(src[0], src[1]);
  return { source: src as [number, number] };
}

const COOLING_SUPPLY = build('cooling', 'supply', LAYERS.cooling.offset - 0.5, coolingDef);
const COOLING_RETURN = build('cooling', 'return', LAYERS.cooling.offset + 0.5, (b) => ({ ...coolingDef(b), sink: true }));

const SEWAGE = build('sewage', 'main', LAYERS.sewage.offset, (b) => {
  underStreets(b, /^(trunk|primary|secondary|tertiary)$/, /^(trunk|primary)$/);
  return { source: nearestNode(b, -60, DIORAMA.minZ), sink: true };
});

// water detours around the isolated segment along the shortest way between its two ends
(() => {
  const leak = WATER.segments.find((sg) => sg.id === INCIDENT_SEGMENT_ID);
  if (!leak) return;
  for (const i of shortestPath(WATER.segments, key(leak.a[0], leak.a[1]), key(leak.b[0], leak.b[1]), leak.index)) WATER.segments[i].reroute = true;
})();

export const NETWORKS: Network[] = [ELECTRIC, TELECOM, WATER, COOLING_SUPPLY, COOLING_RETURN, SEWAGE];

export const WATER_NETWORK = WATER;
export const INCIDENT_SEGMENT = WATER.segments.find((s) => s.id === INCIDENT_SEGMENT_ID)!;

export const ALL_SEGMENTS = NETWORKS.flatMap((n) => n.segments);

/** Total run length of one layer, in metres (segments are 2 to 20 m each). */
export function networkLengthM(layer: LayerId) {
  const u = NETWORKS.filter((n) => n.layer.id === layer).reduce((acc, n) => acc + n.segments.reduce((a, s) => a + s.length, 0), 0);
  return Math.round(u * UNIT_METERS);
}

export function findSegment(layer: LayerId, variant: string, index: number) {
  return NETWORKS.find((n) => n.layer.id === layer && n.variant === variant)?.segments[index];
}
