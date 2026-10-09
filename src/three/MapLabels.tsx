import { useThree } from '@react-three/fiber';
import { AD } from '../data/abudhabi';
import { DISTRICT_SEA_LABEL, STREETS, type RealStreet } from '../data/geo';
import { live } from '../simulation/runtime';
import { FadeHtml } from './labels/FadeHtml';

const LANDMARK_ROLES = new Set(['landmark', 'mall', 'mosque']);

/** OpenStreetMap's short street names → the verified English / Arabic names used across the twin. */
const BY_OSM: Record<string, RealStreet> = {
  'Corniche St': STREETS.corniche,
  'Khalifa Bin Zayed I St': STREETS.khalifa,
  'Hamdan Bin Mohammed St': STREETS.hamdan,
  'Sheikh Rashid Bin Saeed St': STREETS.rashidBinSaeed,
  'Sultan Bin Zayed I St': STREETS.sultanBinZayed,
};

/** Real street (English / Arabic) and landmark names, shown from the overview and faded out for close-ups and X-ray. */
export function MapLabels() {
  const camera = useThree((s) => s.camera);
  const far = () => {
    const h = camera.position.y;
    return Math.max(0, Math.min(1, (h - 34) / 14)) * (1 - live.xray) * (1 - live.exploded) * (1 - live.pois);
  };
  const landmarks = AD.places.filter((p) => LANDMARK_ROLES.has(p.role));

  return (
    <group>
      {AD.labels.map((l) => {
        const s = BY_OSM[l.n];
        return (
          <FadeHtml key={l.n} position={[l.x, 0.4, l.z]} opacity={far} zIndex={6} center>
            <div className="street-sign">
              <span className="street-sign-en">{s ? s.short : l.n}</span>
              {s && (
                <span className="street-sign-ar" lang="ar" dir="rtl">
                  {s.ar}
                </span>
              )}
            </div>
          </FadeHtml>
        );
      })}
      {landmarks.map((p) => (
        <FadeHtml key={p.n} position={[p.x, p.h + 0.9, p.z]} opacity={far} zIndex={7} center>
          <span className="map-place">{p.n.replace(' / The Mall', ' Mall')}</span>
        </FadeHtml>
      ))}
      <FadeHtml position={[-30, 0.4, 66]} opacity={far} zIndex={6} center>
        <div className="sea-label">
          <span>{DISTRICT_SEA_LABEL.name}</span>
          <span lang="ar" dir="rtl">
            {DISTRICT_SEA_LABEL.ar}
          </span>
        </div>
      </FadeHtml>
    </group>
  );
}
