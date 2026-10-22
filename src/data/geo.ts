import { UNIT_METERS } from './city';
import { AD } from './abudhabi';

export { COUNTRY_PATHS } from './geoPaths';

/**
 * Real-world placement of the twin: Al Sajaa, Sharjah, United Arab Emirates.
 *
 * Map geometry (src/data/geoPaths.ts) is pre-projected so the UI can draw it as plain SVG:
 * equirectangular around 54.0° E / 24.45° N, in kilometres, x → east, y → south.
 *
 * Sources
 *  · Country outlines — Natural Earth 1:10m admin-0 countries (public domain), via world-atlas@2.
 *    Abu Musa, Greater Tunb and Lesser Tunb are drawn as UAE territory, as on UAE official maps.
 *  · Al Sajaa coastline, streets and land outline come from the procedural district model
 *    (scripts/build-alsajaa.py), projected onto the same map.
 */

/** Attribution for the UAE outline (intro and locator), which is drawn from OpenStreetMap data. */
export const MAP_ATTRIBUTION = '© OpenStreetMap contributors · Natural Earth (UAE outline only)';

/** Extents (lon/lat: west, south, east, north) of the OpenStreetMap extracts in geoPaths.ts. */
export const CITY_BBOX = [55.415, 25.325, 55.455, 25.352] as const;
export const DISTRICT_BBOX = [55.419, 25.33, 55.452, 25.347] as const;

const LON0 = 54;
const LAT0 = 24.45;
const KX = 101.33714; // km per degree of longitude at LAT0
const KY = 110.574; // km per degree of latitude

/** lon/lat → map kilometres (x east, y south). */
export function project(lon: number, lat: number): [number, number] {
  return [(lon - LON0) * KX, (LAT0 - lat) * KY];
}

export function unproject(x: number, y: number): [number, number] {
  return [LON0 + x / KX, LAT0 - y / KY];
}

export interface Place {
  name: string;
  ar?: string;
  lon: number;
  lat: number;
}

/** The seven emirates' capitals (OpenStreetMap city nodes) plus Al Ain. */
export const UAE_CITIES: (Place & { capital?: boolean })[] = [
  { name: 'Dubai', ar: 'دبي', lon: 55.2924, lat: 25.2647 },
  { name: 'Sharjah', ar: 'الشارقة', lon: 55.4211, lat: 25.3461, capital: true },
  { name: 'Ajman', ar: 'عجمان', lon: 55.4451, lat: 25.3937 },
  { name: 'Umm Al Quwain', ar: 'أم القيوين', lon: 55.5475, lat: 25.552 },
  { name: 'Ras Al Khaimah', ar: 'رأس الخيمة', lon: 55.9382, lat: 25.7738 },
  { name: 'Fujairah', ar: 'الفجيرة', lon: 56.3355, lat: 25.1245 },
  { name: 'Al Ain', ar: 'العين', lon: 55.7452, lat: 24.2249 },
];

export const COUNTRY_LABELS: Place[] = [
  { name: 'United Arab Emirates', ar: 'الإمارات العربية المتحدة', lon: 54.15, lat: 23.55 },
  { name: 'Saudi Arabia', lon: 51.95, lat: 22.75 },
  { name: 'Oman', lon: 56.55, lat: 23.35 },
  { name: 'Qatar', lon: 51.22, lat: 25.32 },
];

export const SEA_LABELS: Place[] = [
  { name: 'Arabian Gulf', ar: 'الخليج العربي', lon: 53.05, lat: 25.6 },
  { name: 'Gulf of Oman', ar: 'خليج عُمان', lon: 56.95, lat: 24.95 },
];

/** Islands are not shown for the Al Sajaa district. */
export const ISLAND_LABELS: Place[] = [];

export const CITY_SEA_LABEL: Place = { name: 'Arabian Gulf', ar: 'الخليج العربي', lon: 55.4, lat: 25.318 };
export const DISTRICT_SEA_LABEL: Place = { name: 'Arabian Gulf', ar: 'الخليج العربي', lon: 55.43, lat: 25.3305 };

