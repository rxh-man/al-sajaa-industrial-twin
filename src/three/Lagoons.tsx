import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { LAGOONS, type XZ } from '../data/abudhabi';
import { ParkedSet, TreeSet } from './Streetscape';
import type { Parked } from '../data/streetscape';

/**
 * Al Sajaa Lagoons (scripts/build-lagoons.py; procedural, not a real development): the painted ground of the
 * community (landscaping, lawns, beaches, roads, the football pitch), the lagoon and lake water, villas turned
 * to follow their curving streets (white and beige, dark slate roofs, many with an upper floor, pools behind),
 * the cars on their frontages, the bridge and the domed community centre. Its roads and palms are part of the
 * world (abudhabi.ts), so traffic, street lights and the palm groves pick them up. Everything ignores the pointer.
 */

const noRaycast = () => {};
const UP = new Vector3(0, 1, 0);
const RECT = LAGOONS.meta.rect;
const PX = 16;

type Placement = { x: number; y: number; z: number; yaw: number; sx: number; sy: number; sz: number; color?: Color };

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

/** a point in a villa's frame: a along its depth axis (toward the back), b across its width */
const at = (x: number, z: number, yaw: number, a: number, b: number) => ({ x: x + Math.sin(yaw) * a + Math.cos(yaw) * b, z: z + Math.cos(yaw) * a - Math.sin(yaw) * b });

function groundTexture() {
  const W = RECT.maxX - RECT.minX;
  const H = RECT.maxZ - RECT.minZ;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * PX);
  canvas.height = Math.round(H * PX);
  const g = canvas.getContext('2d')!;
  const X = (x: number) => (x - RECT.minX) * PX;
  const Y = (z: number) => (z - RECT.minZ) * PX;
  const poly = (pts: XZ[]) => {
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
    g.closePath();
  };
  const line = (pts: XZ[]) => {
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
  };
  // landscaped ground: warm sand with soft green patches
  g.fillStyle = '#b9a988';
  g.fillRect(0, 0, canvas.width, canvas.height);
  // gardens: a lawn around each villa plot
  g.fillStyle = '#6f8f4e';
  for (const v of LAGOONS.villas) {
    g.save();
    g.translate(X(v.x), Y(v.z));
    g.rotate(Math.atan2(Math.cos(v.yaw), Math.sin(v.yaw)));
    g.fillRect((-v.d / 2 - 0.15) * PX, (-v.w / 2 - 0.2) * PX, (v.d + 1.15) * PX, (v.w + 0.4) * PX);
    g.restore();
  }
  for (const l of LAGOONS.lawns) {
    g.fillStyle = '#5f8a45';
    poly(l);
    g.fill();
  }
  // beaches and the water (the water mesh sits on top; this is its shoreline)
  g.lineJoin = 'round';
  for (const w of LAGOONS.water) {
    g.strokeStyle = '#e6d7ae';
    g.lineWidth = 0.9 * PX;
    poly(w);
    g.stroke();
    g.fillStyle = '#2aaab3';
    poly(w);
    g.fill();
  }
  // football pitch
  const p = LAGOONS.pitch;
  g.fillStyle = '#3f8a3a';
  g.fillRect(X(p.x0), Y(p.z0), (p.x1 - p.x0) * PX, (p.z1 - p.z0) * PX);
  g.strokeStyle = 'rgba(245,245,240,0.9)';
  g.lineWidth = 1.4;
  g.strokeRect(X(p.x0 + 0.2), Y(p.z0 + 0.2), (p.x1 - p.x0 - 0.4) * PX, (p.z1 - p.z0 - 0.4) * PX);
  g.beginPath();
  g.moveTo(X((p.x0 + p.x1) / 2), Y(p.z0 + 0.2));
  g.lineTo(X((p.x0 + p.x1) / 2), Y(p.z1 - 0.2));
  g.stroke();
  g.beginPath();
  g.arc(X((p.x0 + p.x1) / 2), Y((p.z0 + p.z1) / 2), 0.9 * PX, 0, Math.PI * 2);
  g.stroke();
  for (const side of [0, 1]) {
    const x = side ? p.x1 - 0.2 - 1.6 : p.x0 + 0.2;
    g.strokeRect(X(x), Y((p.z0 + p.z1) / 2 - 2.0), 1.6 * PX, 4.0 * PX);
  }
  // roads: kerb, asphalt, a dashed centre line; driveways across the frontages
  g.lineCap = 'round';
  for (const r of LAGOONS.roads) {
    g.strokeStyle = '#a49e94';
    g.lineWidth = (r.w + 0.35) * PX;
    line(r.p);
    g.stroke();
  }
  for (const r of LAGOONS.roads) {
    g.strokeStyle = r.c === 'secondary' ? '#2c2e33' : '#34363b';
    g.lineWidth = r.w * PX;
    line(r.p);
    g.stroke();
  }
  g.lineCap = 'butt';
  g.setLineDash([0.3 * PX, 0.5 * PX]);
  g.strokeStyle = 'rgba(236,236,232,0.7)';
  g.lineWidth = 1.1;
  for (const r of LAGOONS.roads) {
    if (r.c !== 'secondary') continue;
    line(r.p);
    g.stroke();
  }
  g.setLineDash([]);
  g.fillStyle = '#c9bfae';
  for (const c of LAGOONS.cars) {
    g.save();
    g.translate(X(c.x), Y(c.z));
    g.rotate(Math.atan2(Math.cos(c.yaw), Math.sin(c.yaw)));
    g.fillRect(-0.45 * PX, -0.2 * PX, 0.9 * PX, 0.4 * PX);
    g.restore();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return tex;
}

