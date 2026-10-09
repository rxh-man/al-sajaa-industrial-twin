import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Intersection,
  type Raycaster,
} from 'three';
import { mulberry32 } from '../data/rng';
import { PLINTH_H } from '../data/city';
import { TRENCH } from '../data/incident';
import { live, runtime } from '../simulation/runtime';
import { T } from '../simulation/timeline';
import { useTwinStore } from '../store/useTwinStore';
import { TrafficSim, parkingSlots, setRoadClosed, signalMasts, signals, type TrafficKindSpec } from '../simulation/traffic';
import { VEHICLE_LENGTH, vehicleGeometry, type VehicleKind } from './vehicles/vehicleModels';
import { createVehicleMaterial } from './vehicles/vehicleMaterial';
import { createGlowMaterial, createPropMaterial } from './materials/surfaceMaterials';
import { STOPS } from './StreetLife';
import { G } from './shaders/globals';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

/** Instanced copy of a vehicle model with its own per-instance state buffer. */
export function instancedVehicle(kind: VehicleKind, count: number) {
  const base = vehicleGeometry(kind);
  const g = new BufferGeometry();
  for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.getAttribute(name));
  g.setAttribute('aState', new InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 4), 4));
  g.boundingSphere = base.boundingSphere;
  return g;
}

const PAINT = ['#eceef1', '#eceef1', '#c3c7cd', '#c3c7cd', '#878c95', '#2a2d32', '#121316', '#121316', '#1d2f55', '#6e1a20', '#b5a68d', '#24402f', '#3b5878', '#b8452a'];
const KIND_PAINT: Partial<Record<VehicleKind, string[]>> = {
  taxi: ['#f2b01b'],
  bus: ['#1f6fb8', '#1f6fb8', '#c8332f'],
  truck: ['#eceef1', '#2f5f9a', '#c8332f', '#eceef1'],
  police: ['#16233f'],
  van: ['#eceef1', '#eceef1', '#c3c7cd', '#2a2d32'],
};

const MOVING: { kind: VehicleKind; weight: number; speed: [number, number] }[] = [
  { kind: 'sedan', weight: 0.34, speed: [2.1, 2.9] },
  { kind: 'hatch', weight: 0.17, speed: [2.0, 2.8] },
  { kind: 'suv', weight: 0.2, speed: [2.1, 2.8] },
  { kind: 'van', weight: 0.07, speed: [1.9, 2.5] },
  { kind: 'taxi', weight: 0.1, speed: [2.2, 3.0] },
  { kind: 'bus', weight: 0.04, speed: [1.6, 2.0] },
  { kind: 'truck', weight: 0.05, speed: [1.7, 2.2] },
  { kind: 'police', weight: 0.02, speed: [2.2, 2.9] },
];
const PARKED: { kind: VehicleKind; weight: number }[] = [
  { kind: 'sedan', weight: 0.36 },
  { kind: 'hatch', weight: 0.26 },
  { kind: 'suv', weight: 0.24 },
  { kind: 'van', weight: 0.1 },
  { kind: 'taxi', weight: 0.04 },
];
const MOVING_COUNT = 150;

function paintFor(kind: VehicleKind, r: number) {
  const list = KIND_PAINT[kind] ?? PAINT;
  return list[Math.floor(r * list.length) % list.length];
}

/** Whether the avenue over the excavation is closed to traffic right now. */
function roadClosed() {
  const s = useTwinStore.getState();
  if (s.future || s.compare === 'none') return true;
  if (s.status === 'idle') return false;
  return runtime.t >= T.localize && runtime.t < T.resolved + 2.5;
}

/* ------------------------------------------------------------------ */
/* Moving traffic                                                      */
/* ------------------------------------------------------------------ */

