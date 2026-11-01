/**
 * External weather for Al Sajaa from Open-Meteo (https://open-meteo.com): current temperature, humidity, wind
 * and shortwave (solar) irradiance at 25.337 N, 55.436 E.
 *
 * Provider and terms: Open-Meteo forecast API, free for non-commercial use without an API key, data licensed
 * CC BY 4.0 (attribution required, shown in the UI). Model data (numerical weather models, ~1–11 km grid,
 * updated hourly), not a station measurement at the site. Called from the browser (no secret involved), cached
 * for 30 minutes, with a timeout; on any failure the app keeps its assumed values and says so.
 */

export const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=25.337&longitude=55.436&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,shortwave_radiation&wind_speed_unit=ms&timezone=Asia%2FDubai';
export const ATTRIBUTION = 'Weather data by Open-Meteo.com (CC BY 4.0), model data for 25.34 N 55.44 E';
const CACHE_KEY = 'al-sajaa-weather-v1';
const TTL_MS = 30 * 60 * 1000;

export interface Weather {
  time: string;
  temperatureC: number;
  humidityPct: number;
  windMs: number;
  /** meteorological convention: the direction the wind blows FROM, degrees clockwise from north */
  windFromDeg: number;
  irradianceWm2: number;
  fetchedAt: number;
}

/** wind FROM a compass bearing → the twin's plume direction (travel TOWARD, vector (cos, sin) in x-east/z-south) */
export const plumeDirFromMeteo = (fromDeg: number) => (((fromDeg + 90) % 360) + 360) % 360;

export function parseWeather(j: unknown, now = Date.now()): Weather | null {
  const c = (j as { current?: Record<string, unknown> })?.current;
  if (!c) return null;
  const num = (k: string) => (typeof c[k] === 'number' && Number.isFinite(c[k] as number) ? (c[k] as number) : null);
  const t = num('temperature_2m');
  const h = num('relative_humidity_2m');
  const ws = num('wind_speed_10m');
  const wd = num('wind_direction_10m');
  const sw = num('shortwave_radiation');
  if (t === null || h === null || ws === null || wd === null || sw === null || typeof c.time !== 'string') return null;
  // plausibility checks: reject anything physically implausible rather than display it
  if (t < -20 || t > 65 || h < 0 || h > 100 || ws < 0 || ws > 80 || wd < 0 || wd > 360 || sw < 0 || sw > 1500) return null;
  return { time: c.time, temperatureC: t, humidityPct: h, windMs: ws, windFromDeg: wd, irradianceWm2: sw, fetchedAt: now };
}

export type WeatherResult = { ok: true; weather: Weather; cached: boolean } | { ok: false; reason: string };

export async function fetchWeather(fetcher: typeof fetch = fetch, storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null, now = Date.now()): Promise<WeatherResult> {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    if (raw) {
      const w = JSON.parse(raw) as Weather;
      if (now - w.fetchedAt < TTL_MS) return { ok: true, weather: w, cached: true };
    }
  } catch {
    /* unreadable cache: refetch */
  }
  try {
    const r = await fetcher(WEATHER_URL, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return { ok: false, reason: `Weather service answered HTTP ${r.status}.` };
    const w = parseWeather(await r.json(), now);
    if (!w) return { ok: false, reason: 'Weather service returned incomplete or implausible values.' };
    try {
      storage?.setItem(CACHE_KEY, JSON.stringify(w));
    } catch {
      /* storage full or blocked: fine without cache */
    }
    return { ok: true, weather: w, cached: false };
  } catch {
    return { ok: false, reason: 'Weather service not reachable (offline or blocked).' };
  }
}
