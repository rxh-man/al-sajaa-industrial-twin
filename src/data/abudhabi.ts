import raw from './alsajaa.json';
import expansionRaw from './alsajaa-expansion.json';
import { ALSAJAA_INLAND, ALSAJAA_MAP_SOURCE } from '../config/overrides';

/**
 * Al Sajaa world data. Scene units: 1 = 10 m.
 * - alsajaa.json: the locked procedural baseline (hash-checked; never edited). The simulated pipes,
 *   sensors, incident and utilities are authored in this frame.
 * - alsajaa-expansion.json: procedural districts (scripts/build-expansion.py).
 * - alsajaa-osm.json (optional): the OpenStreetMap extract, built by scripts/build-sajaa.mjs.
 *   Used only when ALSAJAA_MAP_SOURCE is 'osm' and the file exists (see src/config/overrides.ts).
 * Map data © OpenStreetMap contributors (ODbL), where the OSM file is used.
 */

export type XZ = [number, number];
/** Abu Dhabi names that the procedural baseline carries; shown with Al Sajaa-safe names instead. */
export const NAME_FIX: Record<string, string> = {
  'Khalifa Bin Zayed Street': 'Al Sajaa Main Road (name to verify)',
  'Khalifa Bin Zayed St': 'Al Sajaa Main Road (name to verify)',
  'Corniche Street': 'Unnamed road (name to verify)',
  'Corniche St': 'Unnamed road (name to verify)',
};
const fixName = (n: string) => NAME_FIX[n] ?? n;
/** The incident's road, as it appears after NAME_FIX. */
export const MAIN_ROAD = 'Al Sajaa Main Road (name to verify)';
/** Road hidden inland (no coast): matched by the renamed label, not by an Abu Dhabi name. */
export const UNNAMED_COAST_ROAD = 'Unnamed road (name to verify)';
export type AdKind = 'mosque' | 'mall' | 'hospital' | 'school' | 'fort' | 'roof' | 'utility' | 'hotel' | 'house' | 'office' | 'tower' | 'residential' | 'building' | 'pool';

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
  /** lanes per direction (highways), optional */
  l?: number;
  /** 1 = this polyline is one carriageway of a divided road */
  x?: 0 | 1;
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
  /** true for procedurally generated expansion buildings (rendered with the variant catalogue) */
  procedural?: boolean;
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

/** The original Al Sajaa baseline, unchanged. Simulation logic (utilities, incident, lamps) reads this. */
const BASELINE = raw as unknown as AdData;
/** The OpenStreetMap extract, when built (absent files give an empty map, so the baseline is used). */
const osmModules = import.meta.glob('./alsajaa-osm.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const OSM = (Object.values(osmModules)[0] as AdData | undefined) ?? null;
/** Frame used for the base map: the baseline unless the OSM map is selected and present. */
/** The baseline's coast-side trunk road (its geometry follows the old seawall, z ≈ 29–34). Al Sajaa is inland, so it is
 *  not rendered at all: its asphalt, lamps and traffic would otherwise sit on the former coast line. */
const isInlandCoastRoad = (r: AdRoad) => ALSAJAA_INLAND && r.n === 'Corniche Street';
export const AD_BASE: AdData = ALSAJAA_MAP_SOURCE === 'osm' && OSM
  ? OSM
  : {
      ...BASELINE,
      roads: BASELINE.roads.filter((r) => !isInlandCoastRoad(r)).map((r) => ({ ...r, n: fixName(r.n) })),
      labels: BASELINE.labels.map((l) => ({ ...l, n: fixName(l.n) })),
    };
export const MAP_SOURCE_IN_USE: 'baseline' | 'osm' = ALSAJAA_MAP_SOURCE === 'osm' && OSM ? 'osm' : 'baseline';
if (ALSAJAA_MAP_SOURCE === 'osm' && !OSM) console.warn('[Al Sajaa] src/data/alsajaa-osm.json is missing; showing the baseline layout instead.');
export const BASE_RECT = AD_BASE.meta.rect;

/** The procedural three-side expansion (src/data/alsajaa-expansion.json, see scripts/build-expansion.py). */
const EXP = expansionRaw as unknown as Pick<AdData, 'roads' | 'buildings' | 'parks' | 'palms' | 'places' | 'labels'> & {
  land: { d: string; p: XZ[] }[];
  meta: { combinedRect: { minX: number; maxX: number; minZ: number; maxZ: number } };
};

/** Rendering view of the world: baseline plus expansion. Baseline records are kept as they are, first. */
export const AD: AdData = {
  ...AD_BASE,
  meta: { ...AD_BASE.meta, rect: EXP.meta.combinedRect },
  roads: [...AD_BASE.roads, ...EXP.roads],
  buildings: [...AD_BASE.buildings, ...EXP.buildings],
  parks: [...AD_BASE.parks, ...EXP.parks],
  palms: [...AD_BASE.palms, ...EXP.palms],
  places: [...AD_BASE.places, ...EXP.places],
  labels: [...AD_BASE.labels, ...EXP.labels],
};
export const AD_RECT = AD.meta.rect;
/** Every land polygon of the world: the baseline outline first, then the expansion districts. */
export const LAND_POLYS: XZ[][] = [AD_BASE.land, ...EXP.land.map((l) => l.p)];
/** Shown on the main view: the district is a procedural layout, and the operational data is simulated. */
export const MAP_CREDIT = 'Procedural layout based on an industrial-area plan (not survey data) · sensors, pipes, incident and forecast are simulated';

export function pointInPoly(x: number, z: number, poly: XZ[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export const onLandBase = (x: number, z: number) => pointInPoly(x, z, AD_BASE.land);
export const onLand = (x: number, z: number) => LAND_POLYS.some((poly) => pointInPoly(x, z, poly));

export function place(role: AdPlace['role'], name?: RegExp): AdPlace | undefined {
  return AD.places.find((p) => p.role === role && (!name || name.test(p.n)));
}

/** Building ids used for hover/selection; offset so they never clash with anything procedural. */
export const AD_BUILDING_ID0 = 100000;
