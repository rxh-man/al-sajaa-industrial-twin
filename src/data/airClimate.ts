import { AD } from './abudhabi';
import { placePlants } from '../three/Vegetation';

/**
 * Air, pollution and climate model for the twin. Everything here is SIMULATED:
 * - which factory emits which pollutant, and how much, is a deterministic simulated assignment
 *   (no real emissions register is used);
 * - the oxygen and CO2 rates per tree are published rule-of-thumb assumptions, to be verified.
 * Factory and tree counts come from the scene data itself.
 * Scene units: 1 = 10 m.
 */

export const POLLUTANTS = ['PM2.5 (dust)', 'NOx (exhaust)', 'SO2 (sulphur)', 'CO2 (greenhouse gas)'] as const;
export type Pollutant = (typeof POLLUTANTS)[number];

/** Simulated stack output per level (0 = none). CO2 in tonnes per year, simulated. */
const CO2_T_PER_YEAR = [0, 900, 2200, 4200];

/** ASSUMPTION (verify): a mature shade tree produces about 118 kg O2 and absorbs about 22 kg CO2 per year. */
export const O2_KG_PER_TREE_YEAR = 118;
export const CO2_KG_ABSORBED_PER_TREE_YEAR = 22;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Factory {
  id: number;
  x: number;
  z: number;
  /** roof height in scene units */
  top: number;
  /** simulated level 0–3 per pollutant; 0 means the factory does not emit that pollutant */
  levels: number[];
  co2T: number;
  /** pollutant types this factory contributes to */
  contributes: number;
  /** simulated monthly emission index, Jan–Dec, 0–100 */
  monthly: number[];
}

function hash(n: number, k: number) {
  let s = (Math.imul(n + 1, 2654435761) ^ Math.imul(k + 7, 40503)) >>> 0;
  s ^= s >>> 13;
  s = Math.imul(s, 1274126177) >>> 0;
  return (s % 1000) / 1000;
}

export const FACTORIES: Factory[] = AD.buildings
  .filter((b) => b.n === 'Factory hall' && b.b.length > 0)
  .map((b) => {
    const [x0, z0, x1, z1] = b.b[0];
    const levels: number[] = POLLUTANTS.map((_, k) => {
      const r = hash(b.id, k);
      return r < 0.35 ? 0 : r < 0.7 ? 1 : r < 0.92 ? 2 : 3;
    });
    // every factory emits CO2 at least at level 1, so the climate total covers all of them
    if (levels[3] === 0) levels[3] = 1;
    const co2T = CO2_T_PER_YEAR[levels[3]];
    return {
      id: b.id,
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      top: (b.y ?? 0) + b.h,
      levels,
      co2T,
      contributes: levels.filter((l) => l > 0).length,
      monthly: MONTHS.map((_, m) => {
        // hotter months run higher; each factory has its own simulated swing
        const season = 0.85 + 0.25 * Math.sin(((m - 3) / 12) * Math.PI * 2);
        const swing = 0.8 + 0.4 * hash(b.id, 30 + m);
        return Math.round(Math.min(100, (levels.reduce((a, l) => a + l, 0) / 12) * 100 * season * swing));
      }),
    };
  });

/** Factories contributing to each pollutant (count of factories with level > 0). */
export const CONTRIBUTORS: { name: Pollutant; factories: number; highLevel: number }[] = POLLUTANTS.map((name, k) => ({
  name,
  factories: FACTORIES.filter((f) => f.levels[k] > 0).length,
  highLevel: FACTORIES.filter((f) => f.levels[k] >= 2).length,
}));

export const FACTORY_COUNT = FACTORIES.length;
/** Factories that emit at least one pollutant (every factory does, by construction). */
export const EMITTING_FACTORIES = FACTORIES.filter((f) => f.contributes > 0).length;
export const POLLUTANT_TYPES_COVERED = POLLUTANTS.length;
export const FACTORY_CO2_T = FACTORIES.reduce((a, f) => a + f.co2T, 0);

/** Shade trees (kind 0) in the scene. Palms and hedges are left out of the oxygen calculation. */
const PLANTS = placePlants();
export const SHADE_TREES = PLANTS.filter((p) => p.kind === 0);
export const SHADE_TREE_COUNT = SHADE_TREES.length;
export const TREE_O2_T_PER_YEAR = (SHADE_TREE_COUNT * O2_KG_PER_TREE_YEAR) / 1000;
export const TREE_CO2_ABSORBED_T_PER_YEAR = (SHADE_TREE_COUNT * CO2_KG_ABSORBED_PER_TREE_YEAR) / 1000;
/** share of the simulated factory CO2 that the shade trees absorb */
export const CO2_OFFSET_PCT = FACTORY_CO2_T > 0 ? (TREE_CO2_ABSORBED_T_PER_YEAR / FACTORY_CO2_T) * 100 : 0;
