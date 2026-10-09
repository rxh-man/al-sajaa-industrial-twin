import { useEffect, useMemo, useRef } from 'react';
import {
  CITY_SEA_LABEL,
  COUNTRY_LABELS,
  DISTRICT_PATHS,
  DISTRICT_SEA_LABEL,
  INCIDENT_STREET,
  ISLAND_LABELS,
  MAP_ATTRIBUTION,
  MAP_KM_PER_UNIT,
  PLACE,
  SEA_LABELS,
  STREETS,
  TWIN_MAP_ROTATION,
  UAE_CITIES,
  parsePolylines,
  project,
  sceneToMap,
  snapToPolylines,
  type Place,
} from '../../data/geo';
import { POSES } from '../../data/cameras';
import { viewInsets } from '../../three/CameraRig';
import { CityLayer, CountryLayer, DistrictCoast, DistrictStreets, FootprintPath, TWIN_FOOTPRINT } from '../geo/MapLayers';

/** A map view: centre (map km), zoom (px per km per 1000 px of `scaleBase()`), rotation (deg). */
interface Frame {
  c: [number, number];
  z: number;
  r: number;
}

const COUNTRY: Frame = { c: project(54.0, 24.38), z: 1.95, r: 0 };
const CITY: Frame = { c: project(54.43, 24.475), z: 36, r: 0 };
const TWIN_CENTRE = sceneToMap(0, 0);

/** Timeline after `play` (ms). */
const T_CITY = 1900;
const T_HOLD = 2500;
const T_DISTRICT = 4700;
export const MAP_INTRO_MS = 5300;

/** Screen size the zoom refers to: the height, or the width on portrait screens so the UAE still fits. */
const scaleBase = () => Math.min(window.innerHeight, window.innerWidth * 0.625);

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const band = (v: number, a: number, b: number, c: number, d: number) => smooth((v - a) / (b - a)) * (1 - smooth((v - c) / (d - c)));

/**
 * Zoom with the destination point held steady: interpolate the visible extent (1 / zoom)
 * rather than the zoom itself, and move the centre in step with it.
 */
function lerpFrame(a: Frame, b: Frame, u: number): Frame {
  const e = easeInOut(u);
  const za = 1 / a.z;
  const zb = 1 / b.z;
  const zi = 1 / Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * e);
  const w = Math.abs(za - zb) < 1e-9 ? e : (za - zi) / (za - zb);
  return { c: [a.c[0] + (b.c[0] - a.c[0]) * w, a.c[1] + (b.c[1] - a.c[1]) * w], z: 1 / zi, r: a.r + (b.r - a.r) * smooth((u - 0.25) / 0.75) };
}

/** The final frame matches the 3D camera's top-down opening pose, so the map hands over to the twin. */
function districtFrame(): Frame {
  const H = window.innerHeight;
  const [px, py, pz] = POSES.intro.pos;
  const [tx, ty, tz] = POSES.intro.target;
  const dist = Math.hypot(px - tx, py - ty, pz - tz);
  const unitsPerScreen = 2 * dist * Math.tan((34 / 2) * (Math.PI / 180)); // Canvas fov 34°
  const pxPerKm = H / unitsPerScreen / MAP_KM_PER_UNIT;
  return { c: TWIN_CENTRE, z: (pxPerKm * 1000) / scaleBase(), r: TWIN_MAP_ROTATION };
}

interface Label {
  key: string;
  at: [number, number];
  text: string;
  sub?: string;
  className: string;
  /** visible for zoom in [a..d] with fades a→b, c→d */
  range: [number, number, number, number];
  /** street direction (rad, map space) — text follows the street, kept upright */
  angle?: number;
  /** which part of the label sits on the point: its centre, its leading dot, or a pin above the text */
  anchor?: 'center' | 'left' | 'pin';
  /** hidden below this many px per km (crowded small screens) */
  minScale?: number;
}

const ANCHOR = { center: 'translate(-50%, -50%)', left: 'translate(-4px, -50%)', pin: 'translate(-50%, -6px)' } as const;