function LagoonGround() {
  const material = useMemo(() => new MeshStandardMaterial({ map: groundTexture(), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1 }), []);
  const w = RECT.maxX - RECT.minX;
  const h = RECT.maxZ - RECT.minZ;
  return (
    <mesh position={[(RECT.minX + RECT.maxX) / 2, 0.004, (RECT.minZ + RECT.maxZ) / 2]} rotation-x={-Math.PI / 2} material={material} receiveShadow raycast={noRaycast}>
      <planeGeometry args={[w, h]} />
    </mesh>
  );
}

function Water() {
  const geometry = useMemo(() => {
    const shapes = LAGOONS.water.map((w) => {
      const s = new Shape();
      // the shape is drawn in (x, -z) so that rotating it flat (−90° about x) lands it on (x, z)
      w.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
      s.closePath();
      return s;
    });
    return new ShapeGeometry(shapes, 4);
  }, []);
  const material = useMemo(
    () => new MeshStandardMaterial({ color: '#25b6c0', roughness: 0.08, metalness: 0.15, emissive: '#0b5c63', emissiveIntensity: 0.35, envMapIntensity: 1.4 }),
    [],
  );
  return <mesh geometry={geometry} material={material} rotation-x={-Math.PI / 2} position={[0, 0.014, 0]} receiveShadow raycast={noRaycast} />;
}

function Villas() {
  const geo = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    return { box };
  }, []);
  const mats = useMemo(
    () => ({
      body: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }),
      roof: new MeshStandardMaterial({ color: '#3a3f47', roughness: 0.6, metalness: 0.1 }),
      glass: new MeshStandardMaterial({ color: '#1f3442', roughness: 0.15, metalness: 0.5, emissive: '#ffcf8a', emissiveIntensity: 0.18 }),
      pool: new MeshStandardMaterial({ color: '#3fd0e0', roughness: 0.05, metalness: 0.1, emissive: '#1a8a96', emissiveIntensity: 0.4 }),
      white: new MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.6 }),
    }),
    [],
  );
  const built = useMemo(() => {
    const bodies: Placement[] = [];
    const roofs: Placement[] = [];
    const glass: Placement[] = [];
    const pools: Placement[] = [];
    for (const v of LAGOONS.villas) {
      const color = new Color(v.tint[0], v.tint[1], v.tint[2]);
      const ground = v.upper ? v.h * 0.55 : v.h;
      bodies.push({ x: v.x, z: v.z, y: 0, yaw: v.yaw, sx: v.w, sy: ground, sz: v.d, color });
      roofs.push({ x: v.x, z: v.z, y: ground, yaw: v.yaw, sx: v.w + 0.1, sy: 0.04, sz: v.d + 0.1 });
      // the street face is at -d/2 along the depth axis
      const front = at(v.x, v.z, v.yaw, -v.d / 2 - 0.004, 0);
      glass.push({ ...front, y: ground * 0.35, yaw: v.yaw, sx: v.w * 0.72, sy: ground * 0.32, sz: 0.008 });
      if (v.upper) {
        // a set-back upper floor with its own slab, toward the back of the plot
        const up = at(v.x, v.z, v.yaw, 0.12, 0.1);
        const uh = v.h - ground + 0.12;
        bodies.push({ ...up, y: ground, yaw: v.yaw, sx: v.w * 0.62, sy: uh, sz: v.d * 0.66, color });
        roofs.push({ ...up, y: ground + uh, yaw: v.yaw, sx: v.w * 0.62 + 0.14, sy: 0.04, sz: v.d * 0.66 + 0.14 });
        const uf = at(up.x, up.z, v.yaw, -v.d * 0.33 - 0.004, 0);
        glass.push({ ...uf, y: ground + uh * 0.3, yaw: v.yaw, sx: v.w * 0.45, sy: uh * 0.45, sz: 0.008 });
      }
      if (v.pool) {
        const [px, pz, pyaw, pw, pd] = v.pool;
        pools.push({ x: px, z: pz, y: 0.006, yaw: pyaw, sx: pw, sy: 0.02, sz: pd });
      }
    }
    return { bodies, roofs, glass, pools };
  }, []);
  return (
    <group>
      <Instances geometry={geo.box} material={mats.body} items={built.bodies} shadows />
      <Instances geometry={geo.box} material={mats.roof} items={built.roofs} shadows />
      <Instances geometry={geo.box} material={mats.glass} items={built.glass} />
      <Instances geometry={geo.box} material={mats.pool} items={built.pools} />
    </group>
  );
}

