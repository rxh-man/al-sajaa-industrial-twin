import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Object3D, PlaneGeometry, MeshBasicMaterial, Color } from 'three';
import { heatAt, heatColor } from '../data/heatGrid';
import { useTwinStore } from '../store/useTwinStore';
import { AD } from '../data/abudhabi';

/**
 * Heat Grid Visualization: displays modelled heat exposure as a grid overlay.
 * Color intensity represents heat at the current time of day.
 * Shown only when heatOn is true.
 */

export function HeatGrid() {
  const on = useTwinStore((s) => s.heatOn);
  if (!on) return null;

  return <HeatGridMesh />;
}

function HeatGridMesh() {
  const ref = useRef<InstancedMesh>(null);
  const rect = AD.meta.rect;
  const step = 5; // sample every 5 units (50 m)
  const cellCount = Math.ceil((rect.maxX - rect.minX) / step) * Math.ceil((rect.maxZ - rect.minZ) / step);

  const geo = useMemo(() => new PlaneGeometry(step * 0.9, step * 0.9), []);
  const mat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    const o = new Object3D();
    let idx = 0;

    for (let x = rect.minX + step / 2; x < rect.maxX; x += step) {
      for (let z = rect.minZ + step / 2; z < rect.maxZ; z += step) {
        const baseHeat = heatAt(x, z);
        const [r, g, b] = heatColor(baseHeat);
        const col = new Color().setRGB(r / 255, g / 255, b / 255);

        o.position.set(x, 0.1, z);
        o.updateMatrix();
        mesh.setMatrixAt(idx, o.matrix);
        mesh.setColorAt(idx, col);
        idx++;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  return (
    <instancedMesh
      ref={ref}
      args={[geo, mat, cellCount]}
      raycast={() => null}
      position={[0, 0, 0]}
    />
  );
}
