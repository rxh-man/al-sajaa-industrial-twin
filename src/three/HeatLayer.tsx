import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CanvasTexture, Color, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry } from 'three';
import { AD } from '../data/abudhabi';
import { GRID_H, GRID_W, HEAT_CELLS, heatAt, heatColor } from '../data/heatGrid';
import { useTwinStore } from '../store/useTwinStore';

/**
 * SIMULATED heat overlay (relative, not temperature). Ground and roads use one canvas texture;
 * roofs are coloured by the heat under them. In solar mode, warehouse roofs are shown in blue.
 */

const R = AD.meta.rect;
const CX = (R.minX + R.maxX) / 2;
const CZ = (R.minZ + R.maxZ) / 2;

function GroundHeat() {
  const tex = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = GRID_W;
    cv.height = GRID_H;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(GRID_W, GRID_H);
    for (let j = 0; j < GRID_H; j++) {
      for (let i = 0; i < GRID_W; i++) {
        const t = HEAT_CELLS[j * GRID_W + i];
        const [r, g, b] = heatColor(t);
        const o = ((GRID_H - 1 - j) * GRID_W + i) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255 * (0.12 + 0.5 * t);
      }
    }
    ctx.putImageData(img, 0, 0);
    const tx = new CanvasTexture(cv);
    tx.needsUpdate = true;
    return tx;
  }, []);
  const mat = useMemo(() => new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), [tex]);
  const geo = useMemo(() => new PlaneGeometry(GRID_W, GRID_H), []);
  return <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[CX, 0.12, CZ]} raycast={() => {}} />;
}

interface Plate {
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
  warehouse: boolean;
}

function RoofPlates({ solar }: { solar: boolean }) {
  const plates = useMemo<Plate[]>(() => {
    const out: Plate[] = [];
    for (const b of AD.buildings) {
      for (const [x0, z0, x1, z1] of b.b) {
        out.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, top: (b.y ?? 0) + b.h, warehouse: b.n === 'Logistics warehouse' });
      }
    }
    return out;
  }, []);
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, emissive: '#000000' }), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    const c = new Color();
    plates.forEach((p, i) => {
      const show = !solar || p.warehouse;
      o.position.set(p.x, p.top + 0.04, p.z);
      o.scale.set(show ? p.w * 0.98 : 0.0001, 0.08, show ? p.d * 0.98 : 0.0001);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (solar) c.set('#2a6fd6');
      else c.setRGB(...heatColor(heatAt(p.x, p.z)).map((v) => v / 255) as [number, number, number]);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [plates, solar]);

  return <instancedMesh ref={ref} args={[geo, mat, plates.length]} raycast={() => {}} />;
}

export function HeatLayer() {
  const heatOn = useTwinStore((s) => s.heatOn);
  const solarOn = useTwinStore((s) => s.solarOn);
  if (!heatOn && !solarOn) return null;
  return (
    <group>
      {heatOn && <GroundHeat />}
      <RoofPlates solar={solarOn && !heatOn} />
    </group>
  );
}
