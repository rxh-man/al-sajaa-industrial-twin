import { memo, useId } from 'react';
import { CITY_BBOX, CITY_PATHS, COUNTRY_PATHS, DISTRICT_BBOX, DISTRICT_PATHS, INCIDENT_STREET, STREETS, project, sceneToMap } from '../../data/geo';
import { DIORAMA } from '../../data/city';

/**
 * SVG layers in map kilometres (see data/geo.ts). Strokes don't scale with zoom, so the
 * same layers serve the small locator and the full-screen opening zoom.
 *
 * The OpenStreetMap extracts are cut to a box: their land is filled up to the box edge, but
 * coastlines are clipped just inside it so the cut never draws as a line.
 */

const ns = { vectorEffect: 'non-scaling-stroke' } as const;

/** useId() values contain characters that break `url(#…)` references. */
const useSvgId = () => useId().replace(/[^\w-]/g, '');

function boxRect(b: readonly [number, number, number, number], inset = 0) {
  const [x0, y0] = project(b[0], b[3]);
  const [x1, y1] = project(b[2], b[1]);
  return { x: x0 + inset, y: y0 + inset, width: x1 - x0 - inset * 2, height: y1 - y0 - inset * 2 };
}

/** Everything but a box: masks a coarser layer where a more detailed one takes over. */
function HoleMask({ id, rect }: { id: string; rect: ReturnType<typeof boxRect> }) {
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x={-2000} y={-2000} width={4000} height={4000}>
      <rect x={-2000} y={-2000} width={4000} height={4000} fill="white" />
      <rect {...rect} fill="black" />
    </mask>
  );
}

/** Natural Earth countries; `detailed` leaves a hole where the OpenStreetMap coastline (CityLayer) takes over. */
export const CountryLayer = memo(function CountryLayer({ detailed = false }: { detailed?: boolean }) {
  const id = useSvgId();
  return (
    <g className="geo-country">
      {/* the hole stops 2.5 km inside the detailed data so the two (same-colour) fills overlap and no seam shows */}
      {detailed && <HoleMask id={`${id}-hole`} rect={boxRect(CITY_BBOX, 2.5)} />}
      <path className="geo-neighbour" d={COUNTRY_PATHS.saudi} style={ns} />
      <path className="geo-neighbour" d={COUNTRY_PATHS.oman} fillRule="evenodd" style={ns} />
      <path className="geo-neighbour" d={COUNTRY_PATHS.qatar} style={ns} />
      <g mask={detailed ? `url(#${id}-hole)` : undefined}>
        <path className="geo-uae" d={COUNTRY_PATHS.uae} fillRule="evenodd" style={ns} />
      </g>
      <path className="geo-uae" d={COUNTRY_PATHS.uaeIslands} style={ns} />
    </g>
  );
});

/** OpenStreetMap coastline around Abu Dhabi Island; `detailed` leaves a hole for DistrictCoast. */
export const CityLayer = memo(function CityLayer({ detailed = false }: { detailed?: boolean }) {
  const id = useSvgId();
  return (
    <g className="geo-city">
      <clipPath id={`${id}-clip`}>
        <rect {...boxRect(CITY_BBOX, 0.05)} />
      </clipPath>
      {detailed && <HoleMask id={`${id}-hole`} rect={boxRect(DISTRICT_BBOX, 0.06)} />}
      <g mask={detailed ? `url(#${id}-hole)` : undefined}>
        <path className="geo-land" d={CITY_PATHS.land} />
        <path className="geo-island" d={CITY_PATHS.island} />
        <g clipPath={`url(#${id}-clip)`}>
          <path className="geo-land-edge" d={CITY_PATHS.land} style={ns} />
          <path className="geo-island-edge" d={CITY_PATHS.island} style={ns} />
        </g>
      </g>
    </g>
  );
});

/** The slab of the 3D twin, placed on the real street grid. */
export const TWIN_FOOTPRINT = [
  sceneToMap(DIORAMA.minX, DIORAMA.minZ),
  sceneToMap(DIORAMA.maxX, DIORAMA.minZ),
  sceneToMap(DIORAMA.maxX, DIORAMA.maxZ),
  sceneToMap(DIORAMA.minX, DIORAMA.maxZ),
];
const footprintD = `M${TWIN_FOOTPRINT.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join('L')}Z`;

export function FootprintPath({ className }: { className?: string }) {
  return <path className={className ?? 'geo-footprint'} d={footprintD} style={ns} />;
}

const NAMED = Object.values(STREETS);

/** Detailed Al Danah coastline: fills the hole CityLayer leaves when `detailed`. */
export const DistrictCoast = memo(function DistrictCoast() {
  const id = useSvgId();
  return (
    <g className="geo-district">
      <clipPath id={`${id}-clip`}>
        <rect {...boxRect(DISTRICT_BBOX, 0.01)} />
      </clipPath>
      <path className="geo-coast" d={DISTRICT_PATHS.coast} />
      <path className="geo-coast-edge" d={DISTRICT_PATHS.coast} clipPath={`url(#${id}-clip)`} style={ns} />
    </g>
  );
});

export const DistrictStreets = memo(function DistrictStreets() {
  return (
    <g className="geo-district">
      <path className="geo-minor" d={DISTRICT_PATHS.minor} style={ns} />
      <path className="geo-major" d={DISTRICT_PATHS.major} style={ns} />
      {NAMED.map((s) => (
        <path key={s.route} className={s === INCIDENT_STREET ? 'geo-hamdan' : 'geo-named'} d={DISTRICT_PATHS.named[s.route]} style={ns} />
      ))}
    </g>
  );
});
