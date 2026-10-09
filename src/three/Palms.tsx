import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CylinderGeometry, InstancedMesh, Matrix4, Quaternion, Vector3, Euler } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AD } from '../data/abudhabi';
import { createPropMaterial } from './materials/surfaceMaterials';

const TRUNK_H = 1.0; // 10 m date palms

function crownGeometry() {
  const fronds = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const g = new BoxGeometry(0.075, 0.012, 0.62);
    g.translate(0, 0, 0.31);
    const droop = 0.35 + (i % 3) * 0.18;
    g.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(droop, (i / n) * Math.PI * 2, 0, 'YXZ')));
    fronds.push(g);
  }
  return mergeGeometries(fronds)!.translate(0, TRUNK_H, 0);
}

/** Date palms along the Corniche, the main roads' medians and in the parks. */
export function Palms() {
  const trunkGeo = useMemo(() => new CylinderGeometry(0.03, 0.055, TRUNK_H, 6).translate(0, TRUNK_H / 2, 0), []);
  const crownGeo = useMemo(() => crownGeometry(), []);
  const bark = useMemo(() => createPropMaterial({ color: '#8b7154', roughness: 0.95 }), []);
  const leaves = useMemo(() => createPropMaterial({ color: '#56723a', roughness: 0.8 }), []);
  const trunkRef = useRef<InstancedMesh>(null);
  const crownRef = useRef<InstancedMesh>(null);
  const count = AD.palms.length;

  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    AD.palms.forEach(([x, z, s], i) => {
      const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      const r = h - Math.floor(h);
      q.setFromEuler(e.set((r - 0.5) * 0.08, r * Math.PI * 2, (0.5 - r) * 0.08));
      m.compose(new Vector3(x, 0, z), q, new Vector3(s, s, s));
      trunkRef.current!.setMatrixAt(i, m);
      crownRef.current!.setMatrixAt(i, m);
    });
    for (const mesh of [trunkRef.current!, crownRef.current!]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, []);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunkGeo, bark, count]} castShadow />
      <instancedMesh ref={crownRef} args={[crownGeo, leaves, count]} castShadow />
    </group>
  );
}
