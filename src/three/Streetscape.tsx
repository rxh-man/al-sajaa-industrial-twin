import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
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
import { vehicleGeometry, vehicleProxyGeometry, type VehicleKind } from './vehicles/vehicleModels';
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

/** distance (scene units) inside which a parked vehicle is drawn with its full model */
const LOD_NEAR = 30;

function instancedVehicle(base: BufferGeometry, count: number) {
  const g = new BufferGeometry();
  for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.getAttribute(name));
  // lights off: parked
  g.setAttribute('aState', createStateAttribute(count) as InstancedBufferAttribute);
  g.boundingSphere = base.boundingSphere;
  return g;
}

/**
 * One model's parked vehicles in two instanced meshes: the full model near the camera, a 72-triangle proxy
 * (vehicleProxyGeometry) further out. The split is recomputed only when the camera has moved, at most four
 * times a second; each mesh draws just its own share (mesh.count).
 */
function ParkedKind({ kind, cars, material }: { kind: VehicleKind; cars: Parked[]; material: Material }) {
  const fullRef = useRef<InstancedMesh>(null);
  const farRef = useRef<InstancedMesh>(null);
  const geos = useMemo(() => ({ full: instancedVehicle(vehicleGeometry(kind), cars.length), far: instancedVehicle(vehicleProxyGeometry(kind), cars.length) }), [kind, cars]);
  const mats = useMemo(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3(PARKED_SCALE, PARKED_SCALE, PARKED_SCALE);
    return cars.map((c) => m.compose(p.set(c.x, 0.01, c.z), q.setFromAxisAngle(UP, c.yaw), s).clone());
  }, [cars]);
  const colors = useMemo(() => cars.map((c) => PAINT_COLORS[c.paint % PAINT_COLORS.length]), [cars]);
  const last = useRef({ x: Infinity, z: Infinity, y: Infinity, t: -1 });

  useFrame(({ camera }) => {
    const full = fullRef.current;
    const far = farRef.current;
    if (!full || !far) return;
    const L = last.current;
    const cp = camera.position;
    const moved = Math.abs(cp.x - L.x) + Math.abs(cp.y - L.y) + Math.abs(cp.z - L.z);
    // wall-clock throttle (the scene clock can be stepped or paused by the motion setting and dev hooks)
    const now = performance.now() / 1000;
    if (moved < 0.5 || now - L.t < 0.25) return;
    L.x = cp.x;
    L.y = cp.y;
    L.z = cp.z;
    L.t = now;
    let n = 0;
    let f = 0;
    const near2 = LOD_NEAR * LOD_NEAR;
    cars.forEach((c, i) => {
      const d2 = (c.x - cp.x) ** 2 + (c.z - cp.z) ** 2 + cp.y * cp.y;
      if (d2 < near2) {
        full.setMatrixAt(n, mats[i]);
        full.setColorAt(n++, colors[i]);
      } else {
        far.setMatrixAt(f, mats[i]);
        far.setColorAt(f++, colors[i]);
      }
    });
    full.count = n;
    far.count = f;
    full.instanceMatrix.needsUpdate = true;
    far.instanceMatrix.needsUpdate = true;
    if (full.instanceColor) full.instanceColor.needsUpdate = true;
    if (far.instanceColor) far.instanceColor.needsUpdate = true;
  });

  // bounds cover the whole set, so a mesh is not culled while it holds a share of the cars
  useLayoutEffect(() => {
    for (const mesh of [fullRef.current, farRef.current]) {
      if (!mesh) continue;
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.setColorAt(0, colors[0]);
      mesh.computeBoundingSphere();
      mesh.count = 0;
    }
  }, [mats, colors]);

  return (
    <group>
      <instancedMesh ref={fullRef} args={[geos.full, material, cars.length]} receiveShadow raycast={noRaycast} />
      <instancedMesh ref={farRef} args={[geos.far, material, cars.length]} receiveShadow raycast={noRaycast} />
    </group>
  );
}

