import { AD, type XZ } from './abudhabi';
import { VEHICLE_LENGTH, type VehicleKind } from '../three/vehicles/vehicleModels';

/**
 * Industrial equipment parked in the expansion yards (procedural, deterministic).
 * Each placement sits beside a procedural yard building, outside every building footprint
 * and clear of the road centre lines, facing outward from the building it serves.
 * Scene units: 1 = 10 m.
 */

export interface YardItem {
  kind: VehicleKind;
  x: number;
  z: number;
  yaw: number;
  /** index into the paint palette used for the body colour */
  paint: number;
}

/** What each yard building brings: kind and how many (fractional counts are per-building chances). */
const PLAN: Record<string, [VehicleKind, number][]> = {
  'Logistics warehouse': [['forklift', 2], ['yardTractor', 1]],
  'Container stack': [['reachStacker', 0.3]],
  'Truck depot': [['yardTractor', 1], ['forklift', 1], ['semi', 1], ['flatbed', 1]],
  'Loading office': [['pickup', 1]],
  'Workshop': [['serviceVan', 1], ['forklift', 1]],
  'Factory hall': [['wheelLoader', 1], ['forklift', 1], ['excavator', 0.2], ['bulldozer', 0.2]],
};

/** A small deterministic generator so the same building always gets the same yard. */
function rng(seed: number) {
  let s = Math.floor(Math.abs(seed * 9973)) % 2147483647 || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

const ROAD_SEGS: [number, number, number, number][] = [];
for (const r of AD.roads) for (let i = 1; i < r.p.length; i++) ROAD_SEGS.push([r.p[i - 1][0], r.p[i - 1][1], r.p[i][0], r.p[i][1]]);

const BOXES = AD.buildings.flatMap((b) => b.b);

function clearOfRoads(x: number, z: number) {
  for (const [ax, az, bx, bz] of ROAD_SEGS) if (distToSegment(x, z, ax, az, bx, bz) < 1.3) return false;
  return true;
}

function clearOfBuildings(x: number, z: number, half: number) {
  for (const [x0, z0, x1, z1] of BOXES) {
    if (x > x0 - half && x < x1 + half && z > z0 - half && z < z1 + half) return false;
  }
  return true;
}

export const YARD_EQUIPMENT: YardItem[] = (() => {
  const out: YardItem[] = [];
  for (const b of AD.buildings) {
    if (!b.procedural || b.b.length === 0) continue;
    const plan = PLAN[b.n];
    if (!plan) continue;
    const [x0, z0, x1, z1] = b.b[0];
    const r = rng(b.id);
    for (const [kind, count] of plan) {
      const n = Math.floor(count) + (r() < count % 1 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const half = VEHICLE_LENGTH[kind] / 2;
        // try the four sides in a random order; the first clear spot wins
        const sides = [0, 1, 2, 3].sort(() => r() - 0.5);
        let placed = false;
        for (const side of sides) {
          if (placed) break;
          for (let attempt = 0; attempt < 3 && !placed; attempt++) {
            const along = (r() - 0.5) * 0.5;
            let x: number, z: number, nx: number, nz: number;
            const gap = half + 0.3;
            if (side === 0) { x = (x0 + x1) / 2 + along * (x1 - x0); z = z1 + gap; nx = 0; nz = 1; }
            else if (side === 1) { x = (x0 + x1) / 2 + along * (x1 - x0); z = z0 - gap; nx = 0; nz = -1; }
            else if (side === 2) { x = x1 + gap; z = (z0 + z1) / 2 + along * (z1 - z0); nx = 1; nz = 0; }
            else { x = x0 - gap; z = (z0 + z1) / 2 + along * (z1 - z0); nx = -1; nz = 0; }
            if (!clearOfRoads(x, z) || !clearOfBuildings(x, z, Math.max(0.3, half * 0.5))) continue;
            // a forklift or yard tractor drives out of the yard; big plant parks in place facing outward
            out.push({ kind, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.atan2(nx, nz), paint: Math.floor(r() * 4) });
            placed = true;
          }
        }
      }
    }
  }
  return out;
})();

export const YARD_EQUIPMENT_COUNTS = (() => {
  const c: Record<string, number> = {};
  for (const y of YARD_EQUIPMENT) c[y.kind] = (c[y.kind] ?? 0) + 1;
  return c;
})();

/** Footprint outlines of every yard item, for checks. */
export function yardItemPolygon(it: YardItem): XZ[] {
  const h = VEHICLE_LENGTH[it.kind] / 2;
  const w = 0.6;
  const c = Math.cos(it.yaw), s = Math.sin(it.yaw);
  const corners: [number, number][] = [[-w, -h], [w, -h], [w, h], [-w, h]];
  return corners.map(([u, v]) => [it.x + u * c + v * s, it.z - u * s + v * c] as XZ);
}
