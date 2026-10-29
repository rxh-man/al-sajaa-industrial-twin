import raw from './alsajaa.json';
import expansionRaw from './alsajaa-expansion.json';
import fixesRaw from './alsajaa-fixes.json';
import lagoonsRaw from './alsajaa-lagoons.json';
import interchangeRaw from './alsajaa-interchange.json';
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
/** Map names never carry the '(to be placed manually)' marker; the service guide shows the status instead. */
const plainName = (n: string) => n.replace(/\s*\(to be placed manually\)/i, '');
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
  /** deck height per point (elevated roads with a rising and falling profile: the interchange flyover) */
  y?: number[];
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

/**
 * Corrections over the baseline and the expansion (src/data/alsajaa-fixes.json, built by scripts/build-world-fixes.py and
 * checked by scripts/validate-world.py): connector and boundary roads that close dead ends and join the networks,
 * streets cut either side of the rail so it is crossed at four underpasses only, footprints trimmed off
 * carriageways and out of each other, palms moved off roads, and the reservoir moved off a labour camp. Records keep their order and ids, so building
 * indices (picking, roofs) are unchanged. scripts/world_lib.py apply_fixes mirrors this function.
 */
interface WorldFixes {
  moveVertex: { id: string; to: XZ }[];
  dropVertex: { id: string }[];
  /** a vertex removed mid-road, splitting the road there (streets cut either side of the rail) */
  cutVertex?: { id: string }[];
  insertVertex: { after: string; before: string; at: XZ; id: string }[];
  roads: AdRoad[];
  buildings: Record<string, { b?: [number, number, number, number][]; h?: number; y?: number }>;
  palms: [XZ, XZ][];
  /** raise a road (by its first node id) onto a viaduct: height from z, ground → full over [ground, full] */
  elevate?: { firstId: string; ground: number; full: number; deck: number }[];
  palmsAdd?: [number, number, number][];
}
const FIXES = fixesRaw as unknown as WorldFixes;

export function applyFixes(roads: AdRoad[], buildings: AdBuilding[], palms: [number, number, number][], fx: WorldFixes) {
  const moves = new Map(fx.moveVertex.map((m) => [m.id, m.to]));
  const drops = new Set(fx.dropVertex.map((d) => d.id));
  let outRoads = roads.map((r) => {
    if (!r.k?.length || (!r.k.some((id) => moves.has(id)) && !drops.has(r.k[0]) && !drops.has(r.k[r.k.length - 1]))) return r;
    let p = r.p.map((q, i) => (moves.get(r.k[i]) ?? q) as XZ);
    let k = [...r.k];
    if (drops.has(k[k.length - 1]) && p.length > 2) (p = p.slice(0, -1)), (k = k.slice(0, -1));
    if (drops.has(k[0]) && p.length > 2) (p = p.slice(1)), (k = k.slice(1));
    return { ...r, p, k };
  });
  const cuts = new Set((fx.cutVertex ?? []).map((c) => c.id));
  if (cuts.size) {
    outRoads = outRoads.flatMap((r) => {
      if (!r.k?.some((id) => cuts.has(id))) return [r];
      const pieces: AdRoad[] = [];
      let p: XZ[] = [];
      let k: string[] = [];
      r.k.forEach((id, i) => {
        if (cuts.has(id)) {
          if (p.length >= 2) pieces.push({ ...r, p, k });
          p = [];
          k = [];
        } else {
          p.push(r.p[i]);
          k.push(id);
        }
      });
      if (p.length >= 2) pieces.push({ ...r, p, k });
      return pieces;
    });
  }
  for (const ins of fx.insertVertex) {
    const ri = outRoads.findIndex((r) => r.k?.some((id, i) => i < r.k.length - 1 && ((id === ins.after && r.k[i + 1] === ins.before) || (id === ins.before && r.k[i + 1] === ins.after))));
    if (ri < 0) continue;
    const r = outRoads[ri];
    const i = r.k.findIndex((id, j) => j < r.k.length - 1 && ((id === ins.after && r.k[j + 1] === ins.before) || (id === ins.before && r.k[j + 1] === ins.after)));
    outRoads = outRoads.map((q, j) => (j === ri ? { ...r, p: [...r.p.slice(0, i + 1), ins.at, ...r.p.slice(i + 1)], k: [...r.k.slice(0, i + 1), ins.id, ...r.k.slice(i + 1)] } : q));
  }
  outRoads = [...outRoads, ...fx.roads];
  for (const el of fx.elevate ?? []) {
    outRoads = outRoads.map((r) => {
      if (!r.k?.length || r.k[0] !== el.firstId) return r;
      const y = r.p.map(([, z]) => {
        const t = Math.min(1, Math.max(0, (z - el.ground) / (el.full - el.ground)));
        return Math.round(el.deck * t * t * (3 - 2 * t) * 1000) / 1000;
      });
      // the raised part shares no node with the roads passing underneath
      return { ...r, o: 1 as const, y, k: r.k.map((k, i) => (y[i] > 0.05 ? `el_${k}` : k)) };
    });
  }
  const outBuildings = buildings.map((b) => {
    const o = fx.buildings[String(b.id)];
    return o ? { ...b, ...(o.b ? { b: o.b } : {}), ...(o.h !== undefined ? { h: o.h } : {}), ...(o.y !== undefined ? { y: o.y } : {}) } : b;
  });
  const key = (x: number, z: number) => `${Math.round(x * 1000)}:${Math.round(z * 1000)}`;
  const moved = new Map(fx.palms.map(([a, c]) => [key(a[0], a[1]), c]));
  const outPalms = palms.map((p) => {
    const m = moved.get(key(p[0], p[1]));
    return m ? ([m[0], m[1], p[2]] as [number, number, number]) : p;
  });
  return { roads: outRoads, buildings: outBuildings, palms: [...outPalms, ...(fx.palmsAdd ?? [])] };
}

