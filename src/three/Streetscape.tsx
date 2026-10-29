import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Material,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { STREETSCAPE } from '../data/streetscapeData';
import { PAINTS, PARKED_SCALE, type Parked } from '../data/streetscape';
import { vehicleGeometry, type VehicleKind } from './vehicles/vehicleModels';
import { createStateAttribute, createVehicleMaterial } from './vehicles/vehicleMaterial';

/**
 * The streetscape (src/data/streetscape.ts, precomputed): parked cars and trucks, bus shelters, park benches,
 * bins, zebra crossings and shade trees. Everything is instanced (one draw call per part) and ignores the
 * pointer, so picking buildings and roofs works as before. Low quality halves the parked cars and the trees
 * and drops their shadows. Ground paint (lots, driveways, aprons, bus bays) is in groundMap.ts.
 */

const noRaycast = () => {};
const UP = new Vector3(0, 1, 0);
const PAINT_COLORS = PAINTS.map((c) => new Color(c));

type Placement = { x: number; y: number; z: number; yaw: number; sx: number; sy: number; sz: number; color?: Color };

/** one instanced mesh from a list of placements (position, heading about +y, scale) */
function Instances({ geometry, material, items, shadows = false }: { geometry: BufferGeometry; material: Material; items: Placement[]; shadows?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    items.forEach((it, i) => {
      q.setFromAxisAngle(UP, it.yaw);
      m.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz));
      mesh.setMatrixAt(i, m);
      if (it.color) mesh.setColorAt(i, it.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={shadows} receiveShadow raycast={noRaycast} />;
}

function ParkedKind({ kind, cars, material, shadows }: { kind: VehicleKind; cars: Parked[]; material: Material; shadows: boolean }) {
  const geometry = useMemo(() => {
    const base = vehicleGeometry(kind);
    const g = new BufferGeometry();
    for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.getAttribute(name));
    // lights off: parked
    g.setAttribute('aState', createStateAttribute(cars.length) as InstancedBufferAttribute);
    g.boundingSphere = base.boundingSphere;
    return g;
  }, [kind, cars]);
  const items = useMemo(
    () => cars.map((c) => ({ x: c.x, y: 0.01, z: c.z, yaw: c.yaw, sx: PARKED_SCALE, sy: PARKED_SCALE, sz: PARKED_SCALE, color: PAINT_COLORS[c.paint % PAINT_COLORS.length] })),
    [cars],
  );
  return <Instances geometry={geometry} material={material} items={items} shadows={shadows} />;
}

function ParkedVehicles({ quality }: { quality: 'high' | 'low' }) {
  const material = useMemo(() => createVehicleMaterial('#e0b23a'), []);
  const groups = useMemo(() => {
    const keep = quality === 'low' ? STREETSCAPE.parked.filter((_, i) => i % 2 === 0) : STREETSCAPE.parked;
    const map = new Map<VehicleKind, Parked[]>();
    for (const c of keep) map.set(c.kind, [...(map.get(c.kind) ?? []), c]);
    return [...map.entries()];
  }, [quality]);
  return (
    <group>
      {groups.map(([kind, cars]) => (
        <ParkedKind key={kind} kind={kind} cars={cars} material={material} shadows={quality === 'high'} />
      ))}
    </group>
  );
}

/** a point offset in a prop's local frame: a along its heading, b across it */
const local = (x: number, z: number, yaw: number, a: number, b: number) => ({ x: x + Math.sin(yaw) * a + Math.cos(yaw) * b, z: z + Math.cos(yaw) * a - Math.sin(yaw) * b });

function Furniture() {
  const parts = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const cyl = new CylinderGeometry(0.5, 0.5, 1, 10);
    cyl.translate(0, 0.5, 0);
    return { box, cyl };
  }, []);
  const mats = useMemo(
    () => ({
      steel: new MeshStandardMaterial({ color: '#9aa1a9', roughness: 0.45, metalness: 0.6 }),
      roof: new MeshStandardMaterial({ color: '#e9e6df', roughness: 0.6 }),
      glass: new MeshStandardMaterial({ color: '#9fc4d6', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.45 }),
      wood: new MeshStandardMaterial({ color: '#8a6a48', roughness: 0.85 }),
      bin: new MeshStandardMaterial({ color: '#2f6b4f', roughness: 0.7 }),
      sign: new MeshStandardMaterial({ color: '#1f5fae', roughness: 0.5, emissive: '#1f5fae', emissiveIntensity: 0.35 }),
      zebra: new MeshStandardMaterial({ color: '#eceae4', roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
    }),
    [],
  );

  const built = useMemo(() => {
    const posts: Placement[] = [];
    const roofs: Placement[] = [];
    const panes: Placement[] = [];
    const seats: Placement[] = [];
    const signs: Placement[] = [];
    const bins: Placement[] = [];
    const stripes: Placement[] = [];
    for (const s of STREETSCAPE.stops) {
      // back panel on the side away from the road
      const side = Math.sign(s.fx * Math.cos(s.yaw) - s.fz * Math.sin(s.yaw)) || 1;
      for (const a of [-0.44, 0.44]) {
        const p = local(s.x, s.z, s.yaw, a, -side * 0.15);
        posts.push({ ...p, y: 0, yaw: s.yaw, sx: 0.03, sy: 0.3, sz: 0.03 });
      }
      roofs.push({ x: s.x, z: s.z, y: 0.3, yaw: s.yaw, sx: 0.4, sy: 0.03, sz: 0.98 });
      const back = local(s.x, s.z, s.yaw, 0, -side * 0.16);
      panes.push({ ...back, y: 0.03, yaw: s.yaw, sx: 0.015, sy: 0.26, sz: 0.88 });
      const seat = local(s.x, s.z, s.yaw, 0, -side * 0.08);
      seats.push({ ...seat, y: 0.06, yaw: s.yaw, sx: 0.1, sy: 0.025, sz: 0.6 });
      const pole = local(s.x, s.z, s.yaw, -0.62, side * 0.05);
      posts.push({ ...pole, y: 0, yaw: s.yaw, sx: 0.02, sy: 0.4, sz: 0.02 });
      signs.push({ ...pole, y: 0.36, yaw: s.yaw, sx: 0.02, sy: 0.1, sz: 0.12 });
    }
    for (const b of STREETSCAPE.benches) {
      seats.push({ x: b.x, z: b.z, y: 0.045, yaw: b.yaw, sx: 0.12, sy: 0.025, sz: 0.5 });
      const back = local(b.x, b.z, b.yaw, 0, -0.06);
      seats.push({ ...back, y: 0.07, yaw: b.yaw, sx: 0.02, sy: 0.06, sz: 0.5 });
      for (const a of [-0.2, 0.2]) {
        const p = local(b.x, b.z, b.yaw, a, 0);
        posts.push({ ...p, y: 0, yaw: b.yaw, sx: 0.1, sy: 0.045, sz: 0.02 });
      }
    }
    for (const b of STREETSCAPE.bins) bins.push({ x: b.x, z: b.z, y: 0, yaw: 0, sx: 0.07, sy: 0.1, sz: 0.07 });
    // zebra crossings: stripes running along the road, laid across the carriageway
    for (const c of STREETSCAPE.crossings) {
      const n = Math.max(3, Math.floor(c.wid / 0.14));
      for (let i = 0; i < n; i++) {
        const b = (i - (n - 1) / 2) * (c.wid / n);
        const p = local(c.x, c.z, c.yaw, 0, b);
        stripes.push({ ...p, y: 0.004, yaw: c.yaw, sx: c.wid / n / 2, sy: 0.003, sz: 0.36 });
      }
    }
    return { posts, roofs, panes, seats, signs, bins, stripes };
  }, []);

  return (
    <group>
      <Instances geometry={parts.box} material={mats.steel} items={built.posts} />
      <Instances geometry={parts.box} material={mats.roof} items={built.roofs} shadows />
      <Instances geometry={parts.box} material={mats.glass} items={built.panes} />
      <Instances geometry={parts.box} material={mats.wood} items={built.seats} />
      <Instances geometry={parts.box} material={mats.sign} items={built.signs} />
      <Instances geometry={parts.cyl} material={mats.bin} items={built.bins} />
      <Instances geometry={parts.box} material={mats.zebra} items={built.stripes} />
    </group>
  );
}

const CROWNS = ['#4f7a3a', '#5c8743', '#476f35', '#6b8f4a', '#3f6a33'].map((c) => new Color(c));

/** shade trees (ghaf / neem): a trunk and a rounded crown each, lightly varied in size and green */
function Trees({ quality }: { quality: 'high' | 'low' }) {
  const geo = useMemo(() => {
    const trunk = new CylinderGeometry(0.035, 0.05, 1, 6);
    trunk.translate(0, 0.5, 0);
    const crown = new IcosahedronGeometry(1, 1);
    return { trunk, crown };
  }, []);
  const mats = useMemo(
    () => ({ trunk: new MeshStandardMaterial({ color: '#6b5440', roughness: 0.9 }), crown: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }) }),
    [],
  );
  const items = useMemo(() => {
    const trees = quality === 'low' ? STREETSCAPE.trees.filter((_, i) => i % 2 === 0) : STREETSCAPE.trees;
    const trunks: Placement[] = [];
    const crowns: Placement[] = [];
    trees.forEach((t, i) => {
      trunks.push({ x: t.x, z: t.z, y: 0, yaw: 0, sx: t.s, sy: 0.32 * t.s, sz: t.s });
      crowns.push({ x: t.x, z: t.z, y: 0.42 * t.s, yaw: i, sx: 0.3 * t.s, sy: 0.22 * t.s, sz: 0.3 * t.s, color: CROWNS[i % CROWNS.length] });
    });
    return { trunks, crowns };
  }, [quality]);
  return (
    <group>
      <Instances geometry={geo.trunk} material={mats.trunk} items={items.trunks} />
      <Instances geometry={geo.crown} material={mats.crown} items={items.crowns} shadows={quality === 'high'} />
    </group>
  );
}

export function Streetscape({ quality }: { quality: 'high' | 'low' }) {
  return (
    <group>
      <ParkedVehicles quality={quality} />
      <Furniture />
      <Trees quality={quality} />
    </group>
  );
}
