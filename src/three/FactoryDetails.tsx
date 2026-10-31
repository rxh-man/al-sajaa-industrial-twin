import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Object3D, type InstancedMesh } from 'three';
import { FACILITIES, hash01, type Facility } from '../sustainability/facilities';
import { kerbDistance } from '../data/spatial';

/**
 * Industrial character for the existing factory and workshop buildings, driven by each facility's modelled
 * category (sustainability/facilities.ts), so what you see matches what the Command Centre models:
 *  - exhaust stacks where the category burns fuel or has process emissions (the main stack stands at the
 *    building centre, where the air model's plume starts), taller for heavy and chemical plants;
 *  - rooftop process tanks for chemical, food and plastics plants;
 *  - HVAC units on every factory roof, more on larger halls; roof vents on metal and workshop roofs;
 *  - loading-dock doors on the facade that faces the nearest road.
 * Everything sits on or against the existing footprints (no new land use). Five instanced draw calls.
 */

const noRaycast = () => {};
const tmp = new Object3D();

type Inst = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; c: string };

const STACKS: Record<string, { n: number; h: number; r: number }> = {
  heavy: { n: 2, h: 2.4, r: 0.18 },
  chemical: { n: 2, h: 2.8, r: 0.12 },
  materials: { n: 1, h: 2.2, r: 0.22 },
  food: { n: 1, h: 1.2, r: 0.14 },
  plastics: { n: 1, h: 1.6, r: 0.13 },
  recycling: { n: 1, h: 1.4, r: 0.15 },
  metal: { n: 1, h: 1.3, r: 0.12 },
};
const TANKS = new Set(['chemical', 'food', 'plastics']);

function build(list: Facility[]) {
  const stacks: Inst[] = [];
  const tanks: Inst[] = [];
  const hvac: Inst[] = [];
  const vents: Inst[] = [];
  const doors: Inst[] = [];
  for (const f of list) {
    const [x0, z0, x1, z1] = f.boxes[0];
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    if (w < 0.8 || d < 0.8) continue;
    const top = f.top;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const h = (k: number) => hash01(f.id, 40 + k);
    const inRoof = (u: number, v: number, m = 0.35): [number, number] => [x0 + m + (w - 2 * m) * u, z0 + m + (d - 2 * m) * v];
    const cat = f.category.id;
    // stacks: the first at the centre (the air model's plume source), others offset along the long side
    const st = STACKS[cat];
    if (st) {
      for (let i = 0; i < st.n; i++) {
        const [sx, sz] = i === 0 ? [cx, cz] : w > d ? [cx + (i % 2 ? 1 : -1) * Math.min(w * 0.3, 1.2), cz] : [cx, cz + (i % 2 ? 1 : -1) * Math.min(d * 0.3, 1.2)];
        const hh = st.h * (0.8 + 0.4 * h(i));
        stacks.push({ x: sx, y: top + hh / 2, z: sz, sx: st.r, sy: hh, sz: st.r, c: f.mitigation === 'none' ? '#b9b2a6' : '#d9dde2' });
      }
    }
    if (TANKS.has(cat)) {
      const n = 2 + Math.floor(h(5) * 3);
      for (let i = 0; i < n; i++) {
        const [tx, tz] = inRoof(0.15 + 0.7 * (i / Math.max(1, n - 1)), 0.2 + 0.1 * h(6 + i));
        tanks.push({ x: tx, y: top + 0.3, z: tz, sx: 0.28, sy: 0.6, sz: 0.28, c: cat === 'chemical' ? '#e8e4dc' : cat === 'food' ? '#cfd6dc' : '#d6d0c4' });
      }
    }
    if (f.category.group === 'factory' || cat === 'workshop') {
      // HVAC: one unit per ~400 m² of roof, along the far half of the roof
      const n = Math.max(1, Math.min(10, Math.round((w * d * 100) / 400)));
      for (let i = 0; i < n; i++) {
        const [hx, hz] = inRoof(h(10 + i), 0.55 + 0.4 * h(30 + i));
        hvac.push({ x: hx, y: top + 0.09, z: hz, sx: 0.32, sy: 0.18, sz: 0.24, ry: w > d ? 0 : Math.PI / 2, c: '#aeb4ba' });
      }
    }
    if (cat === 'metal' || cat === 'workshop' || cat === 'automotive') {
      // ridge vents / skylight strips along the long axis
      const along = w > d;
      const L = (along ? w : d) - 0.8;
      for (const off of [-0.25, 0.25]) {
        vents.push({ x: along ? cx : cx + off * w, y: top + 0.04, z: along ? cz + off * d : cz, sx: along ? L : 0.18, sy: 0.08, sz: along ? 0.18 : L, c: cat === 'automotive' ? '#7fa3b8' : '#8d949b' });
      }
    }
    // loading docks on the facade nearest a road
    if (f.category.group !== 'storage') {
      const sides = [
        { nx: 0, nz: -1, mx: cx, mz: z0, len: w },
        { nx: 0, nz: 1, mx: cx, mz: z1, len: w },
        { nx: -1, nz: 0, mx: x0, mz: cz, len: d },
        { nx: 1, nz: 0, mx: x1, mz: cz, len: d },
      ].map((s) => ({ ...s, k: kerbDistance(s.mx + s.nx * 1.2, s.mz + s.nz * 1.2, 4) }));
      const s = sides.sort((a, b) => a.k - b.k)[0];
      if (s.k < 4) {
        const n = Math.max(1, Math.min(f.category.group === 'logistics' ? 8 : 4, Math.floor(s.len / 0.75)));
        const doorH = Math.min(0.48, Math.max(0.3, (top - 0.02) * 0.6));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n - 0.5;
          const along = s.nx === 0;
          doors.push({ x: s.mx + (along ? t * s.len * 0.85 : s.nx * 0.015), y: doorH / 2, z: s.mz + (along ? s.nz * 0.015 : t * s.len * 0.85), sx: along ? 0.42 : 0.03, sy: doorH, sz: along ? 0.03 : 0.42, c: '#3b4148' });
        }
      }
    }
  }
  return { stacks, tanks, hvac, vents, doors };
}

function Instanced({ items, geom, castShadow = false }: { items: Inst[]; geom: 'box' | 'cyl'; castShadow?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const c = new Color();
    items.forEach((it, i) => {
      tmp.position.set(it.x, it.y, it.z);
      tmp.rotation.set(0, it.ry ?? 0, 0);
      tmp.scale.set(it.sx, it.sy, it.sz);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, c.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={castShadow} receiveShadow raycast={noRaycast}>
      {geom === 'box' ? <boxGeometry /> : <cylinderGeometry args={[1, 1.08, 1, 12, 1]} />}
      <meshStandardMaterial roughness={0.75} metalness={0.1} />
    </instancedMesh>
  );
}

export function FactoryDetails() {
  const d = useMemo(() => build(FACILITIES), []);
  return (
    <group>
      <Instanced items={d.stacks} geom="cyl" castShadow />
      <Instanced items={d.tanks} geom="cyl" />
      <Instanced items={d.hvac} geom="box" />
      <Instanced items={d.vents} geom="box" />
      <Instanced items={d.doors} geom="box" />
    </group>
  );
}

/** exported for tests: the counts and positions the scene draws */
export const factoryDetailsFor = build;
