import { AD, type AdRoad, type XZ } from './abudhabi';

/**
 * Spatial queries over the rendered world (baseline + expansion + corrections): carriageways, building
 * footprints and point obstacles, bucketed on a uniform grid so placement code can test thousands of
 * candidates cheaply. Shared by the lamps and the streetscape so nothing is placed on a road or in a building.
 * Scene units: 1 = 10 m.
 */

export const DRIVABLE = /^(trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$/;
export const isElevatedRoad = (r: Pick<AdRoad, 'o' | 'n'>) => r.o === 1 || /flyover|Ramp|Cloverleaf/.test(r.n);
/** a road whose carriageway lies on the ground (not a tunnel, not a flyover deck) */
export const atGrade = (r: AdRoad) => (DRIVABLE.test(r.c) || r.c === 'pedestrian') && r.t !== 1 && !isElevatedRoad(r);

const CELL = 4;

/** A uniform bucket grid of items with axis-aligned bounds. */
export class Grid<T> {
  private cells = new Map<number, T[]>();
  private key(i: number, j: number) {
    return i * 65536 + j;
  }
  add(x0: number, z0: number, x1: number, z1: number, item: T) {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = this.key(i, j);
        const c = this.cells.get(k);
        if (c) c.push(item);
        else this.cells.set(k, [item]);
      }
  }
  /** items whose cells touch the query box (each item once) */
  query(x0: number, z0: number, x1: number, z1: number, out: Set<T> = new Set()) {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const c = this.cells.get(this.key(i, j));
        if (c) for (const it of c) out.add(it);
      }
    return out;
  }
}

export interface RoadSeg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  hw: number;
  road: AdRoad;
}

export function segDist(x: number, z: number, s: { ax: number; az: number; bx: number; bz: number }) {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const L2 = dx * dx + dz * dz || 1e-12;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
  return Math.hypot(x - (s.ax + t * dx), z - (s.az + t * dz));
}

const segGrid = new Grid<RoadSeg>();
for (const r of AD.roads) {
  if (!atGrade(r)) continue;
  const hw = r.w / 2;
  for (let i = 1; i < r.p.length; i++) {
    const [ax, az] = r.p[i - 1];
    const [bx, bz] = r.p[i];
    segGrid.add(Math.min(ax, bx) - hw, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, Math.max(az, bz) + hw, { ax, az, bx, bz, hw, road: r });
  }
}

type Box = [number, number, number, number];
const boxGrid = new Grid<Box>();
for (const b of AD.buildings) {
  if ((b.y ?? 0) >= 0.55) continue; // raised over the street (rail platforms)
  for (const box of b.b) boxGrid.add(box[0], box[1], box[2], box[3], box);
}

/** distance from a point to the nearest at-grade carriageway edge (negative inside a carriageway) */
export function kerbDistance(x: number, z: number, reach = 3) {
  let best = Infinity;
  for (const s of segGrid.query(x - reach, z - reach, x + reach, z + reach)) best = Math.min(best, segDist(x, z, s) - s.hw);
  return best;
}

/** nearest at-grade road segment within reach, with the distance to its centre line */
export function nearestRoad(x: number, z: number, reach = 3) {
  let best: { seg: RoadSeg; d: number } | null = null;
  for (const s of segGrid.query(x - reach, z - reach, x + reach, z + reach)) {
    const d = segDist(x, z, s);
    if (!best || d - s.hw < best.d - best.seg.hw) best = { seg: s, d };
  }
  return best;
}

export function inBuilding(x: number, z: number, margin = 0) {
  for (const [x0, z0, x1, z1] of boxGrid.query(x - margin, z - margin, x + margin, z + margin))
    if (x > x0 - margin && x < x1 + margin && z > z0 - margin && z < z1 + margin) return true;
  return false;
}

/** distance from a point to the nearest building footprint (0 inside one), searched within reach */
export function buildingDistance(x: number, z: number, reach = 3) {
  let best = Infinity;
  for (const [x0, z0, x1, z1] of boxGrid.query(x - reach, z - reach, x + reach, z + reach))
    best = Math.min(best, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)));
  return best;
}

