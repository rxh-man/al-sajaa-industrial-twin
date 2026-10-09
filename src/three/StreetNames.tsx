import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { SEA, STREET_X, STREET_Z } from '../data/city';
import { STREET_X_REAL, STREET_Z_REAL, SEA_LABELS, type RealStreet } from '../data/geo';
import { live } from '../simulation/runtime';
import { FadeHtml } from './labels/FadeHtml';

interface Sign {
  street: RealStreet;
  pos: [number, number, number];
}

// mid-block on each named street, placed to stay clear of the rails and controls in the overview shot
const ALONG: Record<string, number> = { '7': 0, '5': 28, '3': 28, '1': 28, '20': 44, '22': -16 };
const SIGNS: Sign[] = [
  ...STREET_Z_REAL.flatMap((s, j) => (s ? [{ street: s, pos: [ALONG[s.route], 0.5, STREET_Z[j]] as [number, number, number] }] : [])),
  ...STREET_X_REAL.flatMap((s, i) => (s ? [{ street: s, pos: [STREET_X[i], 0.5, ALONG[s.route]] as [number, number, number] }] : [])),
];

const GULF = SEA_LABELS[0];
const tmp = new Vector3();
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/**
 * Real street names (English / Arabic) on the twin's grid. Shown in the overview, out of the way
 * once the scenario's own overlays, the X-ray or the exploded view take over.
 */
export function StreetNames() {
  const camera = useThree((s) => s.camera);
  const quiet = () => (1 - live.xray) * (1 - live.exploded) * (1 - clamp01(Math.max(live.reticle, live.trench, live.impact, live.route, live.future) * 2));
  const near = (p: [number, number, number]) => {
    const d = camera.position.distanceTo(tmp.set(p[0], p[1], p[2]));
    return smoothstep(22, 40, d) * (1 - smoothstep(330, 380, d));
  };
  return (
    <group>
      {SIGNS.map((s) => (
        <FadeHtml key={s.street.route} position={s.pos} center zIndex={4} opacity={() => quiet() * near(s.pos)}>
          <div className="street-sign">
            <span className="street-sign-en">{s.street.short}</span>
            <span className="street-sign-ar" lang="ar" dir="rtl">
              {s.street.ar}
            </span>
          </div>
        </FadeHtml>
      ))}
      <FadeHtml position={[0, SEA.level + 0.4, 76]} center zIndex={3} opacity={() => quiet() * near([0, 0, 76])}>
        <div className="sea-label">
          <span>{GULF.name}</span>
          <span lang="ar" dir="rtl">
            {GULF.ar}
          </span>
        </div>
      </FadeHtml>
    </group>
  );
}