export const PLACE = {
  district: 'Al Sajaa',
  districtAr: 'السجعة',
  city: 'Sharjah',
  cityAr: 'الشارقة',
  country: 'United Arab Emirates',
  countryShort: 'UAE',
  /** District label point (Al Sajaa, at the district origin). */
  label: { lon: 55.436, lat: 25.337 },
  timeZone: 'Asia/Dubai',
  timeZoneLabel: 'GST',
} as const;

export interface RealStreet {
  /** Route key used to group the street's geometry (DISTRICT_PATHS.named). */
  route: string;
  name: string;
  short: string;
  ar: string;
  /** Common / former name locals still use. */
  aka?: string;
  /** A point on the street inside the district; labels snap to the street nearest to it. */
  hint: { lon: number; lat: number };
}

const street = (s: RealStreet) => s;

/* Scene ↔ lon/lat for the Al Sajaa model (no rotation; 1 unit = UNIT_METERS). */
const ORIGIN_LAT = AD.meta.origin.lat;
const KX_SCENE = 111320 * Math.cos((ORIGIN_LAT * Math.PI) / 180);
const KZ_SCENE = 110574;
const atScene = (x: number, z: number) => ({
  lon: AD.meta.origin.lon + (x * UNIT_METERS) / KX_SCENE,
  lat: ORIGIN_LAT - (z * UNIT_METERS) / KZ_SCENE,
});
const midOf = (name: string) => {
  const r = AD.roads.find((q) => q.n === name);
  if (!r) return { lon: AD.meta.origin.lon, lat: ORIGIN_LAT };
  const [x, z] = r.p[Math.floor(r.p.length / 2)];
  return atScene(x, z);
};

export const STREETS = {
  corniche: street({ route: '1', name: 'Unnamed road (name to verify)', short: 'Unnamed road', ar: '', hint: midOf('Unnamed road (name to verify)') }),
  khalifa: street({ route: '3', name: 'Al Sajaa Main Road (name to verify)', short: 'Main road', ar: '', hint: midOf('Al Sajaa Main Road (name to verify)') }),
  hamdan: street({ route: '5', name: 'Emirates Road E88', short: 'Emirates Rd E88', ar: '', hint: midOf('Emirates Road E88') }),
  zayedFirst: street({ route: '7', name: 'Al Sajaa Road 3', short: 'Al Sajaa Rd 3', ar: '', hint: midOf('Al Sajaa Road 3') }),
  rashidBinSaeed: street({ route: '18', name: 'Emirates Road E611', short: 'Emirates Rd E611', ar: '', hint: midOf('Emirates Road E611') }),
  sultanBinZayed: street({ route: '20', name: 'Al Sajaa Street 4', short: 'Al Sajaa St 4', ar: '', hint: midOf('Al Sajaa Street 4') }),
  alOtaiba: street({ route: '22', name: 'Al Sajaa Street 8', short: 'Al Sajaa St 8', ar: '', hint: midOf('Al Sajaa Street 8') }),
  zayedBinSultan: street({ route: '24', name: 'Al Sajaa Road 5', short: 'Al Sajaa Rd 5', ar: '', hint: midOf('Al Sajaa Road 5') }),
} as const;

/* Map geometry from the Al Sajaa model, in the same projection as the country outline. */
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pathOf = (pts: number[][], close = false) => {
  const xy = pts.map(([x, z]) => {
    const p = atScene(x, z);
    return project(p.lon, p.lat);
  });
  let d = `M${r3(xy[0][0])} ${r3(xy[0][1])}`;
  for (let i = 1; i < xy.length; i++) d += `l${r3(xy[i][0] - xy[i - 1][0])} ${r3(xy[i][1] - xy[i - 1][1])}`;
  return close ? d + 'z' : d;
};
const pathsOf = (roads: { p: number[][] }[]) => roads.map((r) => pathOf(r.p)).join('');

export const CITY_PATHS = { land: pathOf(AD.land, true), island: '' };
export const DISTRICT_PATHS = {
  coast: pathOf(AD.coast),
  minor: pathsOf(AD.roads.filter((r) => r.c === 'residential')),
  major: pathsOf(AD.roads.filter((r) => r.c === 'trunk' || r.c === 'secondary')),
  named: Object.fromEntries(
    Object.values(STREETS).map((st) => [st.route, pathsOf(AD.roads.filter((r) => r.n === st.name))]),
  ) as Record<string, string>,
};

