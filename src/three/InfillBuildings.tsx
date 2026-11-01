import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Object3D, type InstancedMesh } from 'three';
import { INFILL, type Infill } from '../data/infill';
import { kerbDistance } from '../data/spatial';
import { hash01 } from '../sustainability/facilities';

/**
 * Offices, shops, cafés, fuel stations, showrooms, apartments, townhouses and pocket parks on the infill sites
 * (src/data/infill.ts). Every type has its own massing and features, oriented to the nearest road. Three instanced
 * draws (solid, glass, greenery).
 */
type Part = { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string };
const noRaycast = () => {};
const tmp = new Object3D();

/** local frame: u along the frontage, v away from the road (front edge at v = -d/2) */
function frame(s: Infill) {
  const sides = [
    { nx: 0, nz: -1 },
    { nx: 0, nz: 1 },
    { nx: -1, nz: 0 },
    { nx: 1, nz: 0 },
  ].map((n) => ({ ...n, k: kerbDistance(s.x + n.nx * (Math.abs(n.nx) ? s.w : s.d) * 0.55, s.z + n.nz * (Math.abs(n.nx) ? s.w : s.d) * 0.55, 4) }));
  const f = sides.sort((a, b) => a.k - b.k)[0];
  const alongX = f.nz !== 0; // frontage runs along x when the road is north/south of the site
  const W = alongX ? s.w : s.d;
  const D = alongX ? s.d : s.w;
  // v points from the front (road) to the back
  const toWorld = (u: number, v: number): [number, number] => (alongX ? [s.x + u, s.z - f.nz * v] : [s.x - f.nx * v, s.z + u]);
  const box = (u: number, v: number, y: number, su: number, sv: number, sy: number, c: string): Part => {
    const [x, z] = toWorld(u, v);
    return { x, y, z, sx: alongX ? su : sv, sy, sz: alongX ? sv : su, c };
  };
  return { W, D, box };
}