/** a set of parked vehicles, one instanced mesh per model (also used by the lagoon community) */
export function ParkedSet({ cars }: { cars: Parked[]; shadows?: boolean }) {
  const material = useMemo(() => createVehicleMaterial('#e0b23a'), []);
  const groups = useMemo(() => {
    const map = new Map<VehicleKind, Parked[]>();
    for (const c of cars) map.set(c.kind, [...(map.get(c.kind) ?? []), c]);
    return [...map.entries()];
  }, [cars]);
  return (
    <group>
      {groups.map(([kind, list]) => (
        <ParkedKind key={kind} kind={kind} cars={list} material={material} />
      ))}
    </group>
  );
}

function ParkedVehicles({ quality }: { quality: 'high' | 'low' }) {
  const cars = useMemo(() => (quality === 'low' ? STREETSCAPE.parked.filter((_, i) => i % 2 === 0) : STREETSCAPE.parked), [quality]);
  return <ParkedSet cars={cars} shadows={quality === 'high'} />;
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
  return <TreeSet trees={STREETSCAPE.trees} quality={quality} />;
}

export function TreeSet({ trees: all, quality }: { trees: { x: number; z: number; s: number }[]; quality: 'high' | 'low' }) {
  const geo = useMemo(() => {
    const trunk = new CylinderGeometry(0.035, 0.05, 1, 6);
    trunk.translate(0, 0.5, 0);
    const crown = new IcosahedronGeometry(1, 0); // 20 faces: flat-shaded crowns read the same at street scale
    return { trunk, crown };
  }, []);
  const mats = useMemo(
    () => ({ trunk: new MeshStandardMaterial({ color: '#6b5440', roughness: 0.9 }), crown: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }) }),
    [],
  );
  const items = useMemo(() => {
    const trees = quality === 'low' ? all.filter((_, i) => i % 2 === 0) : all;
    const trunks: Placement[] = [];
    const crowns: Placement[] = [];
    trees.forEach((t, i) => {
      trunks.push({ x: t.x, z: t.z, y: 0, yaw: 0, sx: t.s, sy: 0.32 * t.s, sz: t.s });
      crowns.push({ x: t.x, z: t.z, y: 0.42 * t.s, yaw: i, sx: 0.3 * t.s, sy: 0.22 * t.s, sz: 0.3 * t.s, color: CROWNS[i % CROWNS.length] });
    });
    return { trunks, crowns };
  }, [quality, all]);
  return (
    <group>
      <Instances geometry={geo.trunk} material={mats.trunk} items={items.trunks} />
      <Instances geometry={geo.crown} material={mats.crown} items={items.crowns} shadows={quality === 'high'} />
    </group>
  );
}

/**
 * Emirati villa details on the baseline villas: crenellated sharafat parapets along the roof edge, a barjeel
 * (wind tower) on some, a columned portico with an arched door on the street side, and the compound wall
 * with its gate (the wall pieces come from streetscape.ts so the cars and trees keep clear of them).
 */
