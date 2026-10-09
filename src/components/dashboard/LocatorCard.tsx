import { MapPin } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { INCIDENT } from '../../data/incident';
import { MAP_ATTRIBUTION, PLACE, UAE_CITIES, formatLatLon, project, sceneToLonLat, sceneToMap } from '../../data/geo';
import { CityLayer, CountryLayer, FootprintPath } from '../geo/MapLayers';

// UAE frame (lon/lat) → 200 px wide card
const W = 200;
const [X0, Y0] = project(51.3, 26.3);
const [X1, Y1] = project(56.45, 22.6);
const S1 = W / (X1 - X0);
const H = Math.round((Y1 - Y0) * S1);
const uae = (x: number, y: number): [number, number] => [(x - X0) * S1, (y - Y0) * S1];

// magnifier over the open Gulf, showing Abu Dhabi Island
const CITY_C = project(54.392, 24.474);
const CITY_R = 9.5; // km shown from the lens centre to its rim
const LENS: [number, number] = [41, 37];
const LENS_R = 33;
const S2 = LENS_R / CITY_R;
const lens = (x: number, y: number): [number, number] => [LENS[0] + (x - CITY_C[0]) * S2, LENS[1] + (y - CITY_C[1]) * S2];

const BOX = uae(CITY_C[0], CITY_C[1]);
const BOX_R = CITY_R * S1;
// leader lines: tangents from the magnified box to the lens rim
const TANGENTS = (() => {
  const dx = BOX[0] - LENS[0];
  const dy = BOX[1] - LENS[1];
  const a = Math.atan2(dy, dx);
  const b = Math.acos(LENS_R / Math.hypot(dx, dy));
  return [a + b, a - b].map((t) => [LENS[0] + Math.cos(t) * LENS_R, LENS[1] + Math.sin(t) * LENS_R]);
})();
const SITE = sceneToMap(0, 0);
const SITE_LENS = lens(SITE[0], SITE[1]);
const [SITE_LON, SITE_LAT] = sceneToLonLat(0, 0);

/** Where the twin is: UAE overview with a lens on Abu Dhabi Island and the Al Danah site. */
export function LocatorCard() {
  const alert = useTwinStore((s) => (s.snap.localized && !s.snap.resolved) || s.future);
  return (
    <section className={`loc ${alert ? 'is-alert' : ''}`} aria-label={`Location: ${PLACE.district}, ${PLACE.city}, ${PLACE.country}`}>
      <header className="rail-head">
        <span className="rail-title">Location</span>
        <span className="loc-ar" lang="ar" dir="rtl">
          {PLACE.districtAr}، {PLACE.cityAr}
        </span>
      </header>
      <svg className="loc-map" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of the United Arab Emirates with Abu Dhabi Island magnified">
        <defs>
          <clipPath id="loc-lens-clip">
            <circle cx={LENS[0]} cy={LENS[1]} r={LENS_R} />
          </clipPath>
        </defs>
        <g transform={`matrix(${S1} 0 0 ${S1} ${-X0 * S1} ${-Y0 * S1})`}>
          <CountryLayer />
        </g>
        {UAE_CITIES.map((c) => {
          const [x, y] = uae(...project(c.lon, c.lat));
          return <circle key={c.name} className={c.capital ? 'loc-capital' : 'loc-city'} cx={x} cy={y} r={c.capital ? 1.8 : 1.1} />;
        })}
        {/* lens and its leader lines */}
        {TANGENTS.map(([x, y], i) => (
          <line key={i} className="loc-leader" x1={BOX[0]} y1={BOX[1]} x2={x} y2={y} />
        ))}
        <rect className="loc-box" x={BOX[0] - BOX_R} y={BOX[1] - BOX_R} width={BOX_R * 2} height={BOX_R * 2} />
        <circle className="loc-lens-bg" cx={LENS[0]} cy={LENS[1]} r={LENS_R} />
        <g clipPath="url(#loc-lens-clip)">
          <g transform={`matrix(${S2} 0 0 ${S2} ${LENS[0] - CITY_C[0] * S2} ${LENS[1] - CITY_C[1] * S2})`}>
            <CityLayer />
            <FootprintPath className="loc-footprint" />
          </g>
          <circle className="loc-pulse" cx={SITE_LENS[0]} cy={SITE_LENS[1]} r={3} />
          <circle className="loc-site" cx={SITE_LENS[0]} cy={SITE_LENS[1]} r={2} />
        </g>
        <circle className="loc-lens-rim" cx={LENS[0]} cy={LENS[1]} r={LENS_R} />
        <text className="loc-label" x={LENS[0]} y={LENS[1] + LENS_R + 9} textAnchor="middle">
          Abu Dhabi Island
        </text>
      </svg>
      <div className="loc-text">
        <div className="loc-name">
          <MapPin size={12} strokeWidth={2.4} aria-hidden />
          {PLACE.district}, {PLACE.city}
        </div>
        <div className="loc-sub">{INCIDENT.roadShort}</div>
        <div className="loc-sub mono tnum">{formatLatLon(SITE_LON, SITE_LAT)}</div>
      </div>
      <div className="loc-attrib">{MAP_ATTRIBUTION}</div>
    </section>
  );
}