function buildLabels(): Label[] {
  const L: Label[] = [];
  const at = (p: Place) => project(p.lon, p.lat);
  const country: Label['range'] = [0, 0.01, 5, 9];
  const city: Label['range'] = [10, 18, 60, 95];
  const district: Label['range'] = [140, 260, 1e9, 1e9];
  COUNTRY_LABELS.forEach((p, i) => L.push({ key: `c${i}`, at: at(p), text: p.name, sub: p.ar, className: i === 0 ? 'mi-country' : 'mi-neighbour', range: country }));
  SEA_LABELS.forEach((p, i) => L.push({ key: `s${i}`, at: at(p), text: p.name, sub: p.ar, className: 'mi-sea', range: country, minScale: i ? 1 : 0 }));
  UAE_CITIES.forEach((p) =>
    L.push({ key: p.name, at: at(p), text: p.name, sub: p.ar, className: p.capital ? 'mi-city is-capital' : 'mi-city', range: p.capital ? [0, 0.01, 6, 11] : country, anchor: 'left', minScale: p.capital ? 0 : 1 }),
  );
  ISLAND_LABELS.forEach((p) => L.push({ key: p.name, at: at(p), text: p.name, className: p.name === 'Abu Dhabi Island' ? 'mi-island is-main' : 'mi-island', range: city }));
  L.push({ key: 'city-sea', at: at(CITY_SEA_LABEL), text: CITY_SEA_LABEL.name, sub: CITY_SEA_LABEL.ar, className: 'mi-sea', range: city });
  L.push({ key: 'site', at: TWIN_CENTRE, text: PLACE.district, sub: PLACE.districtAr, className: 'mi-site', range: [10, 18, 160, 260], anchor: 'pin' });
  // district: real streets, labels snapped onto their OpenStreetMap geometry
  for (const s of Object.values(STREETS)) {
    const lines = parsePolylines(DISTRICT_PATHS.named[s.route]);
    const p = snapToPolylines(lines, project(s.hint.lon, s.hint.lat));
    L.push({ key: s.route, at: [p.x, p.y], text: s.short, sub: s.ar, className: s === INCIDENT_STREET ? 'mi-street is-main' : 'mi-street', range: district, angle: p.angle });
  }
  L.push({ key: 'dist-name', at: project(PLACE.label.lon, PLACE.label.lat), text: PLACE.district.toUpperCase(), sub: PLACE.districtAr, className: 'mi-district', range: district });
  L.push({ key: 'dist-sea', at: project(DISTRICT_SEA_LABEL.lon, DISTRICT_SEA_LABEL.lat), text: DISTRICT_SEA_LABEL.name, sub: DISTRICT_SEA_LABEL.ar, className: 'mi-sea', range: district });
  const corner = TWIN_FOOTPRINT[1];
  L.push({ key: 'twin', at: corner, text: 'Digital twin coverage', className: 'mi-twin', range: [220, 320, 1e9, 1e9], anchor: 'left' });
  return L;
}

interface Props {
  /** start the zoom (otherwise the country view idles) */
  play: boolean;
  onDone: () => void;
}

/**
 * Opening map: United Arab Emirates → Abu Dhabi Island → Al Danah street grid, ending exactly on
 * the 3D twin's top-down opening shot so the cross-fade reads as the map becoming the city.
 */
