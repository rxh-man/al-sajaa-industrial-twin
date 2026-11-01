import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CylinderGeometry, Color, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, SphereGeometry } from 'three';
import { FACTORIES, SHADE_TREES } from '../data/airClimate';
import { motionScale, useTwinStore } from '../store/useTwinStore';
import { FACILITIES } from '../sustainability/facilities';
import { airFilterMatch, useEnv } from '../env/store';

/** per-factory smoke strength 0–1 from the facility model: local pollutant index (dust + NOx, after abatement)
 * and CO₂, each normalised to the district's largest, so plume size and height follow the modelled emissions */
const BY_ID = new Map(FACILITIES.map((f) => [f.id, f]));
const MAX_LOCAL = Math.max(...FACILITIES.map((f) => f.pmIdx + f.noxIdx));
const MAX_CO2 = Math.max(...FACILITIES.map((f) => f.co2T));
export const smokeStrength = (id: number) => {
  const f = BY_ID.get(id);
  if (!f) return 0.3;
  return Math.min(1, 0.65 * Math.sqrt((f.pmIdx + f.noxIdx) / MAX_LOCAL) + 0.35 * Math.sqrt(f.co2T / MAX_CO2));
};

/**
 * SIMULATED stack smoke and tree oxygen. Each factory's plume size, height and persistence follow its ESTIMATED
 * emissions from the facility model (category, size, utilisation, hours, fuel, abatement); the plume drifts with
 * the shared wind (env/store). This is a visual of estimated source emissions, not measured air quality and not a
 * validated dispersion model. Small pale dots rise from a sample of shade trees to show oxygen release.
 */

const PUFFS = 6; // puffs per stack at once
const RISE = 9; // scene units (90 m) a puff climbs before it fades
const WIND = [0.9, 0.35]; // oxygen dots' drift per cycle (x, z), scene units
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
  const strength = useMemo(() => FACTORIES.map((f) => smokeStrength(f.id)), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const { wind, air } = useEnv.getState();
    const a = (wind.dirDeg * Math.PI) / 180;
    // drift per cycle grows with wind speed (scene units); calm air lets the plume rise more vertically
    const drift = 0.6 + wind.speedMs * 0.45;
    const wx = Math.cos(a) * drift;
    const wz = Math.sin(a) * drift;
    const t0 = clock.elapsedTime * 0.12 * motionScale();
    let k = 0;
    for (let i = 0; i < FACTORIES.length; i++) {
      const f = FACTORIES[i];
      const fac = BY_ID.get(f.id);
      const shown = !fac || airFilterMatch(fac, air);
      const n = strength[i];
      for (let p = 0; p < PUFFS; p++, k++) {
        const ph = (t0 + p / PUFFS) % 1;
        // weak sources fade sooner (fewer visible puffs) and stay small
        const visible = shown && p < Math.max(2, Math.round(PUFFS * (0.35 + 0.65 * n)));
        const s = visible ? (0.4 + ph * 2.6) * (0.45 + 0.9 * n) : 0;
        o.position.set(f.x + wx * ph * 3 + Math.sin(ph * 6 + p) * 0.2, f.top + 2.8 + ph * RISE * (0.5 + 0.7 * n), f.z + wz * ph * 3);
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
  const select = useTwinStore((s) => s.select);
  return (
    <instancedMesh
      ref={ref}
      args={[geo, mat, count]}
      onClick={(e) => {
        if (e.instanceId === undefined || e.delta > 4) return;
        e.stopPropagation();
        const f = FACTORIES[Math.floor(e.instanceId / PUFFS)];
        select({ info: { kind: 'factory', id: f.id }, point: [e.point.x, e.point.y, e.point.z] });
      }}
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
    const t0 = clock.elapsedTime * 0.2 * motionScale();
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