/** roads added by the corrections (boundary and connector roads); the lamps light the main ones */
export const FIX_ROADS: AdRoad[] = FIXES.roads;

const FIXED = applyFixes([...AD_BASE.roads, ...EXP.roads], [...AD_BASE.buildings, ...EXP.buildings], [...AD_BASE.palms, ...EXP.palms], FIXES);

/** Al Sajaa Lagoons: the waterfront villa community south of the South Road (scripts/build-lagoons.py; procedural). */
export interface LagoonVilla {
  x: number;
  z: number;
  /** heading about +y of the villa's depth axis; the front faces the street */
  yaw: number;
  w: number;
  d: number;
  h: number;
  tint: [number, number, number];
  pool: [number, number, number, number, number] | null;
  wf: 0 | 1;
  upper: 0 | 1;
}
export interface Lagoons {
  meta: { rect: { minX: number; maxX: number; minZ: number; maxZ: number } };
  roads: (AdRoad & { bridge?: 1 })[];
  water: XZ[][];
  villas: LagoonVilla[];
  /** walled plots (oriented rectangles; the front, at -d/2, faces the street) */
  plots: { x: number; z: number; yaw: number; w: number; d: number }[];
  cars: { kind: string; x: number; z: number; yaw: number; paint: number }[];
  palms: [number, number, number][];
  trees: { x: number; z: number; s: number }[];
  lawns: XZ[][];
  pitch: { x0: number; z0: number; x1: number; z1: number };
  centre: { x: number; z: number; w: number; d: number; h: number; minaret?: [number, number] };
  bridges: { x: number; z0: number; z1: number; w: number }[];
  places: AdPlace[];
}
export const LAGOONS = lagoonsRaw as unknown as Lagoons;
export const inLagoonWater = (x: number, z: number) => LAGOONS.water.some((w) => pointInPolyXZ(x, z, w));
/** inside a walled villa plot of the lagoon community */
export const inLagoonPlot = (x: number, z: number, pad = 0) =>
  LAGOONS.plots.some((q) => {
    const ux = Math.sin(q.yaw);
    const uz = Math.cos(q.yaw);
    const dx = x - q.x;
    const dz = z - q.z;
    return Math.abs(dx * ux + dz * uz) < q.d / 2 + pad && Math.abs(dx * uz - dz * ux) < q.w / 2 + pad;
  });
function pointInPolyXZ(x: number, z: number, poly: XZ[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The Al Sajaa Interchange: the E611 flyover over a landscaped roundabout (scripts/build-interchange.py; procedural). */
export interface Interchange {
  meta: { rect: { minX: number; maxX: number; minZ: number; maxZ: number }; deck: number; centre: XZ; ringR: number; ringW: number; island: number };
  roads: AdRoad[];
  palms: [number, number, number][];
  loops: { x: number; z: number; r: number }[];
}
export const INTERCHANGE = interchangeRaw as unknown as Interchange;

/** Rendering view of the world: baseline plus expansion plus corrections, then the lagoon community and the interchange. Baseline records keep their order, first. */
export const AD: AdData = {
  ...AD_BASE,
  meta: { ...AD_BASE.meta, rect: EXP.meta.combinedRect },
  roads: [...FIXED.roads, ...LAGOONS.roads, ...INTERCHANGE.roads],
  buildings: FIXED.buildings,
  parks: [...AD_BASE.parks, ...EXP.parks],
  palms: [...FIXED.palms, ...LAGOONS.palms, ...INTERCHANGE.palms],
  places: [...AD_BASE.places, ...EXP.places, ...LAGOONS.places].map((p) => ({ ...p, n: plainName(p.n) })),
  labels: [...AD_BASE.labels, ...EXP.labels].map((l) => ({ ...l, n: plainName(l.n) })),
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
