import { useLayoutEffect, useMemo, useRef } from 'react';
import { ConeGeometry, CylinderGeometry, InstancedMesh, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three';
import { AD } from '../data/abudhabi';
import { createPropMaterial } from './materials/surfaceMaterials';

interface Part {
  pos: Vector3;
  scale: Vector3;
}

/** White domes and minarets on every mosque in the map (OpenStreetMap footprints). */
export function Mosques() {
  const { domes, minarets, caps } = useMemo(() => {
    const domes: Part[] = [];
    const minarets: Part[] = [];
    const caps: Part[] = [];
    for (const b of AD.buildings.filter((x) => x.k === 'mosque')) {
      const main = [...b.b].sort((p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1]))[0];
      const [x1, z1, x2, z2] = main;
      const w = x2 - x1;
      const d = z2 - z1;
      const r = Math.min(1.7, Math.min(w, d) * 0.3);
      const cx = Math.min(x2 - r, Math.max(x1 + r, b.c[0]));
      const cz = Math.min(z2 - r, Math.max(z1 + r, b.c[1]));
      domes.push({ pos: new Vector3(cx, b.h, cz), scale: new Vector3(r, r * 1.05, r) });
      const mh = Math.max(2.4, b.h * 1.6);
      const mr = Math.max(0.12, r * 0.13);
      const mx = x2 - mr * 1.6;
      const mz = z1 + mr * 1.6;
      minarets.push({ pos: new Vector3(mx, 0, mz), scale: new Vector3(mr, mh, mr) });
      caps.push({ pos: new Vector3(mx, mh, mz), scale: new Vector3(mr * 1.15, mr * 3.2, mr * 1.15) });
    }
    return { domes, minarets, caps };
  }, []);

  const domeGeo = useMemo(() => new SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), []);
  const minaretGeo = useMemo(() => new CylinderGeometry(0.85, 1, 1, 12).translate(0, 0.5, 0), []);
  const capGeo = useMemo(() => new ConeGeometry(1, 1, 12).translate(0, 0.5, 0), []);
  const stone = useMemo(() => createPropMaterial({ color: '#f1ece2', roughness: 0.55 }), []);
  const domeMat = useMemo(() => createPropMaterial({ color: '#eae6dc', roughness: 0.35, metalness: 0.15 }), []);
  const domeRef = useRef<InstancedMesh>(null);
  const minRef = useRef<InstancedMesh>(null);
  const capRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    const fill = (mesh: InstancedMesh | null, parts: Part[]) => {
      if (!mesh) return;
      parts.forEach((p, i) => mesh.setMatrixAt(i, m.compose(p.pos, q, p.scale)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    fill(domeRef.current, domes);
    fill(minRef.current, minarets);
    fill(capRef.current, caps);
  }, [domes, minarets, caps]);

  if (!domes.length) return null;
  return (
    <group>
      <instancedMesh ref={domeRef} args={[domeGeo, domeMat, domes.length]} castShadow receiveShadow />
      <instancedMesh ref={minRef} args={[minaretGeo, stone, minarets.length]} castShadow />
      <instancedMesh ref={capRef} args={[capGeo, domeMat, caps.length]} castShadow />
    </group>
  );
}
