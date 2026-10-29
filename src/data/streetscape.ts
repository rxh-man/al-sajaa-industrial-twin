import { AD, LAGOONS, onLand, type AdBuilding } from './abudhabi';
import { LAMPS } from './lamps';
import { mulberry32 } from './rng';
import PARKING from './parking.json';
import {
  JUNCTIONS,
  Obstacles,
  atGrade,
  buildingDistance,
  buildingsNear,
  inBuilding,
  junctionDistance,
  kerbDistance,
  nearestRoad,
  rectClearOfCity,
} from './spatial';
import { VEHICLE_LENGTH, VEHICLE_SCALE, type VehicleKind } from '../three/vehicles/vehicleModels';

/**
 * The streetscape: parked cars, parking lots, villa driveways, loading bays, bus stops, pedestrian
 * crossings, park benches and bins, and shade trees, laid out once from the world geometry
 * (procedural and deterministic; not survey data). Every item is tested against the carriageways,
 * building footprints, palms, lamp poles and the items already placed, so nothing stands in a road,
 * inside a building or on top of something else. Scene units: 1 = 10 m.
 */

/** Parked vehicles use the moving traffic's scale (AbuDhabiTraffic CAR_SCALE) so the two read alike. */
export const PARKED_SCALE = 0.72;
const carLen = (k: VehicleKind) => VEHICLE_LENGTH[k] * PARKED_SCALE;
const CAR_W = 2.0 * VEHICLE_SCALE * PARKED_SCALE; // ≈ body width with mirrors

/** where the streetscape is laid out in detail: the Al Sajaa core and Rahmaniya, stopping short of the lagoon
 *  community (it brings its own cars and palms, scripts/build-lagoons.py) */
export const CORE = { minX: -152, maxX: 120, minZ: -80, maxZ: LAGOONS.meta.rect.minZ - 0.5 } as const;

export interface Parked {
  kind: VehicleKind;
  x: number;
  z: number;
  /** heading about +y (three.js), the car's nose along (sin yaw, cos yaw) */
  yaw: number;
  paint: number;
}
/** an oriented rectangle painted on the ground */
export interface Patch {
  x: number;
  z: number;
  yaw: number;
  len: number;
  wid: number;
}
export interface Lot {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** bay rows run along x when true, along z otherwise */
  alongX: boolean;
  /** bay row bands [start, end] across the lot, perpendicular to the rows */
  rows: [number, number][];
  pitch: number;
}
export interface Stop {
  x: number;
  z: number;
  /** heading of the shelter's long side (parallel to the road) */
  yaw: number;
  /** unit direction from the shelter to the road */
  fx: number;
  fz: number;
}
export interface Crossing {
  x: number;
  z: number;
  /** heading of the road arm the crossing spans */
  yaw: number;
  /** carriageway width to span */
  wid: number;
}
export interface Prop {
  x: number;
  z: number;
  yaw: number;
}
/** an Emirati villa's extras: the footprint, which features it carries, and its compound wall pieces */
export interface Villa {
  b: [number, number, number, number];
  h: number;
  /** a barjeel (wind tower) on the roof */
  tower: boolean;
  /** the side facing the street (0 -z, 1 +z, 2 -x, 3 +x): portico and gate */
  front: number;
}
export interface WallPiece {
  x: number;
  z: number;
  yaw: number;
  len: number;
}
export interface Tree {
  x: number;
  z: number;
  s: number;
}

export const PAINTS = ['#f1f2f4', '#f1f2f4', '#e6e7ea', '#c9ccd1', '#9aa0a8', '#2a2d32', '#121316', '#1d2f55', '#6e1a20', '#b5a68d', '#3b5878', '#8a2e27'];
const CAR_MIX: [VehicleKind, number][] = [
  ['sedan', 0.22],
  ['luxurySedan', 0.07],
  ['coupe', 0.03],
  ['suv', 0.14],
  ['largeSuv', 0.12],
  ['crossover', 0.1],
  ['boxSuv', 0.04],
  ['hatch', 0.07],
  ['pickup', 0.1],
  ['van', 0.05],
  ['taxi', 0.03],
  ['serviceVan', 0.03],
];
const pick = (rnd: () => number): VehicleKind => {
  let u = rnd();
  for (const [k, p] of CAR_MIX) if ((u -= p) <= 0) return k;
  return 'sedan';
};