/** buildings near a point (for frontage and land-use tests) */
export function buildingsNear(x: number, z: number, reach: number) {
  return boxGrid.query(x - reach, z - reach, x + reach, z + reach);
}

/** Circle obstacles (palms, lamp poles, placed props), bucketed for overlap tests. */
export class Obstacles {
  private grid = new Grid<[number, number, number]>();
  add(x: number, z: number, r: number) {
    this.grid.add(x - r, z - r, x + r, z + r, [x, z, r]);
  }
  /** an oriented rectangle (centre, yaw = heading of its long axis about +y, length, width) */
  addRect(cx: number, cz: number, yaw: number, len: number, wid: number) {
    for (const [x, z] of rectSamples(cx, cz, yaw, len, wid, 3, 2)) this.add(x, z, Math.max(len / 6, wid / 4));
  }
  hit(x: number, z: number, r: number) {
    for (const [ox, oz, or] of this.grid.query(x - r - 1, z - r - 1, x + r + 1, z + r + 1)) if ((ox - x) ** 2 + (oz - z) ** 2 < (or + r) ** 2) return true;
    return false;
  }
}

/** sample points over an oriented rectangle: nl along its length, nw across */
export function rectSamples(cx: number, cz: number, yaw: number, len: number, wid: number, nl = 5, nw = 3): XZ[] {
  // yaw follows three.js (rotation about +y): the long axis points along (sin yaw, cos yaw) in xz
  const ux = Math.sin(yaw);
  const uz = Math.cos(yaw);
  const vx = uz;
  const vz = -ux;
  const out: XZ[] = [];
  for (let i = 0; i < nl; i++)
    for (let j = 0; j < nw; j++) {
      const a = (i / (nl - 1) - 0.5) * len;
      const b = (j / (nw - 1) - 0.5) * wid;
      out.push([cx + ux * a + vx * b, cz + uz * a + vz * b]);
    }
  return out;
}

/** true when the rectangle stays off every carriageway and out of every building, with a margin */
export function rectClearOfCity(cx: number, cz: number, yaw: number, len: number, wid: number, margin = 0.05) {
  for (const [x, z] of rectSamples(cx, cz, yaw, len, wid)) {
    if (kerbDistance(x, z) < margin) return false;
    if (inBuilding(x, z, margin)) return false;
  }
  return true;
}

export interface Junction {
  x: number;
  z: number;
  /** unit directions of the road arms leaving the junction, with that road */
  arms: { dx: number; dz: number; road: AdRoad }[];
}

/** Junctions: node ids shared by two or more at-grade drivable roads, with their arms. */
export const JUNCTIONS: Junction[] = (() => {
  const by = new Map<string, Junction & { roads: Set<AdRoad> }>();
  for (const r of AD.roads) {
    if (!atGrade(r) || r.c === 'pedestrian' || !r.k) continue;
    r.k.forEach((id, i) => {
      const [x, z] = r.p[i];
      let j = by.get(id);
      if (!j) by.set(id, (j = { x, z, arms: [], roads: new Set() }));
      j.roads.add(r);
      for (const n of [i - 1, i + 1]) {
        if (n < 0 || n >= r.p.length) continue;
        const dx = r.p[n][0] - x;
        const dz = r.p[n][1] - z;
        const L = Math.hypot(dx, dz);
        if (L > 1e-6) j.arms.push({ dx: dx / L, dz: dz / L, road: r });
      }
    });
  }
  return [...by.values()].filter((j) => j.roads.size >= 2).map(({ x, z, arms }) => ({ x, z, arms }));
})();

const junctionGrid = new Grid<Junction>();
for (const j of JUNCTIONS) junctionGrid.add(j.x, j.z, j.x, j.z, j);

/** distance to the nearest junction node within reach */
export function junctionDistance(x: number, z: number, reach = 3) {
  let best = Infinity;
  for (const j of junctionGrid.query(x - reach, z - reach, x + reach, z + reach)) best = Math.min(best, Math.hypot(j.x - x, j.z - z));
  return best;
}