function MovingTraffic() {
  const { sim, kinds, groups } = useMemo(() => {
    const specs: TrafficKindSpec[] = MOVING.map((m, i) => ({ kind: i, len: VEHICLE_LENGTH[m.kind], weight: m.weight, speed: m.speed }));
    const sim = new TrafficSim(MOVING_COUNT, specs);
    const groups = MOVING.map(() => [] as number[]);
    sim.cars.forEach((c, idx) => groups[c.kind].push(idx));
    return { sim, kinds: MOVING.map((m) => m.kind), groups };
  }, []);

  const meshes = useRef<(InstancedMesh | null)[]>([]);
  const geos = useMemo(() => kinds.map((k, i) => instancedVehicle(k, groups[i].length)), [kinds, groups]);
  const mat = useMemo(() => createVehicleMaterial(), []);
  const poolRef = useRef<InstancedMesh>(null);
  const poolGeo = useMemo(() => {
    const g = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    g.setAttribute('aPool', new InstancedBufferAttribute(new Float32Array(MOVING_COUNT * 2 * 2), 2));
    return g;
  }, []);
  const poolMat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uXray: G.uXray },
        vertexShader: /* glsl */ `
          attribute vec2 aPool;
          varying vec2 vP;
          varying vec2 vPool;
          void main() {
            vP = position.xz;
            vPool = aPool;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uXray;
          varying vec2 vP;
          varying vec2 vPool;
          void main() {
            vec3 col;
            if (vPool.x < 0.5) {
              // headlight beam on the asphalt: widening cone, fading with distance
              float t = vP.y + 0.5;
              float w = 0.3 + 0.7 * t;
              float a = (1.0 - smoothstep(0.45, 1.0, abs(vP.x) / (0.5 * w))) * smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.3, 1.0, t));
              col = vec3(1.0, 0.86, 0.62) * a * 0.3;
            } else {
              float d = length(vP * 2.0);
              float a = (1.0 - smoothstep(0.0, 1.0, d));
              col = vec3(1.0, 0.07, 0.03) * a * a * (0.12 + 0.42 * vPool.y);
            }
            gl_FragColor = vec4(col * (1.0 - uXray), 1.0);
          }
        `,
      }),
    [],
  );

  const colorsSet = useRef(false);
  const m4 = useMemo(() => new Matrix4(), []);
  const q = useMemo(() => new Quaternion(), []);
  const p = useMemo(() => new Vector3(), []);
  const sc = useMemo(() => new Vector3(1, 1, 1), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  const clock = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    clock.current += dt;
    const closedNow = roadClosed();
    setRoadClosed(closedNow);
    // cars still on the closed segment drive out — unless the excavation is already open under them
    if (closedNow && live.trench > 0.02) sim.evacuateClosed();
    sim.step(dt, clock.current);

    const vis = live.exploded < 0.9;
    const pools = poolRef.current;
    const poolAttr = poolGeo.getAttribute('aPool') as InstancedBufferAttribute;
    groups.forEach((idxs, ki) => {
      const mesh = meshes.current[ki];
      if (!mesh) return;
      mesh.visible = vis;
      const state = mesh.geometry.getAttribute('aState') as InstancedBufferAttribute;
      const rng = mulberry32(1000 + ki);
      idxs.forEach((ci, n) => {
        const car = sim.cars[ci];
        q.setFromAxisAngle(up, car.yaw);
        p.set(car.x, 0.0, car.z);
        m4.compose(p, q, sc);
        mesh.setMatrixAt(n, m4);
        state.setXYZW(n, 1, car.brake, kinds[ki] === 'police' ? 0 : 0, car.indicator);
        if (!colorsSet.current) mesh.setColorAt(n, new Color(paintFor(kinds[ki], rng())));
      });
      mesh.instanceMatrix.needsUpdate = true;
      state.needsUpdate = true;
      if (!colorsSet.current && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    colorsSet.current = true;

    if (pools) {
      pools.visible = vis;
      sim.cars.forEach((car, i) => {
        const fx = Math.sin(car.yaw);
        const fz = Math.cos(car.yaw);
        q.setFromAxisAngle(up, car.yaw);
        const L = car.len;
        p.set(car.x + fx * (L / 2 + 1.1), 0.03, car.z + fz * (L / 2 + 1.1));
        m4.compose(p, q, sc.set(1.1, 1, 2.2));
        pools.setMatrixAt(i * 2, m4);
        poolAttr.setXY(i * 2, 0, 0);
        p.set(car.x - fx * (L / 2 + 0.14), 0.03, car.z - fz * (L / 2 + 0.14));
        m4.compose(p, q, sc.set(0.66, 1, 0.5));
        pools.setMatrixAt(i * 2 + 1, m4);
        poolAttr.setXY(i * 2 + 1, 1, car.brake);
      });
      sc.set(1, 1, 1);
      pools.instanceMatrix.needsUpdate = true;
      poolAttr.needsUpdate = true;
    }
  });

  return (
    <group>
      {kinds.map((k, i) => (
        <instancedMesh
          key={k}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          args={[geos[i], mat, Math.max(1, groups[i].length)]}
          count={groups[i].length}
          frustumCulled={false}
          raycast={noRaycast}
          castShadow
          receiveShadow
        />
      ))}
      <instancedMesh ref={poolRef} args={[poolGeo, poolMat, MOVING_COUNT * 2]} frustumCulled={false} raycast={noRaycast} renderOrder={3} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Parked cars                                                         */
/* ------------------------------------------------------------------ */

const PARK_EXCLUDE = [
  // the excavation on Hamdan Bin Mohammed Street + its approaches
  { minX: TRENCH.minX - 2.5, maxX: TRENCH.maxX + 2.5, minZ: -5, maxZ: 5 },
  // crew truck stand
  { minX: 15.6, maxX: 17.2, minZ: 5, maxZ: 13.5 },
  // hospital ambulance bay
  { minX: 27, maxX: 40, minZ: -5, maxZ: -3 },
  // bus bays in front of the shelters
  ...STOPS.map((s) => ({ minX: s.x - 1.8, maxX: s.x + 1.8, minZ: s.z - 1.8, maxZ: s.z + 1.8 })),
];

function ParkedCars() {
  const { groups, kinds } = useMemo(() => {
    const rng = mulberry32(5150);
    const slots = parkingSlots(1.28, PARK_EXCLUDE).filter(() => rng() < 0.58);
    const total = PARKED.reduce((a, k) => a + k.weight, 0);
    const groups = PARKED.map(() => [] as { x: number; z: number; yaw: number; color: string }[]);
    for (const s of slots) {
      let r = rng() * total;
      let ki = 0;
      for (let i = 0; i < PARKED.length; i++) {
        r -= PARKED[i].weight;
        if (r <= 0) {
          ki = i;
          break;
        }
      }
      groups[ki].push({ ...s, x: s.x + (rng() - 0.5) * 0.08, yaw: s.yaw + (rng() - 0.5) * 0.06, color: paintFor(PARKED[ki].kind, rng()) });
    }
    return { groups, kinds: PARKED.map((k) => k.kind) };
  }, []);
  const geos = useMemo(() => kinds.map((k, i) => instancedVehicle(k, groups[i].length)), [kinds, groups]);
  const mat = useMemo(() => createVehicleMaterial(), []);
  const meshes = useRef<(InstancedMesh | null)[]>([]);

  useLayoutEffect(() => {
    const m4 = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const one = new Vector3(1, 1, 1);
    groups.forEach((list, ki) => {
      const mesh = meshes.current[ki];
      if (!mesh) return;
      list.forEach((c, n) => {
        q.setFromAxisAngle(up, c.yaw);
        m4.compose(new Vector3(c.x, 0.0, c.z), q, one);
        mesh.setMatrixAt(n, m4);
        mesh.setColorAt(n, new Color(c.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [groups]);

  useFrame(() => {
    const vis = live.exploded < 0.9;
    meshes.current.forEach((m) => m && (m.visible = vis));
  });

  return (
    <group>
      {kinds.map((k, i) => (
        <instancedMesh
          key={k}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          args={[geos[i], mat, Math.max(1, groups[i].length)]}
          count={groups[i].length}
          raycast={noRaycast}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Traffic signals                                                     */
/* ------------------------------------------------------------------ */

const LAMP_ON = [new Color('#ff2a1a').multiplyScalar(6), new Color('#ffb21a').multiplyScalar(6), new Color('#1aff7a').multiplyScalar(4.5)];
const LAMP_OFF = LAMP_ON.map((c) => c.clone().multiplyScalar(0.012));

function TrafficSignals() {
  const masts = useMemo(() => signalMasts(), []);
  const n = masts.length;
  const poleRef = useRef<InstancedMesh>(null);
  const armRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const lampRef = useRef<InstancedMesh>(null);
  const poleGeo = useMemo(() => new CylinderGeometry(0.026, 0.035, 1, 8).translate(0, 0.5, 0), []);
  const boxGeo = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const metal = useMemo(() => createPropMaterial({ color: '#3a4049', roughness: 0.5, metalness: 0.6 }), []);
  const headMat = useMemo(() => createPropMaterial({ color: '#15181c', roughness: 0.6, metalness: 0.2 }), []);
  const lampMat = useMemo(() => createGlowMaterial('#ffffff', 1, 0.15), []);
  const last = useRef<number[]>([]);
  const H = 1.2;

  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    masts.forEach((s, i) => {
      m.compose(new Vector3(s.px, PLINTH_H, s.pz), q, new Vector3(1, H, 1));
      poleRef.current!.setMatrixAt(i, m);
      const mx = (s.px + s.hx) / 2;
      const mz = (s.pz + s.hz) / 2;
      const alongX = Math.abs(s.hx - s.px) > Math.abs(s.hz - s.pz);
      m.compose(new Vector3(mx, PLINTH_H + H - 0.02, mz), q, new Vector3(alongX ? s.armLen : 0.035, 0.035, alongX ? 0.035 : s.armLen));
      armRef.current!.setMatrixAt(i, m);
      const yaw = Math.atan2(s.fx, s.fz);
      const hq = new Quaternion().setFromAxisAngle(up, yaw);
      m.compose(new Vector3(s.hx, PLINTH_H + H - 0.18, s.hz), hq, new Vector3(0.095, 0.27, 0.075));
      headRef.current!.setMatrixAt(i, m);
      for (let k = 0; k < 3; k++) {
        m.compose(new Vector3(s.hx + s.fx * 0.04, PLINTH_H + H - 0.095 - k * 0.083, s.hz + s.fz * 0.04), hq, new Vector3(0.062, 0.062, 0.014));
        lampRef.current!.setMatrixAt(i * 3 + k, m);
        lampRef.current!.setColorAt(i * 3 + k, LAMP_OFF[k]);
      }
    });
    for (const r of [poleRef, armRef, headRef, lampRef]) {
      r.current!.instanceMatrix.needsUpdate = true;
      r.current!.computeBoundingSphere();
    }
    if (lampRef.current!.instanceColor) lampRef.current!.instanceColor.needsUpdate = true;
  }, [masts]);

  useFrame(() => {
    const lamps = lampRef.current;
    if (!lamps) return;
    let dirty = false;
    masts.forEach((s, i) => {
      const st = signals.head(s.node, s.dir);
      if (last.current[i] === st) return;
      last.current[i] = st;
      dirty = true;
      // lamp order top→bottom: red, amber, green
      lamps.setColorAt(i * 3, st === 0 ? LAMP_ON[0] : LAMP_OFF[0]);
      lamps.setColorAt(i * 3 + 1, st === 1 ? LAMP_ON[1] : LAMP_OFF[1]);
      lamps.setColorAt(i * 3 + 2, st === 2 ? LAMP_ON[2] : LAMP_OFF[2]);
    });
    if (dirty && lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={poleRef} args={[poleGeo, metal, n]} raycast={noRaycast} castShadow />
      <instancedMesh ref={armRef} args={[boxGeo, metal, n]} raycast={noRaycast} castShadow />
      <instancedMesh ref={headRef} args={[boxGeo, headMat, n]} raycast={noRaycast} castShadow />
      <instancedMesh ref={lampRef} args={[boxGeo, lampMat, n * 3]} raycast={noRaycast} />
    </group>
  );
}

export function Traffic() {
  return (
    <group>
      <MovingTraffic />
      <ParkedCars />
      <TrafficSignals />
    </group>
  );
}