export function partsFor(s: Infill) {
  const solid: Part[] = [];
  const glass: Part[] = [];
  const green: Part[] = [];
  const { W, D, box } = frame(s);
  const h = s.h;
  const r = (k: number) => hash01(s.id, k);
  const cream = ['#e8dcc4', '#efe6d4', '#d9cdb5', '#f2ede2'][Math.floor(r(1) * 4)];
  switch (s.kind) {
    case 'office': {
      const w = W * 0.62;
      const d = D * 0.55;
      glass.push(box(0, 0.1, h / 2, w, d, h, '#4f7fa3'));
      solid.push(box(0, 0.1, h + 0.08, w * 0.5, d * 0.5, 0.16, '#9aa1a8'), box(0, -d / 2 - 0.15, 0.32, w * 0.5, 0.3, 0.04, '#d8d8d2'));
      for (let i = 0; i < 4; i++) solid.push(box(-W * 0.35 + i * W * 0.23, D * 0.38, 0.03, 0.35, 0.7, 0.04, '#5c6066'));
      break;
    }
    case 'shops': {
      const n = 4;
      const uw = (W * 0.9) / n;
      const awn = ['#b8392f', '#2f7a4b', '#2f5c9e', '#c58a22'];
      for (let i = 0; i < n; i++) {
        const u = -W * 0.45 + uw * (i + 0.5);
        solid.push(box(u, 0.2, h / 2, uw - 0.04, D * 0.5, h, i % 2 ? cream : '#e2d5bd'));
        solid.push(box(u, 0.2 - D * 0.25 - 0.12, h * 0.75, uw - 0.08, 0.24, 0.035, awn[(i + Math.floor(r(2) * 4)) % 4]));
        glass.push(box(u, 0.2 - D * 0.25 - 0.01, h * 0.35, uw - 0.16, 0.02, h * 0.45, '#7aa0b8'));
      }
      break;
    }
    case 'cafe': {
      solid.push(box(0, 0.4, h / 2, W * 0.45, D * 0.4, h, cream), box(0, 0.4 - D * 0.2 - 0.02, h + 0.04, W * 0.5, 0.06, 0.08, '#6b4a2f'));
      glass.push(box(0, 0.4 - D * 0.2 - 0.01, h * 0.4, W * 0.35, 0.02, h * 0.5, '#86a9bd'));
      for (let i = 0; i < 4; i++) {
        const u = -W * 0.3 + i * W * 0.2;
        solid.push(box(u, -D * 0.25, 0.15, 0.02, 0.02, 0.3, '#8a8a85'), box(u, -D * 0.25, 0.31, 0.36, 0.36, 0.02, i % 2 ? '#f4f1ea' : '#2f6f62'));
      }
      green.push(box(-W * 0.42, -D * 0.25, 0.06, 0.12, D * 0.5, 0.12, '#3f7a3a'));
      break;
    }
    case 'fuel': {
      for (const [u, v] of [[-W * 0.28, -D * 0.2], [W * 0.28, -D * 0.2], [-W * 0.28, D * 0.08], [W * 0.28, D * 0.08]] as [number, number][]) solid.push(box(u, v, 0.25, 0.06, 0.06, 0.5, '#d9d9d4'));
      solid.push(box(0, -D * 0.06, 0.52, W * 0.7, D * 0.45, 0.06, '#f2f2ee'), box(0, -D * 0.06, 0.48, W * 0.72, D * 0.47, 0.04, '#c4262e'));
      for (const u of [-W * 0.14, W * 0.14]) solid.push(box(u, -D * 0.06, 0.09, 0.08, 0.16, 0.18, '#2b2f35'));
      solid.push(box(0, D * 0.32, 0.18, W * 0.4, D * 0.22, 0.36, cream));
      glass.push(box(0, D * 0.32 - D * 0.11 - 0.01, 0.15, W * 0.3, 0.02, 0.2, '#86a9bd'));
      break;
    }
    case 'showroom': {
      glass.push(box(0, 0.1, h / 2, W * 0.8, D * 0.5, h, '#6f97b4'));
      solid.push(box(0, 0.1, h + 0.03, W * 0.84, D * 0.54, 0.06, '#f0f0ec'), box(0, -D * 0.28, 0.4, W * 0.84, 0.04, 0.8, '#f0f0ec'));
      break;
    }
    case 'apartments': {
      const w = W * 0.7;
      const d = D * 0.5;
      solid.push(box(0, 0.15, h / 2, w, d, h, cream));
      const floors = Math.floor(h / 0.33);
      for (let f = 1; f < floors; f++) {
        solid.push(box(0, 0.15 - d / 2 - 0.06, f * 0.33, w * 0.9, 0.12, 0.025, '#bdb3a0'));
        glass.push(box(0, 0.15 - d / 2 - 0.005, f * 0.33 + 0.12, w * 0.8, 0.01, 0.12, '#5f88a6'));
      }
      solid.push(box(-w * 0.25, 0.15, h + 0.08, 0.2, 0.2, 0.16, '#e9e9e4'), box(w * 0.25, 0.15, h + 0.08, 0.2, 0.2, 0.16, '#e9e9e4'));
      for (let i = 0; i < 5; i++) solid.push(box(-W * 0.4 + i * W * 0.2, D * 0.4, 0.03, 0.3, 0.55, 0.04, '#5c6066'));
      break;
    }
    case 'townhouses': {
      const n = 4;
      const uw = (W * 0.88) / n;
      for (let i = 0; i < n; i++) {
        const u = -W * 0.44 + uw * (i + 0.5);
        const hh = h * (0.85 + 0.3 * (i % 2));
        solid.push(box(u, 0.25, hh / 2, uw - 0.06, D * 0.42, hh, i % 2 ? cream : '#e6d9c2'));
        solid.push(box(u, 0.25 - D * 0.21 - 0.01, 0.13, uw * 0.45, 0.02, 0.26, '#7a6a55'));
        green.push(box(u, -D * 0.22, 0.02, uw - 0.1, D * 0.2, 0.03, '#4d8a3f'));
        solid.push(box(u + uw / 2 - 0.03, -D * 0.22, 0.08, 0.04, D * 0.22, 0.16, '#d6c9b0'));
      }
      break;
    }
    case 'park': {
      green.push(box(0, 0, 0.015, W * 0.95, D * 0.95, 0.03, '#5d9a48'));
      solid.push(box(0, 0, 0.035, W * 0.9, 0.18, 0.01, '#d9cfbb'), box(0, 0, 0.035, 0.18, D * 0.9, 0.01, '#d9cfbb'));
      for (const [u, v] of [[-W * 0.3, -D * 0.25], [W * 0.3, D * 0.25]] as [number, number][]) {
        for (const [a, b] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) solid.push(box(u + a, v + b, 0.18, 0.04, 0.04, 0.36, '#cfc6b4'));
        solid.push(box(u, v, 0.38, 0.75, 0.75, 0.04, '#f1ece2'));
        solid.push(box(u, v, 0.06, 0.4, 0.1, 0.05, '#7a5b3a'));
      }
      for (let i = 0; i < 6; i++) {
        const [u, v] = [(r(10 + i) - 0.5) * W * 0.8, (r(20 + i) - 0.5) * D * 0.8];
        if (Math.abs(u) < 0.25 || Math.abs(v) < 0.25) continue;
        green.push(box(u, v, 0.35, 0.36, 0.36, 0.5, '#3f7a3a'));
      }
      break;
    }
  }
  return { solid, glass, green };
}

function Inst({ parts, kind }: { parts: Part[]; kind: 'solid' | 'glass' | 'green' }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const c = new Color();
    parts.forEach((p, i) => {
      tmp.position.set(p.x, p.y, p.z);
      tmp.scale.set(p.sx, p.sy, p.sz);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, c.set(p.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [parts]);
  if (!parts.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, parts.length]} castShadow={kind !== 'green'} receiveShadow raycast={noRaycast}>
      <boxGeometry />
      {kind === 'glass' ? <meshStandardMaterial roughness={0.15} metalness={0.6} /> : <meshStandardMaterial roughness={kind === 'green' ? 0.95 : 0.8} metalness={0.05} />}
    </instancedMesh>
  );
}

export function InfillBuildings() {
  const all = useMemo(() => {
    const out = { solid: [] as Part[], glass: [] as Part[], green: [] as Part[] };
    for (const s of INFILL) {
      const p = partsFor(s);
      out.solid.push(...p.solid);
      out.glass.push(...p.glass);
      out.green.push(...p.green);
    }
    return out;
  }, []);
  return (
    <group>
      <Inst parts={all.solid} kind="solid" />
      <Inst parts={all.glass} kind="glass" />
      <Inst parts={all.green} kind="green" />
    </group>
  );
}