function VillaDetails() {
  const geo = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    // a half disc standing upright: the arch over the door
    const arch = new CylinderGeometry(0.5, 0.5, 1, 14, 1, false, -Math.PI / 2, Math.PI);
    arch.rotateX(Math.PI / 2);
    return { box, arch };
  }, []);
  const mats = useMemo(
    () => ({
      lime: new MeshStandardMaterial({ color: '#f1ece2', roughness: 0.75 }),
      wall: new MeshStandardMaterial({ color: '#d8c9ac', roughness: 0.85 }),
      door: new MeshStandardMaterial({ color: '#5a4330', roughness: 0.7 }),
      vent: new MeshStandardMaterial({ color: '#2e2a26', roughness: 0.9 }),
    }),
    [],
  );
  const built = useMemo(() => {
    const merlons: Placement[] = [];
    const lime: Placement[] = [];
    const doors: Placement[] = [];
    const arches: Placement[] = [];
    const vents: Placement[] = [];
    const walls: Placement[] = [];
    for (const v of STREETSCAPE.villas) {
      const [x0, z0, x1, z1] = v.b;
      const top = v.h;
      // sharafat: small stepped merlons every ~0.18 along each roof edge
      const edge = (ax: number, az: number, bx: number, bz: number) => {
        const L = Math.hypot(bx - ax, bz - az);
        const n = Math.max(2, Math.round(L / 0.18));
        const yaw = Math.atan2(bx - ax, bz - az);
        for (let i = 0; i <= n; i++) merlons.push({ x: ax + ((bx - ax) * i) / n, z: az + ((bz - az) * i) / n, y: top, yaw, sx: 0.06, sy: 0.07, sz: 0.07 });
      };
      const i = 0.03;
      edge(x0 + i, z0 + i, x1 - i, z0 + i);
      edge(x0 + i, z1 - i, x1 - i, z1 - i);
      edge(x0 + i, z0 + i, x0 + i, z1 - i);
      edge(x1 - i, z0 + i, x1 - i, z1 - i);
      // the street-side face: centre, outward normal, and the heading along the face
      const f = [
        { x: (x0 + x1) / 2, z: z0, nx: 0, nz: -1 },
        { x: (x0 + x1) / 2, z: z1, nx: 0, nz: 1 },
        { x: x0, z: (z0 + z1) / 2, nx: -1, nz: 0 },
        { x: x1, z: (z0 + z1) / 2, nx: 1, nz: 0 },
      ][v.front];
      const along = Math.atan2(-f.nz, f.nx); // heading parallel to the face
      const face = Math.atan2(f.nx, f.nz);
      const colH = Math.min(0.32, top * 0.75);
      for (const s of [-0.24, 0.24]) {
        const p = local(f.x + f.nx * 0.16, f.z + f.nz * 0.16, along, s, 0);
        lime.push({ ...p, y: 0, yaw: along, sx: 0.06, sy: colH, sz: 0.06 });
      }
      lime.push({ x: f.x + f.nx * 0.09, z: f.z + f.nz * 0.09, y: colH, yaw: face, sx: 0.62, sy: 0.05, sz: 0.2 });
      doors.push({ x: f.x + f.nx * 0.006, z: f.z + f.nz * 0.006, y: 0, yaw: face, sx: 0.2, sy: colH * 0.62, sz: 0.012 });
      arches.push({ x: f.x + f.nx * 0.006, z: f.z + f.nz * 0.006, y: colH * 0.62, yaw: face, sx: 0.2, sy: 0.2, sz: 0.012 });
      // barjeel: a square tower over a back corner, with dark vents on each face
      if (v.tower) {
        const tx = f.nx !== 0 ? (f.nx > 0 ? x0 + 0.22 : x1 - 0.22) : x0 + 0.22;
        const tz = f.nz !== 0 ? (f.nz > 0 ? z0 + 0.22 : z1 - 0.22) : z0 + 0.22;
        lime.push({ x: tx, z: tz, y: top, yaw: 0, sx: 0.26, sy: 0.3, sz: 0.26 });
        for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) vents.push({ x: tx + dx * 0.131, z: tz + dz * 0.131, y: top + 0.1, yaw: Math.atan2(dx, dz), sx: 0.16, sy: 0.16, sz: 0.004 });
        lime.push({ x: tx, z: tz, y: top + 0.3, yaw: 0, sx: 0.3, sy: 0.03, sz: 0.3 });
      }
    }
    for (const w of STREETSCAPE.walls) {
      walls.push({ x: w.x, z: w.z, y: 0, yaw: w.yaw, sx: 0.05, sy: 0.16, sz: w.len + 0.01 });
      lime.push({ x: w.x, z: w.z, y: 0.16, yaw: w.yaw, sx: 0.07, sy: 0.02, sz: w.len + 0.01 });
    }
    return { merlons, lime, doors, arches, vents, walls };
  }, []);
  return (
    <group>
      <Instances geometry={geo.box} material={mats.lime} items={built.merlons} />
      <Instances geometry={geo.box} material={mats.lime} items={built.lime} shadows />
      <Instances geometry={geo.box} material={mats.door} items={built.doors} />
      <Instances geometry={geo.arch} material={mats.door} items={built.arches} />
      <Instances geometry={geo.box} material={mats.vent} items={built.vents} />
      <Instances geometry={geo.box} material={mats.wall} items={built.walls} shadows />
    </group>
  );
}

export function Streetscape({ quality }: { quality: 'high' | 'low' }) {
  return (
    <group>
      <VillaDetails />
      <ParkedVehicles quality={quality} />
      <Furniture />
      <Trees quality={quality} />
    </group>
  );
}