function ParkAndBridge() {
  const mats = useMemo(
    () => ({
      white: new MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.55 }),
      dome: new MeshStandardMaterial({ color: '#e9e2d0', roughness: 0.4, metalness: 0.2 }),
      glass: new MeshStandardMaterial({ color: '#1f3442', roughness: 0.15, metalness: 0.5, emissive: '#ffcf8a', emissiveIntensity: 0.25 }),
      rail: new MeshStandardMaterial({ color: '#c9cdd2', roughness: 0.4, metalness: 0.6 }),
    }),
    [],
  );
  const c = LAGOONS.centre;
  const p = LAGOONS.pitch;
  const mid = (p.z0 + p.z1) / 2;
  return (
    <group>
      {/* community centre: a white pavilion, a glass band and a shallow dome */}
      <mesh position={[c.x, c.h / 2, c.z]} material={mats.white} castShadow receiveShadow raycast={noRaycast}>
        <boxGeometry args={[c.w, c.h, c.d]} />
      </mesh>
      <mesh position={[c.x, c.h * 0.45, c.z - c.d / 2 - 0.005]} material={mats.glass} raycast={noRaycast}>
        <boxGeometry args={[c.w * 0.8, c.h * 0.35, 0.01]} />
      </mesh>
      <mesh position={[c.x, c.h, c.z]} material={mats.dome} castShadow raycast={noRaycast} geometry={useMemo(() => new SphereGeometry(1.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), [])} />
      {/* goals */}
      {[p.x0 + 0.2, p.x1 - 0.2].map((x) => (
        <group key={x} position={[x, 0, mid]}>
          {[-0.37, 0.37].map((dz) => (
            <mesh key={dz} position={[0, 0.12, dz]} material={mats.white} raycast={noRaycast}>
              <cylinderGeometry args={[0.012, 0.012, 0.24, 6]} />
            </mesh>
          ))}
          <mesh position={[0, 0.24, 0]} rotation-x={Math.PI / 2} material={mats.white} raycast={noRaycast}>
            <cylinderGeometry args={[0.012, 0.012, 0.74, 6]} />
          </mesh>
        </group>
      ))}
      {/* the lagoon bridge: a white deck with railings */}
      {LAGOONS.bridges.map((b) => (
        <group key={b.x}>
          <mesh position={[b.x, 0.05, (b.z0 + b.z1) / 2]} material={mats.white} castShadow receiveShadow raycast={noRaycast}>
            <boxGeometry args={[b.w, 0.06, b.z1 - b.z0]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[b.x + (s * b.w) / 2, 0.13, (b.z0 + b.z1) / 2]} material={mats.rail} raycast={noRaycast}>
              <boxGeometry args={[0.03, 0.1, b.z1 - b.z0]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function Lagoons({ quality }: { quality: 'high' | 'low' }) {
  const cars = useMemo(() => LAGOONS.cars as unknown as Parked[], []);
  return (
    <group>
      <LagoonGround />
      <Water />
      <Villas />
      <ParkAndBridge />
      <TreeSet trees={LAGOONS.trees} quality={quality} />
      <ParkedSet cars={quality === 'low' ? cars.filter((_, i) => i % 2 === 0) : cars} shadows={quality === 'high'} />
    </group>
  );
}
