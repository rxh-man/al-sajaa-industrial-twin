import { useMemo } from 'react';
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';
import FIXES from '../data/alsajaa-fixes.json';
import { AD } from '../data/abudhabi';

/**
 * Emirates Road E611 furniture on its ground-level stretch through Al Sajaa: overhead sign gantries over each
 * carriageway (green UAE-style panels, English and Arabic, facing the oncoming traffic; posts on the verge and in
 * the median, at least 5.5 m clear over the lanes) and a clipped hedge along the median. Gantries stand clear of
 * the slip lanes, the rail bridge and the verge palms. The service roads, slips and verge palms are in the world
 * data (scripts/build-world-fixes.py, step 6c).
 */

const noRaycast = () => {};
const SB_X = -66.9; // southbound carriageway (runs +z)
const NB_X = -69.1; // northbound carriageway (runs -z)
const MEDIAN_X = (SB_X + NB_X) / 2;
const HW = 0.95;    // carriageway half width
const H = FIXES.meta.highway as { svcE: number; svcW: number; z0: number; z1: number; slips: number[] };

function signTexture(lines: { en: string; ar: string; arrow: string }[]) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 104;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0f6b3a';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#f2f2ee';
  g.lineWidth = 4;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.fillStyle = '#f2f2ee';
  const w = c.width / lines.length;
  lines.forEach((l, i) => {
    const x = w * i + w / 2;
    g.textAlign = 'center';
    g.font = 'bold 30px sans-serif';
    g.fillText(l.arrow, x, 38);
    g.font = 'bold 22px sans-serif';
    g.fillText(l.en, x, 66);
    g.font = '20px sans-serif';
    g.fillText(l.ar, x, 92);
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** z positions for gantries on a carriageway: clear of slips, junctions, the rail bridge and the verge palms */
function gantrySpots(vergeX: number) {
  const palms = AD.palms.filter(([x]) => Math.abs(x - vergeX) < 0.4).map(([, z]) => z);
  const out: number[] = [];
  for (let z = H.z0 + 3; z < H.z1 - 2; z += 0.5) {
    if (H.slips.some((s) => Math.abs(s - z) < 2.2)) continue;
    if (Math.abs(z + 50.5) < 3) continue; // the rail bridge
    if (palms.some((p) => Math.abs(p - z) < 0.45)) continue;
    if (out.length && z - out[out.length - 1] < 16) continue;
    out.push(z);
  }
  return out;
}

export function Highway() {
  const mats = useMemo(() => {
    const steel = new MeshStandardMaterial({ color: '#9ea4ab', roughness: 0.45, metalness: 0.6 });
    const back = new MeshStandardMaterial({ color: '#0d5a31', roughness: 0.6 });
    const hedge = new MeshStandardMaterial({ color: '#3f6b2f', roughness: 0.95 });
    const south = new MeshStandardMaterial({
      map: signTexture([
        { arrow: '↑', en: 'Al Sajaa Lagoons', ar: 'بحيرات السجعة' },
        { arrow: '↖', en: 'Exit: Service Rd', ar: 'مخرج' },
      ]),
      roughness: 0.5,
      emissive: '#ffffff',
      emissiveIntensity: 0.22,
    });
    const north = new MeshStandardMaterial({
      map: signTexture([
        { arrow: '↑', en: 'Sharjah  ·  E88', ar: 'الشارقة' },
        { arrow: '↖', en: 'Al Sajaa Ind.', ar: 'السجعة الصناعية' },
      ]),
      roughness: 0.5,
      emissive: '#ffffff',
      emissiveIntensity: 0.22,
    });
    return { steel, back, hedge, south, north };
  }, []);

  const gantries = useMemo(() => {
    const list: { x0: number; x1: number; z: number; face: number; mat: MeshStandardMaterial }[] = [];
    // southbound traffic runs +z, so its signs face -z; the verge is east of it
    for (const z of gantrySpots(-65.12)) list.push({ x0: MEDIAN_X, x1: SB_X + HW + 0.35, z, face: Math.PI, mat: mats.south });
    for (const z of gantrySpots(-70.88)) list.push({ x0: NB_X - HW - 0.35, x1: MEDIAN_X, z, face: 0, mat: mats.north });
    return list;
  }, [mats]);

  const hedges = useMemo(() => {
    // along the median where the highway is on the ground, broken at the rail crossing
    const spans: [number, number][] = [[-56, -52.2], [-48.8, H.z1 + 0.8]];
    return spans;
  }, []);

  const POST_H = 0.95;
  const BEAM_Y = 0.86;
  return (
    <group>
      {gantries.map((g, i) => {
        const span = g.x1 - g.x0;
        const cx = (g.x0 + g.x1) / 2;
        return (
          <group key={i}>
            {[g.x0, g.x1].map((x) => (
              <mesh key={x} position={[x, POST_H / 2, g.z]} material={mats.steel} castShadow raycast={noRaycast}>
                <boxGeometry args={[0.06, POST_H, 0.06]} />
              </mesh>
            ))}
            <mesh position={[cx, BEAM_Y, g.z]} material={mats.steel} castShadow raycast={noRaycast}>
              <boxGeometry args={[span, 0.05, 0.05]} />
            </mesh>
            {/* the panel: a green back plate and the printed face toward the oncoming traffic */}
            <mesh position={[cx, BEAM_Y - 0.13, g.z]} material={mats.back} castShadow raycast={noRaycast}>
              <boxGeometry args={[Math.min(span - 0.1, 1.9), 0.36, 0.03]} />
            </mesh>
            <mesh position={[cx, BEAM_Y - 0.13, g.z + (g.face === 0 ? 0.016 : -0.016)]} rotation-y={g.face} material={g.mat} raycast={noRaycast}>
              <planeGeometry args={[Math.min(span - 0.1, 1.9), 0.36]} />
            </mesh>
          </group>
        );
      })}
      {hedges.map(([a, b]) => (
        <mesh key={a} position={[MEDIAN_X, 0.04, (a + b) / 2]} material={mats.hedge} receiveShadow raycast={noRaycast}>
          <boxGeometry args={[0.16, 0.08, b - a]} />
        </mesh>
      ))}
    </group>
  );
}