export function MapIntro({ play, onDone }: Props) {
  const worldRef = useRef<SVGGElement>(null);
  const districtRef = useRef<SVGGElement>(null);
  const countryRef = useRef<SVGGElement>(null);
  const footRef = useRef<SVGGElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labels = useMemo(buildLabels, []);
  const done = useRef(false);
  const doneCb = useRef(onDone);
  doneCb.current = onDone;

  useEffect(() => {
    let raf = 0;
    let t0 = -1;
    let frozen: number | null = null;
    const render = (t: number) => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const D = districtFrame();
      let f: Frame;
      if (t < T_CITY) f = lerpFrame(COUNTRY, CITY, t / T_CITY);
      else if (t < T_HOLD) f = CITY;
      else f = lerpFrame(CITY, D, Math.min(1, (t - T_HOLD) / (T_DISTRICT - T_HOLD)));
      // the final frame sits where the 3D view puts its target: the centre of the free viewport
      const k = smooth((t - T_HOLD) / (T_DISTRICT - T_HOLD));
      const cx = W / 2 + ((viewInsets.left - viewInsets.right) / 2) * k;
      const cy = H / 2 + ((viewInsets.top - viewInsets.bottom) / 2) * k;
      const s = (f.z * scaleBase()) / 1000; // px per km
      const rad = (f.r * Math.PI) / 180;
      const cos = Math.cos(rad) * s;
      const sin = Math.sin(rad) * s;
      // screen = R·S·(p − c) + centre
      const e = cx - (cos * f.c[0] - sin * f.c[1]);
      const g = cy - (sin * f.c[0] + cos * f.c[1]);
      worldRef.current?.setAttribute('transform', `matrix(${cos} ${sin} ${-sin} ${cos} ${e} ${g})`);
      const zoom = f.z;
      // coarse layers stay under the detailed ones (which mask them) until detail fills the view
      if (countryRef.current) countryRef.current.style.opacity = String(1 - smooth((zoom - 60) / 60));
      if (districtRef.current) districtRef.current.style.opacity = String(smooth((zoom - 70) / 150));
      if (footRef.current) footRef.current.style.opacity = String(smooth((zoom - 200) / 140));
      labels.forEach((l, i) => {
        const el = labelRefs.current[i];
        if (!el) return;
        const o = band(zoom, ...l.range) * (l.minScale ? smooth((s - l.minScale) / 0.3) : 1);
        el.style.opacity = o.toFixed(3);
        el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
        if (o < 0.01) return;
        const x = cos * l.at[0] - sin * l.at[1] + e;
        const y = sin * l.at[0] + cos * l.at[1] + g;
        let rot = 0;
        if (l.angle !== undefined) {
          rot = ((l.angle + rad) * 180) / Math.PI;
          rot = ((rot % 360) + 360) % 360;
          if (rot > 90 && rot < 270) rot -= 180; // keep text upright
        }
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${ANCHOR[l.anchor ?? 'center']} rotate(${rot.toFixed(2)}deg)`;
      });
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (frozen !== null) return;
      if (play && t0 < 0) t0 = now;
      const t = play ? now - t0 : 0;
      render(t);
      if (play && t >= MAP_INTRO_MS && !done.current) {
        done.current = true;
        doneCb.current();
      }
    };
    raf = requestAnimationFrame(loop);
    render(0);
    // dev: render any moment of the zoom on demand (`__mapIntroAt(ms)`, `__mapIntroAt(null)` to resume)
    if (import.meta.env.DEV) {
      (window as unknown as { __mapIntroAt: (ms: number | null) => void }).__mapIntroAt = (ms) => {
        frozen = ms;
        if (ms !== null) render(ms);
      };
    }
    return () => cancelAnimationFrame(raf);
  }, [play, labels]);

  return (
    <div className="map-intro" aria-hidden>
      <svg className="mi-svg" width="100%" height="100%">
        <g ref={worldRef}>
          <g ref={countryRef}>
            <CountryLayer detailed />
          </g>
          <CityLayer detailed />
          <DistrictCoast />
          <g ref={districtRef} style={{ opacity: 0 }}>
            <DistrictStreets />
          </g>
          <g ref={footRef} style={{ opacity: 0 }}>
            <FootprintPath />
          </g>
        </g>
      </svg>
      <div className="mi-labels">
        {labels.map((l, i) => (
          <div
            key={l.key}
            ref={(el) => {
              labelRefs.current[i] = el;
            }}
            className={`mi-label ${l.className}`}
            style={{ opacity: 0, visibility: 'hidden' }}
          >
            <span className="mi-en">{l.text}</span>
            {l.sub && (
              <span className="mi-ar" lang="ar" dir="rtl">
                {l.sub}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mi-attrib">{MAP_ATTRIBUTION}</div>
    </div>
  );
}
