import { AD, onLand, type XZ } from './abudhabi';
import { TRENCH } from './incident';

/**
 * Street lighting for the dusk city: lamps along both kerbs of the real main roads and a row
 * along the Corniche promenade. Shared by the lamps (StreetLights.tsx) and the sea, which mirrors
 * the promenade row in the water.
 */
export interface Lamp {
  x: number;
  z: number;
  /** unit direction of the lamp arm (over the road, or out over the water) */
  ox: number;
  oz: number;
}

/** Pole height, scene units (1 = 10 m). */
export const LAMP_H = 1.1;

const MAIN = /^(trunk|primary|secondary|tertiary)$/;
const ROAD_SPACING = 4.6;
const PROMENADE_SPACING = 7.5;
const MIN_GAP = 1.6;

const boxes = AD.buildings.flatMap((b) => b.b);
const inBuilding = (x: number, z: number) => boxes.some(([x1, z1, x2, z2]) => x > x1 - 0.15 && x < x2 + 0.15 && z > z1 - 0.15 && z < z2 + 0.15);
const inTrench = (x: number, z: number) => x > TRENCH.minX - 1 && x < TRENCH.maxX + 1 && z > TRENCH.minZ - 1 && z < TRENCH.maxZ + 1;

/** Points every `step` along a polyline, with the unit tangent there. */
function along(pts: XZ[], step: number, phase = step / 2) {
  const out: { x: number; z: number; tx: number; tz: number }[] = [];
  let next = phase;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    while (next <= acc + L) {
      const u = (next - acc) / L;
      out.push({ x: ax + (bx - ax) * u, z: az + (bz - az) * u, tx: (bx - ax) / L, tz: (bz - az) / L });
      next += step;
    }
    acc += L;
  }
  return out;
}

function build() {
  const placed: Lamp[] = [];
  const clear = (x: number, z: number) => placed.every((l) => (l.x - x) ** 2 + (l.z - z) ** 2 > MIN_GAP * MIN_GAP);
  const promenade: Lamp[] = [];

  // the Corniche promenade first, so road lamps keep their distance from it
  for (const p of along(AD.coast, PROMENADE_SPACING)) {
    // which side of the seawall is land?
    let nx = -p.tz;
    let nz = p.tx;
    if (!onLand(p.x + nx * 1.5, p.z + nz * 1.5)) {
      nx = -nx;
      nz = -nz;
    }
    const x = p.x + nx * 0.9;
    const z = p.z + nz * 0.9;
    if (Math.abs(x) > 95 || !onLand(x, z) || inBuilding(x, z)) continue;
    const lamp = { x, z, ox: -nx, oz: -nz };
    promenade.push(lamp);
    placed.push(lamp);
  }

  for (const r of AD.roads) {
    if (!MAIN.test(r.c) || r.t) continue;
    for (const p of along(r.p, ROAD_SPACING)) {
      const nx = -p.tz;
      const nz = p.tx;
      for (const side of [1, -1]) {
        const off = r.w / 2 + 0.28;
        const x = p.x + nx * off * side;
        const z = p.z + nz * off * side;
        if (Math.abs(x) > 95 || z < -67 || !onLand(x, z) || inBuilding(x, z) || inTrench(x, z) || !clear(x, z)) continue;
        placed.push({ x, z, ox: -nx * side, oz: -nz * side });
      }
    }
  }
  return { lamps: placed, promenade };
}

const built = build();
export const LAMPS: Lamp[] = built.lamps;
export const PROMENADE: Lamp[] = built.promenade;