const HOME = /Residential|Mansion|house|villa|Villa|Townhouse|Apartment/;
const PUBLIC = /Mall|mall|Hotel|Office|office|Tasheel|Hospital|School|school|Museum|Mosque|Masjid|mosque/;
const INDUSTRY = /Factory|Warehouse|warehouse|Workshop|Container|Truck|Plant|Tank|depot|yard|Yard/;
const DOCKS = /^(Logistics warehouse|Warehouse|Factory hall)$/;

const hashOf = (n: number) => {
  const x = Math.sin(n * 91.3458 + 47.2) * 43758.5453;
  return x - Math.floor(x);
};
const inCore = (x: number, z: number) => x > CORE.minX && x < CORE.maxX && z > CORE.minZ && z < CORE.maxZ;
const buildingIndex = new Map<number[], AdBuilding>();
for (const b of AD.buildings) for (const box of b.b) buildingIndex.set(box, b);
function landUseNear(x: number, z: number, reach: number) {
  let home = 0;
  let pub = 0;
  let ind = 0;
  for (const box of buildingsNear(x, z, reach)) {
    const b = buildingIndex.get(box);
    if (!b) continue;
    if (HOME.test(b.n)) home++;
    else if (PUBLIC.test(b.n)) pub++;
    else if (INDUSTRY.test(b.n)) ind++;
  }
  return { home, pub, ind };
}

