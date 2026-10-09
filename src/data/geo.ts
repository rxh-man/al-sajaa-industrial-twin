import { UNIT_METERS } from './city';
import { AD } from './abudhabi';

export { COUNTRY_PATHS, CITY_PATHS, DISTRICT_PATHS } from './geoPaths';

/**
 * Real-world placement of the twin: Al Danah, Abu Dhabi Island, United Arab Emirates.
 *
 * Map geometry (src/data/geoPaths.ts) is pre-projected so the UI can draw it as plain SVG:
 * equirectangular around 54.0° E / 24.45° N, in kilometres, x → east, y → south.
 *
 * Sources
 *  · Country outlines — Natural Earth 1:10m admin-0 countries (public domain), via world-atlas@2.
 *    Abu Musa, Greater Tunb and Lesser Tunb are drawn as UAE territory, as on UAE official maps.
 *  · Abu Dhabi coastline, Al Danah streets, street names and route numbers —
 *    © OpenStreetMap contributors (ODbL), Overpass API extract, October 2026.
 *  · Street names follow the Onwani official names (e.g. Hamdan Bin Mohammed Street, formerly
 *    "5th Street"; Zayed The First Street, formerly Electra Street).
 */

export const MAP_ATTRIBUTION = '© OpenStreetMap contributors · Natural Earth';

/** Extents (lon/lat: west, south, east, north) of the OpenStreetMap extracts in geoPaths.ts. */
export const CITY_BBOX = [54.18, 24.32, 54.68, 24.62] as const;
export const DISTRICT_BBOX = [54.348, 24.476, 54.384, 24.504] as const;

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
  { name: 'Abu Dhabi', ar: 'أبوظبي', lon: 54.3774, lat: 24.4538, capital: true },
  { name: 'Dubai', ar: 'دبي', lon: 55.2924, lat: 25.2647 },
  { name: 'Sharjah', ar: 'الشارقة', lon: 55.4211, lat: 25.3461 },
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

/** Label points inside each island's OpenStreetMap outline. */
export const ISLAND_LABELS: Place[] = [
  { name: 'Abu Dhabi Island', lon: 54.3941, lat: 24.4688 },
  { name: 'Saadiyat Island', lon: 54.4353, lat: 24.5457 },
  { name: 'Al Reem Island', lon: 54.4087, lat: 24.4925 },
  { name: 'Yas Island', lon: 54.603, lat: 24.4864 },
];

export const CITY_SEA_LABEL: Place = { name: 'Arabian Gulf', ar: 'الخليج العربي', lon: 54.25, lat: 24.56 };
export const DISTRICT_SEA_LABEL: Place = { name: 'Arabian Gulf', ar: 'الخليج العربي', lon: 54.3625, lat: 24.4995 };

export const PLACE = {
  district: 'Al Sajaa',
  districtAr: 'السجعة',
  city: 'Sharjah',
  cityAr: 'الشارقة',
  country: 'United Arab Emirates',
  countryShort: 'UAE',
  /** District label point (inside Al Danah, OpenStreetMap admin boundary). */
  label: { lon: 54.37, lat: 24.488 },
  timeZone: 'Asia/Dubai',
  timeZoneLabel: 'GST',
} as const;

export interface RealStreet {
  /** Abu Dhabi route number (OpenStreetMap `ref`) — keys DISTRICT_PATHS.named. */
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

export const STREETS = {
  corniche: street({ route: '1', name: 'Corniche Street', short: 'Corniche St', ar: 'شارع الكورنيش', aka: 'Corniche Road', hint: { lon: 54.36076, lat: 24.49731 } }),
  khalifa: street({ route: '3', name: 'Khalifa Bin Zayed The First Street', short: 'Khalifa Bin Zayed The First St', ar: 'شارع خليفة بن زايد الأول', aka: 'Khalifa Street', hint: { lon: 54.363618, lat: 24.493688 } }),
  hamdan: street({ route: '5', name: 'Hamdan Bin Mohammed Street', short: 'Hamdan Bin Mohammed St', ar: 'شارع حمدان بن محمد', aka: 'Hamdan Street', hint: { lon: 54.365562, lat: 24.491403 } }),
  zayedFirst: street({ route: '7', name: 'Zayed The First Street', short: 'Zayed The First St', ar: 'شارع زايد الأول', aka: 'Electra Street', hint: { lon: 54.367321, lat: 24.488856 } }),
  rashidBinSaeed: street({ route: '18', name: 'Sheikh Rashid Bin Saeed Street', short: 'Sheikh Rashid Bin Saeed St', ar: 'شارع الشيخ راشد بن سعيد', aka: 'Airport Road', hint: { lon: 54.3558, lat: 24.4864 } }),
  sultanBinZayed: street({ route: '20', name: 'Sultan Bin Zayed The First Street', short: 'Sultan Bin Zayed The First St', ar: 'شارع سلطان بن زايد الأول', aka: 'Muroor Road', hint: { lon: 54.362425, lat: 24.491003 } }),
  alOtaiba: street({ route: '22', name: 'Saeed Bin Ahmed Al Otaiba Street', short: 'Saeed Bin Ahmed Al Otaiba St', ar: 'شارع سعيد بن أحمد العتيبة', aka: 'Delma Street', hint: { lon: 54.368737, lat: 24.49176 } }),
  zayedBinSultan: street({ route: '24', name: 'Sheikh Zayed Bin Sultan Street', short: 'Sheikh Zayed Bin Sultan St', ar: 'شارع الشيخ زايد بن سلطان', aka: 'Salam Street', hint: { lon: 54.3741, lat: 24.4957 } }),
} as const;

/**
 * Street names for the procedural Al Danah grid (STREET_Z / STREET_X), used by StreetNames.tsx from main.
 * The real-map scene labels streets from OpenStreetMap instead (MapLabels.tsx).
 */
export const STREET_Z_REAL: (RealStreet | null)[] = [null, STREETS.zayedFirst, STREETS.hamdan, STREETS.khalifa, STREETS.corniche];
export const STREET_X_REAL: (RealStreet | null)[] = [null, STREETS.alOtaiba, null, STREETS.sultanBinZayed, null, null];

/** The incident street. The 3D twin is built on the real OpenStreetMap streets with Khalifa Street through the origin. */
export const INCIDENT_STREET = STREETS.khalifa;

/* ------------------------------------------------------------------ */
/* Scene ↔ map                                                         */
/* ------------------------------------------------------------------ */

/*
 * Exact inverse of scripts/build-abudhabi.mjs: the scene is the real map rotated by
 * AD.meta.rotationDeg about AD.meta.origin, 1 unit = UNIT_METERS. Same local projection
 * constants as the build so the twin and the maps line up to the metre.
 */
const BUILD_LAT0 = 24.487;
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
