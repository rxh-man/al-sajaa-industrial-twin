import { AD } from './abudhabi';
import { PLACES } from './placeIndex';
import { FACTORIES, SHADE_TREES } from './airClimate';

/**
 * SIMULATED heat, traffic and noise exposure for named places. These are model estimates from the
 * scene layout (road class, road density, nearby factories and trees), not measurements.
 * Scene units: 1 = 10 m. Radii below are in scene units.
 */

const NEAR = 15; // 150 m: direct neighbourhood
const CONGESTED = 30; // 300 m: wider area used for congestion

/** traffic weight per OSM highway class; unknown classes count as minor streets */
const CLASS_WEIGHT: Record<string, number> = {
  motorway: 3,
  trunk: 2.5,
  primary: 2,
  secondary: 1.5,
  tertiary: 1,
};

const SEGS: { x: number; z: number; w: number }[] = [];
for (const r of AD.roads) {
  const w = CLASS_WEIGHT[r.c] ?? 0.5;
  if (r.c === 'rail') continue;
  for (let i = 1; i < r.p.length; i++) {
    SEGS.push({ x: (r.p[i - 1][0] + r.p[i][0]) / 2, z: (r.p[i - 1][1] + r.p[i][1]) / 2, w });
  }
}

const near = (px: number, pz: number, r: number, x: number, z: number) => Math.hypot(px - x, pz - z) <= r;

export interface Exposure {
  name: string;
  /** simulated noise level in dB(A) */
  noiseDb: number;
  /** relative traffic congestion index, 0–100 (simulated) */
  traffic: number;
  /** simulated surface heat above a tree-shaded baseline, °C */
  heatC: number;
  factories: number;
  /** road segments within the congestion radius */
  roads: number;
}

function exposureAt(name: string, x: number, z: number): Exposure {
  let trafficW = 0;
  let roads = 0;
  for (const s of SEGS) {
    if (near(x, z, CONGESTED, s.x, s.z)) {
      trafficW += s.w;
      roads++;
    }
  }
  const factories = FACTORIES.filter((f) => near(x, z, CONGESTED, f.x, f.z)).length;
  const factoriesNear = FACTORIES.filter((f) => near(x, z, NEAR, f.x, f.z)).length;
  const trees = SHADE_TREES.filter((t) => near(x, z, NEAR, t.x, t.z)).length;
  const roadsNear = SEGS.filter((s) => near(x, z, NEAR, s.x, s.z)).length;

  // noise: 45 dB quiet baseline, rising with road weight nearby and a factory within 150 m
  const noiseDb = Math.round(45 + 6 * Math.log10(1 + trafficW) + 4 * factoriesNear);
  // heat: asphalt near the place adds heat, trees take it back, factories add exhaust heat
  const heatC = Math.max(0, Math.min(6, Math.round((roadsNear * 0.08 + factoriesNear * 0.6 - trees * 0.12) * 10) / 10));
  return {
    name,
    noiseDb,
    traffic: Math.min(100, Math.round(trafficW / 3)),
    heatC,
    factories,
    roads,
  };
}

export const EXPOSURE_BY_PLACE: Exposure[] = PLACES.filter((p) => p.kind === 'landmark').map((p) => exposureAt(p.name, p.x, p.z));

/** the most congested places first */
export const MOST_CONGESTED = [...EXPOSURE_BY_PLACE].sort((a, b) => b.traffic - a.traffic).slice(0, 6);
/** the hottest places first */
export const HOTTEST = [...EXPOSURE_BY_PLACE].sort((a, b) => b.heatC - a.heatC).slice(0, 6);
/** the loudest places first */
export const LOUDEST = [...EXPOSURE_BY_PLACE].sort((a, b) => b.noiseDb - a.noiseDb).slice(0, 6);
