import { AD_BASE as AD, AD as WORLD, FIX_ROADS, INTERCHANGE, LAGOONS, inLagoonPlot, inLagoonWater, onLandBase, type XZ } from './abudhabi';
import { inBuilding as inAnyBuilding, kerbDistance, segDist } from './spatial';
import { TRENCH } from './incident';
import { ALSAJAA_INLAND } from '../config/overrides';

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
/** land for lamps: the baseline outline, or the lagoon community's dry land */
const LR = LAGOONS.meta.rect;
const IR = INTERCHANGE.meta.rect;
const onLand = (x: number, z: number) =>
  onLandBase(x, z) || (x > LR.minX && x < LR.maxX && z > LR.minZ && z < LR.maxZ && !inLagoonWater(x, z)) || (x > IR.minX && x < IR.maxX && z > IR.minZ && z < IR.maxZ);
/** under a raised deck a pole would run into it */
const decks = WORLD.roads.filter((r) => r.o === 1).flatMap((r) => r.p.slice(1).map((b, i) => ({ ax: r.p[i][0], az: r.p[i][1], bx: b[0], bz: b[1], hw: r.w / 2 + 0.6 })));
const underDeck = (x: number, z: number) => decks.some((d) => segDist(x, z, d) < d.hw);
/** the rail corridor (track, ballast and the bridge decks): no lamp poles on it */
const railSegs = WORLD.roads
  .filter((r) => r.c === 'rail')
  .flatMap((r) => r.p.slice(1).map((b, i) => ({ ax: r.p[i][0], az: r.p[i][1], bx: b[0], bz: b[1] })));
/** the lagoon community's parked cars and villas are placed before the lamps: keep the poles off them */
const lagoonTaken = (x: number, z: number) =>
  LAGOONS.cars.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < 0.5 * 0.5) || LAGOONS.villas.some((v) => (v.x - x) ** 2 + (v.z - z) ** 2 < 0.85 * 0.85);
const onRail = (x: number, z: number) => railSegs.some((s) => segDist(x, z, s) < 0.75);
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
  // inland Al Sajaa has no Corniche seawall, so no promenade lamp row (src/config/overrides.ts)
  for (const p of ALSAJAA_INLAND ? [] : along(AD.coast, PROMENADE_SPACING)) {
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

  // the baseline's main roads, plus the boundary roads the corrections added (Rail Frontage Road, South Road)
  for (const r of [...AD.roads, ...FIX_ROADS, ...LAGOONS.roads.filter((q) => !q.bridge), ...INTERCHANGE.roads.filter((q) => q.o !== 1)]) {
    if (!MAIN.test(r.c) || r.t) continue;
    for (const p of along(r.p, ROAD_SPACING)) {
      const nx = -p.tz;
      const nz = p.tx;
      for (const side of [1, -1]) {
        const off = r.w / 2 + 0.28;
        const x = p.x + nx * off * side;
        const z = p.z + nz * off * side;
        if (Math.abs(x) > 110 || z < -67 || !onLand(x, z) || inBuilding(x, z) || inTrench(x, z) || !clear(x, z)) continue;
        // never on another road's carriageway or inside a corrected footprint (the rendered world)
        if (kerbDistance(x, z) < 0.08 || inAnyBuilding(x, z, 0.1) || onRail(x, z) || (z > LR.minZ && (lagoonTaken(x, z) || inLagoonPlot(x, z, 0.08))) || underDeck(x, z)) continue;
        placed.push({ x, z, ox: -nx * side, oz: -nz * side });
      }
    }
  }
  return { lamps: placed, promenade };
}

const built = build();
export const LAMPS: Lamp[] = built.lamps;
export const PROMENADE: Lamp[] = built.promenade;
