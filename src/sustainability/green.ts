import { AD, LAGOONS } from '../data/abudhabi';
import { STREETSCAPE } from '../data/streetscapeData';
import { districtAt } from './districts';

/**
 * Green infrastructure inventory: every tree and palm actually placed in the 3D city (street and plot trees from
 * the streetscape, the lagoon community's trees and palms, and the verge/roadside palms), plus park and lawn areas.
 * Counts and areas are from the layout. Uptake, oxygen, canopy and irrigation per plant are assumptions.
 *
 * Oxygen is derived from the CO₂ uptake by stoichiometry (each tonne of CO₂ fixed releases 32/44 t of O₂), so the
 * two are consistent; it is a separate indicator and is never subtracted from emissions.
 */

export interface PlantType {
  id: 'shade' | 'palm';
  label: string;
  labelAr: string;
  /** net CO₂ fixed per mature plant per year, kg (assumption, verify locally) */
  co2Kg: number;
  /** crown radius, m (assumption) */
  crownM: number;
  /** irrigation, litres per plant per day (assumption for an arid climate) */
  litresDay: number;
}

export const PLANT_TYPES: Record<'shade' | 'palm', PlantType> = {
  shade: { id: 'shade', label: 'Shade trees (Ghaf / Neem type)', labelAr: 'أشجار الظل', co2Kg: 22, crownM: 4, litresDay: 60 },
  palm: { id: 'palm', label: 'Palms (date / ornamental)', labelAr: 'نخيل', co2Kg: 10, crownM: 2.5, litresDay: 100 },
};
export const O2_PER_CO2 = 32 / 44;
/** irrigated lawn and park planting, litres per m² per day (assumption) */
export const LAWN_L_M2_DAY = 5;

export interface PlantPoint {
  type: 'shade' | 'palm';
  x: number;
  z: number;
  source: 'streetscape' | 'lagoons' | 'roadside';
  district: string;
}

export const PLANTS: PlantPoint[] = [
  ...STREETSCAPE.trees.map((t) => ({ type: 'shade' as const, x: t.x, z: t.z, source: 'streetscape' as const, district: districtAt(t.x, t.z).id })),
  ...(LAGOONS.trees as { x: number; z: number }[]).map((t) => ({ type: 'shade' as const, x: t.x, z: t.z, source: 'lagoons' as const, district: districtAt(t.x, t.z).id })),
  ...(LAGOONS.palms as [number, number, number][]).map(([x, z]) => ({ type: 'palm' as const, x, z, source: 'lagoons' as const, district: districtAt(x, z).id })),
  ...AD.palms.map(([x, z]) => ({ type: 'palm' as const, x, z, source: 'roadside' as const, district: districtAt(x, z).id })),
];

function polyM2(p: [number, number][]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i];
    const [x1, z1] = p[(i + 1) % p.length];
    s += x0 * z1 - x1 * z0;
  }
  return (Math.abs(s) / 2) * 100;
}

/** park polygons from the city data, with their area (m²) and district */
export const PARKS = AD.parks.map((p) => {
  const pts = p.p as [number, number][];
  const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length;
  const cz = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  return { name: p.n, m2: polyM2(pts), x: cx, z: cz, pts, district: districtAt(cx, cz).id };
});
export const LAWN_M2 = LAGOONS.lawns.reduce((a, l) => a + polyM2(l as [number, number][]), 0);

export function greenSummary(extraShadeTrees = 0) {
  const shade = PLANTS.filter((p) => p.type === 'shade').length + extraShadeTrees;
  const palms = PLANTS.filter((p) => p.type === 'palm').length;
  const co2T = (shade * PLANT_TYPES.shade.co2Kg + palms * PLANT_TYPES.palm.co2Kg) / 1000;
  const canopyM2 = shade * Math.PI * PLANT_TYPES.shade.crownM ** 2 + palms * Math.PI * PLANT_TYPES.palm.crownM ** 2;
  const parkM2 = PARKS.reduce((a, p) => a + p.m2, 0) + LAWN_M2;
  const irrigationM3Day = (shade * PLANT_TYPES.shade.litresDay + palms * PLANT_TYPES.palm.litresDay) / 1000 + (parkM2 * LAWN_L_M2_DAY) / 1000;
  return { shade, palms, total: shade + palms, co2T, o2T: co2T * O2_PER_CO2, canopyM2, parkM2, irrigationM3Day };
}
