import { useLayoutEffect, useMemo, useRef } from 'react';
import { CanvasTexture, MeshStandardMaterial, Object3D, SRGBColorSpace, type InstancedMesh } from 'three';
import { ACCESSIBLE, PARKING_SIGNS, WHEEL_STOPS } from '../data/parkingFurniture';

/** Wheel stops, accessible bays with a hatched access aisle, and a "P" sign per lot (src/data/parkingFurniture.ts). */
const noRaycast = () => {};
const tmp = new Object3D();

type Item = { x: number; y: number; z: number; sx: number; sy: number; sz: number; rx?: number; ry?: number };

function Inst({ items, material, plane = false }: { items: Item[]; material: MeshStandardMaterial; plane?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((it, i) => {
      tmp.position.set(it.x, it.y, it.z);
      tmp.rotation.set(it.rx ?? 0, it.ry ?? 0, 0);
      tmp.scale.set(it.sx, it.sy, it.sz);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, material, items.length]} raycast={noRaycast} receiveShadow>
      {plane ? <planeGeometry /> : <boxGeometry />}
    </instancedMesh>
  );
}

function hatchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b5fae';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#f2f4f6';
  g.lineWidth = 6;
  for (let k = -64; k < 128; k += 16) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 64, 64);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f5fbf';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#ffffff';
  g.font = 'bold 50px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('P', 32, 35);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function ParkingFurniture() {
  const mats = useMemo(
    () => ({
      stop: new MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.9 }),
      blue: new MeshStandardMaterial({ color: '#2b5fae', roughness: 0.9, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      aisle: new MeshStandardMaterial({ map: hatchTexture(), roughness: 0.9, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      post: new MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.6, metalness: 0.4 }),
      sign: new MeshStandardMaterial({ map: signTexture(), roughness: 0.5 }),
    }),
    [],
  );
  const items = useMemo(() => {
    const stops: Item[] = WHEEL_STOPS.map((w) => ({ x: w.x, y: 0.02, z: w.z, sx: w.alongX ? 0.26 : 0.05, sy: 0.04, sz: w.alongX ? 0.05 : 0.26 }));
    const bays: Item[] = ACCESSIBLE.filter((a) => !a.aisle).map((a) => ({ x: a.x, y: 0.014, z: a.z, sx: 0.34, sy: 0.74, sz: 1, rx: -Math.PI / 2, ry: a.alongX ? 0 : Math.PI / 2 }));
    const aisles: Item[] = ACCESSIBLE.filter((a) => a.aisle).map((a) => ({ x: a.x, y: 0.014, z: a.z, sx: 0.34, sy: 0.74, sz: 1, rx: -Math.PI / 2, ry: a.alongX ? 0 : Math.PI / 2 }));
    const posts: Item[] = PARKING_SIGNS.map((p) => ({ x: p.x, y: 0.12, z: p.z, sx: 0.025, sy: 0.24, sz: 0.025 }));
    const signs: Item[] = PARKING_SIGNS.map((p) => ({ x: p.x, y: 0.26, z: p.z, sx: 0.1, sy: 0.1, sz: 0.012 }));
    return { stops, bays, aisles, posts, signs };
  }, []);
  return (
    <group>
      <Inst items={items.stops} material={mats.stop} />
      <Inst items={items.bays} material={mats.blue} plane />
      <Inst items={items.aisles} material={mats.aisle} plane />
      <Inst items={items.posts} material={mats.post} />
      <Inst items={items.signs} material={mats.sign} />
    </group>
  );
}
