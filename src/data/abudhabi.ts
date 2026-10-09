import raw from './alsajaa.json';

/**
 * Downtown Abu Dhabi (Al Markaziyah, Corniche) from OpenStreetMap, prepared by
 * scripts/build-abudhabi.mjs. Scene units: 1 = 10 m. Khalifa Street runs along z = 0,
 * the Corniche sea lies on the +z side. Map data © OpenStreetMap contributors (ODbL).
 * Roads, buildings, parks and the coast are real; pipes, sensors and the incident are not.
 */

export type XZ = [number, number];
export type AdKind = 'mosque' | 'mall' | 'hospital' | 'school' | 'fort' | 'roof' | 'utility' | 'hotel' | 'house' | 'office' | 'tower' | 'residential' | 'building';

export interface AdRoad {
  /** English street name when OSM has one */
  n: string;
  /** OSM highway class */
  c: string;
  /** carriageway width, scene units */
  w: number;
  o: 0 | 1;
  /** 1 = tunnel / underpass */
  t: 0 | 1;
  p: XZ[];
  /** OSM node ids per point; shared ids are real junctions */
  k: string[];
}

export interface AdBuilding {
  id: number;
  n: string;
  k: AdKind;
  h: number;
  y: number;
  c: XZ;
  /** axis-aligned boxes [minX, minZ, maxX, maxZ] that trace the footprint */
  b: [number, number, number, number][];
}

export interface AdPlace {
  role: 'hospital' | 'school' | 'depot' | 'substation' | 'exchange' | 'mall' | 'landmark' | 'mosque';
  n: string;
  x: number;
  z: number;
  h: number;
  /** metres from the incident site */
  m: number;
}

interface AdData {
  meta: { source: string; fetched: string | null; origin: { lat: number; lon: number }; rotationDeg: number; unitMeters: number; rect: { minX: number; maxX: number; minZ: number; maxZ: number } };
  land: XZ[];
  coast: XZ[];
  roads: AdRoad[];
  buildings: AdBuilding[];
  parks: { n: string; p: XZ[] }[];
  palms: [number, number, number][];
  places: AdPlace[];
  labels: { n: string; x: number; z: number; a: number }[];
}

export const AD = raw as unknown as AdData;
export const AD_RECT = AD.meta.rect;
export const MAP_CREDIT = 'Map data © OpenStreetMap contributors · Natural Earth';

export function pointInPoly(x: number, z: number, poly: XZ[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export const onLand = (x: number, z: number) => pointInPoly(x, z, AD.land);

export function place(role: AdPlace['role'], name?: RegExp): AdPlace | undefined {
  return AD.places.find((p) => p.role === role && (!name || name.test(p.n)));
}

/** Building ids used for hover/selection; offset so they never clash with anything procedural. */
export const AD_BUILDING_ID0 = 100000;
