import { AD_BASE, LAND_POLYS, type XZ } from './abudhabi';
import { UNIT_METERS } from './city';

/**
 * Land area of the world, measured from the land polygons themselves (shoelace formula).
 * The baseline is the original Al Sajaa outline; the world adds the procedural districts.
 * Scene units are 10 m, so one unit² is 100 m².
 */
export function polygonArea(poly: XZ[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a) / 2;
}

const unitsToKm2 = (u: number) => (u * UNIT_METERS * UNIT_METERS) / 1e6;

export const COVERAGE = (() => {
  const baseUnits = polygonArea(AD_BASE.land);
  const worldUnits = LAND_POLYS.reduce((s, p) => s + polygonArea(p), 0);
  return {
    baseKm2: unitsToKm2(baseUnits),
    worldKm2: unitsToKm2(worldUnits),
    ratio: worldUnits / baseUnits,
  };
})();