/** Lay out the streetscape (about 3 s): run by scripts/build-streetscape.mjs into alsajaa-streetscape.json. */
export function buildStreetscape() {
  const rnd = mulberry32(20261029);
  const obs = new Obstacles();
  for (const [x, z] of AD.palms) obs.add(x, z, 0.28);
  for (const l of LAMPS) obs.add(l.x, l.z, 0.2);
  // painted ground that is not a road or a building: the car park, its access lane and footpath stay clear
  {
    const [px0, pz0, px1, pz1] = PARKING.rect;
    for (let x = px0 - 0.3; x <= px1 + 0.3; x += 0.4) for (let z = pz0 - 0.3; z <= pz1 + 0.3; z += 0.4) obs.add(x, z, 0.35);
    for (const line of [PARKING.access, PARKING.walk] as number[][][]) {
      for (let i = 1; i < line.length; i++) {
        const [ax, az] = line[i - 1];
        const [bx, bz] = line[i];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        for (let t = 0; t <= L; t += 0.3) obs.add(ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L, 0.7);
      }
    }
  }
  // the rail corridor (track, ballast and a clearance either side) is not a road, so mark it explicitly
  for (const r of AD.roads) {
    if (r.c !== 'rail') continue;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1];
      const [bx, bz] = r.p[i];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= L; t += 0.4) obs.add(ax + ((bx - ax) * t) / (L || 1), az + ((bz - az) * t) / (L || 1), 0.8);
    }
  }

  const parked: Parked[] = [];
  const lots: Lot[] = [];
  const driveways: Patch[] = [];
  const aprons: Patch[] = [];
  const stops: Stop[] = [];
  const busBays: Patch[] = [];
  const crossings: Crossing[] = [];
  const benches: Prop[] = [];
  const bins: Prop[] = [];
  const trees: Tree[] = [];
  const villas: Villa[] = [];
  const walls: WallPiece[] = [];

  // the Etihad Rail station car park (painted from parking.json): cars in its bays, nosed toward the aisles
  {
    const [px0, pz0, px1, pz1] = PARKING.rect;
    const aisle = 0.8;
    const block = 2 * PARKING.bayDepth + aisle;
    for (let zt = pz0; zt + block <= pz1 + 1e-6; zt += block) {
      for (const [zc, yaw] of [
        [zt + PARKING.bayDepth / 2, 0],
        [zt + PARKING.bayDepth + aisle + PARKING.bayDepth / 2, Math.PI],
      ] as const) {
        for (let x = px0 + PARKING.bayPitch / 2; x < px1; x += PARKING.bayPitch) {
          if (rnd() > 0.55) continue;
          const kind = pick(rnd);
          parked.push({ kind, x, z: zc, yaw, paint: Math.floor(rnd() * PAINTS.length) });
        }
      }
    }
  }

  // 0. Emirati villas: compound walls first (gate on the street side), so everything placed later keeps clear
  for (const b of AD.buildings) {
    if (b.procedural || b.b.length !== 1 || !/Mansion|Small house|Emirati villa|^Villa$/.test(b.n)) continue;
    const [x0, z0, x1, z1] = b.b[0];
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    if (!inCore(cx, cz)) continue;
    const mids = [
      [cx, z0, 0, -1],
      [cx, z1, 0, 1],
      [x0, cz, -1, 0],
      [x1, cz, 1, 0],
    ];
    const gaps = mids.map(([mx, mz, nx, nz]) => kerbDistance(mx + nx * 0.02, mz + nz * 0.02, 4));
    const front = gaps.indexOf(Math.min(...gaps));
    villas.push({ b: [x0, z0, x1, z1], h: b.h, tower: hashOf(b.id) < 0.35, front });
    const O = 0.3;
    const ring = [
      [x0 - O, z0 - O, x1 + O, z0 - O, 0],
      [x0 - O, z1 + O, x1 + O, z1 + O, 1],
      [x0 - O, z0 - O, x0 - O, z1 + O, 2],
      [x1 + O, z0 - O, x1 + O, z1 + O, 3],
    ] as const;
    for (const [ax, az, bx, bz, side] of ring) {
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(L / 0.25));
      const yaw = Math.atan2(bx - ax, bz - az);
      // pieces next to each other on a side are stored as one run (one box when drawn)
      let run: number[] = [];
      const flush = () => {
        if (!run.length) return;
        const t0 = run[0] / n;
        const t1 = (run[run.length - 1] + 1) / n;
        walls.push({ x: ax + (bx - ax) * ((t0 + t1) / 2), z: az + (bz - az) * ((t0 + t1) / 2), yaw, len: L * (t1 - t0) });
        run = [];
      };
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        const gate = side === front && Math.hypot(x - mids[side][0], z - mids[side][1]) < 0.32;
        if (gate || kerbDistance(x, z) < 0.1 || inBuilding(x, z, 0.06) || obs.hit(x, z, 0.05)) {
          flush();
          continue;
        }
        run.push(i);
        obs.add(x, z, 0.07);
      }
      flush();
    }
  }

  /** place a vehicle if its footprint is clear; it then becomes an obstacle */
  const park = (kind: VehicleKind, x: number, z: number, yaw: number, opts: { kerb?: number } = {}) => {
    const len = carLen(kind);
    if (!rectClearOfCity(x, z, yaw, len, CAR_W, opts.kerb ?? 0.04)) return false;
    const r = CAR_W / 2;
    const ux = Math.sin(yaw);
    const uz = Math.cos(yaw);
    for (const t of [-0.5, -0.17, 0.17, 0.5]) if (obs.hit(x + ux * len * t, z + uz * len * t, r)) return false;
    obs.addRect(x, z, yaw, len, CAR_W);
    parked.push({ kind, x, z, yaw, paint: Math.floor(rnd() * PAINTS.length) });
    return true;
  };

  // 1. bus stops on the main roads (shelter on the verge, a painted bay at the kerb), every ~20 units
  for (const r of AD.roads) {
    if (!atGrade(r) || !/^(trunk|secondary)$/.test(r.c) || r.l || r.x === 1) continue;
    let acc = 0;
    let next = 6 + rnd() * 10;
    let side = rnd() < 0.5 ? 1 : -1;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1];
      const [bx, bz] = r.p[i];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-6) continue;
      const tx = (bx - ax) / L;
      const tz = (bz - az) / L;
      while (next <= acc + L) {
        const u = (next - acc) / L;
        const cx = ax + tx * u * L;
        const cz = az + tz * u * L;
        next += 20;
        side = -side;
        if (!inCore(cx, cz) || junctionDistance(cx, cz) < 2.2) continue;
        const nx = -tz * side;
        const nz = tx * side;
        const off = r.w / 2 + 0.36;
        const x = cx + nx * off;
        const z = cz + nz * off;
        const yaw = Math.atan2(tx, tz);
        if (!onLand(x, z) || !rectClearOfCity(x, z, yaw, 0.95, 0.34, 0.03) || obs.hit(x, z, 0.5)) continue;
        obs.addRect(x, z, yaw, 1.2, 0.5);
        stops.push({ x, z, yaw, fx: -nx, fz: -nz });
        busBays.push({ x: cx + nx * (r.w / 2 - 0.12), z: cz + nz * (r.w / 2 - 0.12), yaw, len: 1.5, wid: 0.2 });
        bins.push({ x: x + tx * 0.62, z: z + tz * 0.62, yaw });
        obs.add(x + tx * 0.62, z + tz * 0.62, 0.08);
      }
      acc += L;
    }
  }

  // 2. pedestrian crossings on each arm of the junctions of main roads, just back from the junction box
  for (const j of JUNCTIONS) {
    if (!inCore(j.x, j.z)) continue;
    if (!j.arms.some((a) => /^(trunk|secondary|primary)$/.test(a.road.c))) continue;
    if (j.arms.some((a) => a.road.l)) continue; // no zebras across the Emirates Road carriageways
    const hwMax = Math.max(...j.arms.map((a) => a.road.w / 2));
    for (const a of j.arms) {
      const d = hwMax + 0.4;
      const x = j.x + a.dx * d;
      const z = j.z + a.dz * d;
      // the crossing must lie on its own arm's carriageway, not inside another road's
      const near = nearestRoad(x, z, 2);
      if (!near || near.seg.road !== a.road) continue;
      crossings.push({ x, z, yaw: Math.atan2(a.dx, a.dz), wid: a.road.w });
    }
  }

  // 3. loading bays at the baseline warehouses and factory halls: an apron and trucks backed up to the wall
  for (const b of AD.buildings) {
    if (b.procedural || !DOCKS.test(b.n) || b.b.length !== 1) continue;
    const [x0, z0, x1, z1] = b.b[0];
    const sides = [
      { mx: (x0 + x1) / 2, mz: z0, nx: 0, nz: -1, span: x1 - x0 },
      { mx: (x0 + x1) / 2, mz: z1, nx: 0, nz: 1, span: x1 - x0 },
      { mx: x0, mz: (z0 + z1) / 2, nx: -1, nz: 0, span: z1 - z0 },
      { mx: x1, mz: (z0 + z1) / 2, nx: 1, nz: 0, span: z1 - z0 },
    ];
    // the side facing a road, with room for a truck between the wall and the kerb
    const ranked = sides
      .map((s) => ({ ...s, gap: kerbDistance(s.mx + s.nx * 0.05, s.mz + s.nz * 0.05, 4) }))
      .filter((s) => s.gap > 1.25 && s.gap < 4 && s.span > 1.6)
      .sort((p, q) => p.gap - q.gap);
    const s = ranked[0];
    if (!s) continue;
    const depth = Math.min(s.gap - 0.1, 1.4);
    const yaw = Math.atan2(s.nx, s.nz);
    const ax = s.mx + s.nx * depth / 2;
    const az = s.mz + s.nz * depth / 2;
    if (!rectClearOfCity(ax, az, yaw, depth - 0.05, Math.min(s.span, 3.2) * 0.9, 0.02)) continue;
    aprons.push({ x: ax, z: az, yaw, len: depth, wid: Math.min(s.span, 3.2) });
    const tx = -s.nz;
    const tz = s.nx;
    const n = s.span > 2.6 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const kind: VehicleKind = rnd() < 0.5 ? 'boxTruck' : rnd() < 0.6 ? 'reefer' : 'flatbed';
      const off = n === 1 ? 0 : (i - 0.5) * 0.9;
      const len = carLen(kind);
      if (len > depth) continue;
      park(kind, s.mx + tx * off + s.nx * (len / 2 + 0.04), s.mz + tz * off + s.nz * (len / 2 + 0.04), yaw + Math.PI);
    }
  }

  // 4. villa and house driveways: a paved strip from the kerb to the front wall, usually with a car on it
  for (const b of AD.buildings) {
    if (!/Mansion|Small house|Emirati villa|^Villa$|Townhouse/.test(b.n) || b.b.length < 1) continue;
    const [x0, z0, x1, z1] = b.b[0];
    if (!inCore((x0 + x1) / 2, (z0 + z1) / 2)) continue;
    const sides = [
      { mx: (x0 + x1) / 2, mz: z0, nx: 0, nz: -1 },
      { mx: (x0 + x1) / 2, mz: z1, nx: 0, nz: 1 },
      { mx: x0, mz: (z0 + z1) / 2, nx: -1, nz: 0 },
      { mx: x1, mz: (z0 + z1) / 2, nx: 1, nz: 0 },
    ]
      .map((s) => ({ ...s, gap: kerbDistance(s.mx + s.nx * 0.02, s.mz + s.nz * 0.02, 4) }))
      .filter((s) => s.gap > 0.35 && s.gap < 3)
      .sort((p, q) => p.gap - q.gap);
    const s = sides[0];
    if (!s) continue;
    const len = s.gap;
    const yaw = Math.atan2(s.nx, s.nz);
    const cx = s.mx + s.nx * len / 2;
    const cz = s.mz + s.nz * len / 2;
    if (!rectClearOfCity(cx, cz, yaw, len - 0.06, 0.36, 0.0) || obs.hit(cx, cz, 0.15)) continue;
    driveways.push({ x: cx, z: cz, yaw, len, wid: 0.4 });
    if (rnd() < 0.72 && len > carLen('suv') + 0.1) {
      const kind = rnd() < 0.5 ? (rnd() < 0.6 ? 'largeSuv' : 'suv') : pick(rnd);
      const cl = carLen(kind);
      park(kind, s.mx + s.nx * (cl / 2 + 0.06), s.mz + s.nz * (cl / 2 + 0.06), yaw + (rnd() < 0.5 ? 0 : Math.PI));
    } else obs.addRect(cx, cz, yaw, len, 0.4);
  }

  // 5. parking lots and landscaping on the empty plots of the core: free cells next to a road,
  //    grown into rectangles; plots by homes, shops and public buildings become car parks,
  //    plots among the yards and factories get shade trees
  const C = 0.5;
  const nx = Math.round((CORE.maxX - CORE.minX) / C);
  const nz = Math.round((CORE.maxZ - CORE.minZ) / C);
  const free = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = CORE.minX + (i + 0.5) * C;
      const z = CORE.minZ + (j + 0.5) * C;
      if (!onLand(x, z) || kerbDistance(x, z) < 0.3 || inBuilding(x, z, 0.3) || obs.hit(x, z, 0.3)) continue;
      free[i * nz + j] = 1;
    }
  const used = new Uint8Array(nx * nz);
  const isFree = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz && free[i * nz + j] === 1 && used[i * nz + j] === 0;
  const MAXW = 28; // cells (14 units)
  const MAXH = 20;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      if (!isFree(i, j)) continue;
      let w = 0;
      while (w < MAXW && isFree(i + w, j)) w++;
      let h = 0;
      grow: while (h < MAXH) {
        for (let k = 0; k < w; k++) if (!isFree(i + k, j + h)) break grow;
        h++;
      }
      if (w < 7 || h < 5) {
        used[i * nz + j] = 1;
        continue;
      }
      for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) used[(i + a) * nz + (j + b)] = 1;
      const x0 = CORE.minX + i * C;
      const z0 = CORE.minZ + j * C;
      const x1 = x0 + w * C;
      const z1 = z0 + h * C;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const nearRoad = Math.min(kerbDistance(x0 - 0.1, cz), kerbDistance(x1 + 0.1, cz), kerbDistance(cx, z0 - 0.1), kerbDistance(cx, z1 + 0.1));
      if (nearRoad > 0.6) continue; // no access: leave it
      const use = landUseNear(cx, cz, 6);
      if (use.home + use.pub > use.ind) {
        // car park: bay rows (depth 0.8) back to back, an aisle (0.75) between each pair
        const alongX = x1 - x0 >= z1 - z0;
        const across = alongX ? z1 - z0 : x1 - x0;
        const rows: [number, number][] = [];
        const start = alongX ? z0 : x0;
        let p = 0.1;
        while (p + 0.8 <= across - 0.1) {
          rows.push([start + p, start + p + 0.8]);
          p += 0.8;
          if (p + 0.8 <= across - 0.1 && rows.length % 2 === 1) {
            rows.push([start + p, start + p + 0.8]);
            p += 0.8;
          }
          p += 0.75;
        }
        if (!rows.length) continue;
        const lot: Lot = { x0, z0, x1, z1, alongX, rows, pitch: 0.4 };
        lots.push(lot);
        const occ = 0.45 + rnd() * 0.4;
        rows.forEach(([r0, r1], ri) => {
          const mid = (r0 + r1) / 2;
          const head = ri % 2 === 0 ? 1 : -1; // nose toward the aisle
          const from = (alongX ? x0 : z0) + 0.25;
          const to = (alongX ? x1 : z1) - 0.25;
          for (let q = from; q + lot.pitch <= to; q += lot.pitch) {
            if (rnd() > occ) continue;
            const kind = pick(rnd);
            const c = q + lot.pitch / 2;
            const yaw = alongX ? (head > 0 ? 0 : Math.PI) : head > 0 ? Math.PI / 2 : -Math.PI / 2;
            if (alongX) park(kind, c, mid, yaw);
            else park(kind, mid, c, yaw);
          }
        });
      } else if (use.ind > 0 || use.home + use.pub === 0) {
        // shade trees in a loose grid, kept off the plot edges
        for (let x = x0 + 0.7; x < x1 - 0.5; x += 1.3)
          for (let z = z0 + 0.7; z < z1 - 0.5; z += 1.3) {
            const tx = x + (rnd() - 0.5) * 0.5;
            const tz = z + (rnd() - 0.5) * 0.5;
            if (rnd() < 0.3 || obs.hit(tx, tz, 0.35)) continue;
            obs.add(tx, tz, 0.3);
            trees.push({ x: tx, z: tz, s: 0.75 + rnd() * 0.5 });
          }
      }
    }

  // 6. kerbside parking in front of homes, shops and offices: perpendicular bays on the verge
  const roads = [...AD.roads]
    .filter((r) => atGrade(r) && /^(residential|secondary|unclassified|tertiary)$/.test(r.c) && !r.l)
    .sort((a, b) => Math.hypot(...a.p[0]) - Math.hypot(...b.p[0]));
  const MAX_PARKED = 2100; // includes the ~460 in the station car park
  for (const r of roads) {
    if (parked.length >= MAX_PARKED) break;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1];
      const [bx, bz] = r.p[i];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-6) continue;
      const tx = (bx - ax) / L;
      const tz = (bz - az) / L;
      for (let s = 0.2; s < L; s += 0.42) {
        const cx = ax + tx * s;
        const cz = az + tz * s;
        if (!inCore(cx, cz) || junctionDistance(cx, cz) < 1.6) continue;
        for (const side of [1, -1]) {
          if (rnd() > 0.55) continue;
          const nx2 = -tz * side;
          const nz2 = tx * side;
          const kind = pick(rnd);
          const len = carLen(kind);
          const off = r.w / 2 + 0.1 + len / 2;
          const x = cx + nx2 * off;
          const z = cz + nz2 * off;
          // only where there is a frontage to park for, behind the bay
          const behind = buildingDistance(cx + nx2 * (off + len / 2 + 0.2), cz + nz2 * (off + len / 2 + 0.2), 2);
          if (behind > 1.2) continue;
          const use = landUseNear(x, z, 2.5);
          if (use.home + use.pub === 0) continue;
          park(kind, x, z, Math.atan2(nx2, nz2) + (rnd() < 0.5 ? 0 : Math.PI));
        }
      }
    }
  }

  // 7. park furniture: benches along the inside of each park's edge, with a bin by every other one
  for (const p of AD.parks) {
    const cx = p.p.reduce((s, q) => s + q[0], 0) / p.p.length;
    const cz = p.p.reduce((s, q) => s + q[1], 0) / p.p.length;
    if (!inCore(cx, cz)) continue;
    let n = 0;
    for (let i = 0; i < p.p.length && n < 4; i++) {
      const a = p.p[i];
      const b = p.p[(i + 1) % p.p.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 2) continue;
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const ix = cx - mx;
      const iz = cz - mz;
      const il = Math.hypot(ix, iz) || 1;
      const x = mx + (ix / il) * 0.45;
      const z = mz + (iz / il) * 0.45;
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      if (kerbDistance(x, z) < 0.2 || inBuilding(x, z, 0.15) || obs.hit(x, z, 0.3)) continue;
      obs.addRect(x, z, yaw, 0.5, 0.2);
      benches.push({ x, z, yaw });
      if (n % 2 === 0) {
        const bx2 = x + Math.sin(yaw) * 0.45;
        const bz2 = z + Math.cos(yaw) * 0.45;
        if (!obs.hit(bx2, bz2, 0.08) && kerbDistance(bx2, bz2) > 0.15) bins.push({ x: bx2, z: bz2, yaw });
      }
      n++;
    }
  }

  return { parked, lots, driveways, aprons, stops, busBays, crossings, benches, bins, trees, villas, walls };
}

export type Streetscape = ReturnType<typeof buildStreetscape>;