/**
 * Street names for the procedural Al Sajaa grid (STREET_Z / STREET_X), used by StreetNames.tsx from main.
 * The real-map scene labels streets from OpenStreetMap instead (MapLabels.tsx).
 */
export const STREET_Z_REAL: (RealStreet | null)[] = [null, STREETS.zayedFirst, STREETS.hamdan, STREETS.khalifa, STREETS.corniche];
export const STREET_X_REAL: (RealStreet | null)[] = [null, STREETS.alOtaiba, null, STREETS.sultanBinZayed, null, null];

/** The incident street (simulated): the main road through the origin. */
export const INCIDENT_STREET = STREETS.khalifa;

/* ------------------------------------------------------------------ */
/* Scene ↔ map                                                         */
/* ------------------------------------------------------------------ */

/*
 * Exact inverse of scripts/build-abudhabi.mjs: the scene is the real map rotated by
 * AD.meta.rotationDeg about AD.meta.origin, 1 unit = UNIT_METERS. Same local projection
 * constants as the build so the twin and the maps line up to the metre.
 */
const BUILD_LAT0 = AD.meta.origin.lat;
const KX_M = 111320 * Math.cos((BUILD_LAT0 * Math.PI) / 180);
const KZ_M = 110574;
const PHI = (AD.meta.rotationDeg * Math.PI) / 180;
const COS = Math.cos(PHI);
const SIN = Math.sin(PHI);

export function sceneToLonLat(x: number, z: number): [number, number] {
  const sx = x * UNIT_METERS;
  const sz = z * UNIT_METERS;
  const east = sx * COS + sz * SIN;
  const south = -sx * SIN + sz * COS;
  return [AD.meta.origin.lon + east / KX_M, AD.meta.origin.lat - south / KZ_M];
}

/** Scene (x, z) → map kilometres. */
export function sceneToMap(x: number, z: number): [number, number] {
  return project(...sceneToLonLat(x, z));
}

/** Map rotation (degrees, SVG sense) that puts the twin's inland direction (−z) up, like the 3D view. */
export const TWIN_MAP_ROTATION = (() => {
  const [ax, ay] = sceneToMap(0, 0);
  const [bx, by] = sceneToMap(0, -10);
  return -90 - (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
})();

/** Map kilometres per scene unit (for matching the 3D camera's footprint). */
export const MAP_KM_PER_UNIT = UNIT_METERS / 1000;

export function formatLatLon(lon: number, lat: number, digits = 4) {
  return `${lat.toFixed(digits)}° N, ${lon.toFixed(digits)}° E`;
}

/* ------------------------------------------------------------------ */
/* Path helpers                                                        */
/* ------------------------------------------------------------------ */

/** Parses the generated path data (only M, l and z commands) into polylines. */
export function parsePolylines(d: string): [number, number][][] {
  const out: [number, number][][] = [];
  const re = /([Mlz])([^Mlz]*)/g;
  let cur: [number, number][] | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const nums = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number);
    if (m[1] === 'M') {
      cur = [[nums[0], nums[1]]];
      out.push(cur);
    } else if (m[1] === 'l' && cur) {
      let [x, y] = cur[cur.length - 1];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        x += nums[i];
        y += nums[i + 1];
        cur.push([x, y]);
      }
    }
  }
  return out;
}

/** Nearest point on a set of polylines, with the local direction there (radians, SVG sense). */
export function snapToPolylines(lines: [number, number][][], p: [number, number]) {
  let best = { x: p[0], y: p[1], angle: 0, d: Infinity };
  for (const l of lines) {
    for (let i = 0; i < l.length - 1; i++) {
      const [ax, ay] = l[i];
      const [bx, by] = l[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const L2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2));
      const x = ax + t * dx;
      const y = ay + t * dy;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < best.d) best = { x, y, angle: Math.atan2(dy, dx), d };
    }
  }
  return best;
}
