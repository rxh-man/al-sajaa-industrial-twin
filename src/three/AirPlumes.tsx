import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CylinderGeometry, Color, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, SphereGeometry } from 'three';
import { FACTORIES, SHADE_TREES } from '../data/airClimate';
import { useTwinStore } from '../store/useTwinStore';

/**
 * SIMULATED stack smoke and tree oxygen. Smoke rises from each factory roof stack and drifts
 * with a fixed wind; small pale dots rise from a sample of shade trees to show oxygen release.
 * Positions come from the scene data; the flow rates are illustrative, not measured.
 */

const PUFFS = 6; // puffs per stack at once
const RISE = 9; // scene units (90 m) a puff climbs before it fades
const WIND = [0.9, 0.35]; // drift per cycle (x, z), scene units
const O2_EVERY = 6; // one oxygen dot source per N shade trees
const O2_PER_SOURCE = 3;

export function AirPlumes() {
  const on = useTwinStore((s) => s.airOn);
  if (!on) return null;
  return (
    <group>
      <Stacks />
      <Smoke />
      <Oxygen />
    </group>
  );
}

function Stacks() {
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new CylinderGeometry(0.22, 0.3, 3, 10), []);
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#5b5f66', roughness: 0.8 }), []);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const o = new Object3D();
    FACTORIES.forEach((f, i) => {
      o.position.set(f.x, f.top + 1.5, f.z);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return <instancedMesh ref={ref} args={[geo, mat, FACTORIES.length]} raycast={() => {}} />;
}

function Smoke() {
  const ref = useRef<InstancedMesh>(null);
  const count = FACTORIES.length * PUFFS;
  const geo = useMemo(() => new SphereGeometry(1, 8, 6), []);
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#c9ccd1', transparent: true, opacity: 0.42, depthWrite: false }), []);
  const o = useMemo(() => new Object3D(), []);
  const tint = useMemo(() => {
    const arr: Color[] = [];
    // colour by the pollutant with the highest simulated level: dust tan, NOx brown, SO2 yellow, CO2 grey
    const DOMINANT = ['#c8a46a', '#9c6b3f', '#d9c94a', '#b9bec6'];
    for (const f of FACTORIES) {
      let best = 0;
      f.levels.forEach((l, k) => { if (l > f.levels[best]) best = k; });
      arr.push(new Color(DOMINANT[best]));
    }
    return arr;
  }, []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t0 = clock.elapsedTime * 0.12;
    let k = 0;
    for (let i = 0; i < FACTORIES.length; i++) {
      const f = FACTORIES[i];
      for (let p = 0; p < PUFFS; p++, k++) {
        const ph = (t0 + p / PUFFS) % 1;
        const s = 0.6 + ph * 2.6;
        o.position.set(f.x + WIND[0] * ph * 3 + Math.sin(ph * 6 + p) * 0.2, f.top + 2.8 + ph * RISE, f.z + WIND[1] * ph * 3);
        o.scale.setScalar(s);
        o.updateMatrix();
        mesh.setMatrixAt(k, o.matrix);
        mesh.setColorAt(k, tint[i]);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  const setHover = useTwinStore((s) => s.setHover);
  return (
    <instancedMesh
      ref={ref}
      args={[geo, mat, count]}
      onPointerMove={(e) => {
        if (e.instanceId === undefined) return;
        e.stopPropagation();
        setHover({ kind: 'factory', id: FACTORIES[Math.floor(e.instanceId / PUFFS)].id });
      }}
      onPointerOut={() => setHover(null)}
    />
  );
}

function Oxygen() {
  const ref = useRef<InstancedMesh>(null);
  const sources = useMemo(() => SHADE_TREES.filter((_, i) => i % O2_EVERY === 0), []);
  const count = sources.length * O2_PER_SOURCE;
  const geo = useMemo(() => new SphereGeometry(0.16, 6, 5), []);
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#8fe3ff', transparent: true, opacity: 0.85, depthWrite: false }), []);
  const o = useMemo(() => new Object3D(), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t0 = clock.elapsedTime * 0.2;
    let k = 0;
    for (const tree of sources) {
      for (let p = 0; p < O2_PER_SOURCE; p++, k++) {
        const ph = (t0 + p / O2_PER_SOURCE) % 1;
        o.position.set(tree.x + WIND[0] * ph * 0.6, 3 + ph * 6, tree.z + WIND[1] * ph * 0.6);
        o.scale.setScalar(0.6 + Math.sin(ph * Math.PI) * 0.6);
        o.updateMatrix();
        mesh.setMatrixAt(k, o.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, count]} raycast={() => {}} />;
}
