import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3, type Intersection, type Raycaster } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SECTORS, PLINTH_H } from '../data/city';
import { mulberry32 } from '../data/rng';
import { G } from './shaders/globals';
import { patchMaterial } from './shaders/patch';
import { createGlowMaterial, createPropMaterial } from './materials/surfaceMaterials';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

/* ------------------------------------------------------------------ */
/* Pedestrians — fully GPU-animated: each one walks a loop around a     */
/* block (or along the promenade); legs and arms swing in the shader.  */
/* ------------------------------------------------------------------ */

const PED_SCALE = 0.16; // metres → world units (≈1.6× real, matching the oversized traffic)

function personGeometry() {
  const parts: BufferGeometry[] = [];
  const add = (g: BufferGeometry, part: number) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute('uv');
    const n = ng.getAttribute('position').count;
    ng.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(n).fill(part), 1));
    parts.push(ng);
  };
  // 0 head/skin, 1 torso (shirt), 2 left leg, 3 right leg, 4 left arm, 5 right arm (legs/arms pivot at hip/shoulder)
  add(new SphereGeometry(0.11, 8, 6).translate(0, 1.63, 0), 0);
  add(new BoxGeometry(0.36, 0.56, 0.2).translate(0, 1.24, 0), 1);
  add(new BoxGeometry(0.14, 0.86, 0.15).translate(0.09, 0.47, 0), 2);
  add(new BoxGeometry(0.14, 0.86, 0.15).translate(-0.09, 0.47, 0), 3);
  add(new BoxGeometry(0.09, 0.56, 0.1).translate(0.23, 1.2, 0), 4);
  add(new BoxGeometry(0.09, 0.56, 0.1).translate(-0.23, 1.2, 0), 5);
  const g = mergeGeometries(parts, false)!;
  g.scale(PED_SCALE, PED_SCALE, PED_SCALE);
  return g;
}

function createPedestrianMaterial() {
  const mat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, metalness: 0, transparent: true });
  return patchMaterial(mat, {
    key: 'pedestrian',
    uniforms: { uTime: G.uTime, uXray: G.uXray },
    vertexHead: /* glsl */ `
      uniform float uTime;
      attribute float aPart;
      attribute vec4 aLoop;    // centre x, centre z, half-size x, half-size z
      attribute vec4 aWalk;    // start offset, speed, direction (±1), pants shade
      varying float vPartP;
      varying float vPants;
      vec3 gPedPos;
      float gPedYaw;
      void pedPlace() {
        float hx = aLoop.z;
        float hz = aLoop.w;
        float P = 4.0 * (hx + hz);
        float s = mod(aWalk.x + aWalk.z * aWalk.y * uTime, P);
        float u;
        vec2 p;
        vec2 dir;
        if (s < 2.0 * hx) { u = s - hx; p = vec2(u, -hz); dir = vec2(1.0, 0.0); }
        else if (s < 2.0 * hx + 2.0 * hz) { u = s - 2.0 * hx - hz; p = vec2(hx, u); dir = vec2(0.0, 1.0); }
        else if (s < 4.0 * hx + 2.0 * hz) { u = s - 2.0 * hx - 2.0 * hz - hx; p = vec2(-u, hz); dir = vec2(-1.0, 0.0); }
        else { u = s - 4.0 * hx - 2.0 * hz - hz; p = vec2(-hx, -u); dir = vec2(0.0, -1.0); }
        dir *= aWalk.z;
        gPedPos = vec3(aLoop.x + p.x, 0.0, aLoop.y + p.y);
        gPedYaw = atan(dir.x, dir.y);
      }
    `,
    vertexTransform: /* glsl */ `
      vPartP = aPart;
      vPants = aWalk.w;
      pedPlace();
      float phase = uTime * aWalk.y * 5.2 + aWalk.x * 3.0;
      float swing = sin(phase);
      vec3 lp = transformed;
      float hip = 0.9 * ${PED_SCALE.toFixed(3)};
      float shoulder = 1.46 * ${PED_SCALE.toFixed(3)};
      if (aPart > 1.5 && aPart < 3.5) {
        float a = (aPart < 2.5 ? 1.0 : -1.0) * swing * 0.5;
        float y = lp.y - hip;
        lp.z = lp.z * cos(a) - y * sin(a);
        lp.y = hip + lp.z * sin(a) + y * cos(a);
      } else if (aPart > 3.5) {
        float a = (aPart < 4.5 ? -1.0 : 1.0) * swing * 0.45;
        float y = lp.y - shoulder;
        lp.z = lp.z * cos(a) - y * sin(a);
        lp.y = shoulder + lp.z * sin(a) + y * cos(a);
      }
      lp.y += abs(cos(phase)) * 0.012;
      float c = cos(gPedYaw);
      float sn = sin(gPedYaw);
      lp = vec3(lp.x * c + lp.z * sn, lp.y, -lp.x * sn + lp.z * c);
      transformed = lp + gPedPos + vec3(0.0, ${PLINTH_H.toFixed(3)}, 0.0);
    `,
    vertexNormal: /* glsl */ `
      {
        pedPlace();
        float c = cos(gPedYaw);
        float sn = sin(gPedYaw);
        objectNormal = vec3(objectNormal.x * c + objectNormal.z * sn, objectNormal.y, -objectNormal.x * sn + objectNormal.z * c);
      }
    `,
    fragmentHead: /* glsl */ `
      uniform float uXray;
      varying float vPartP;
      varying float vPants;
    `,
    fragmentColor: /* glsl */ `
      {
        vec3 shirt = diffuseColor.rgb;
        vec3 skin = mix(vec3(0.85, 0.62, 0.48), vec3(0.36, 0.24, 0.18), fract(vPants * 7.3));
        vec3 pants = mix(vec3(0.07, 0.08, 0.1), vec3(0.22, 0.24, 0.3), vPants);
        vec3 c = vPartP < 0.5 ? skin : vPartP < 1.5 ? shirt : vPartP < 3.5 ? pants : shirt * 0.9;
        diffuseColor.rgb = c;
      }
    `,
    fragmentOutput: 'diffuseColor.a *= 1.0 - uXray * 0.95;',
  });
}

function Pedestrians() {
  const { geo, count } = useMemo(() => {
    const rng = mulberry32(1234);
    const loops: number[] = [];
    const walks: number[] = [];
    const colors: number[] = [];
    const shirts = ['#d8d4cc', '#2f3a4a', '#8a2d2d', '#2d5a8a', '#c9a23a', '#4a6b3a', '#7a7f87', '#e0e3e7', '#1d1f23', '#b5653a', '#6a4a8a'];
    const add = (cx: number, cz: number, hx: number, hz: number, speed: number) => {
      loops.push(cx, cz, hx, hz);
      walks.push(rng() * 4 * (hx + hz), speed, rng() < 0.5 ? 1 : -1, rng());
      const c = new Color(shirts[Math.floor(rng() * shirts.length)]);
      colors.push(c.r, c.g, c.b);
    };
    for (const s of SECTORS) {
      if (s.kind === 'yard') continue;
      const n = s.kind === 'park' ? 10 : 22;
      for (let k = 0; k < n; k++) {
        const r = 10.05 + rng() * 0.45;
        add(s.x, s.z, r, r, 0.42 + rng() * 0.22);
      }
    }
    // Corniche promenade
    for (let k = 0; k < 70; k++) add((rng() - 0.5) * 8, 62.95, 70 + rng() * 3, 0.25 + rng() * 0.3, 0.4 + rng() * 0.2);
    const g = personGeometry();
    const count = loops.length / 4;
    g.setAttribute('aLoop', new InstancedBufferAttribute(new Float32Array(loops), 4));
    g.setAttribute('aWalk', new InstancedBufferAttribute(new Float32Array(walks), 4));
    g.setAttribute('instanceColorP', new InstancedBufferAttribute(new Float32Array(colors), 3));
    return { geo: g, count, colors };
  }, []);
  const mat = useMemo(() => createPedestrianMaterial(), []);
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const attr = geo.getAttribute('instanceColorP') as InstancedBufferAttribute;
    const c = new Color();
    for (let i = 0; i < count; i++) {
      c.setRGB(attr.getX(i), attr.getY(i), attr.getZ(i));
      mesh.setColorAt(i, c);
      mesh.setMatrixAt(i, new Matrix4());
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
  }, [geo, count]);
  return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} raycast={noRaycast} castShadow />;
}

/* ------------------------------------------------------------------ */
/* Bus shelters + benches                                              */
/* ------------------------------------------------------------------ */

interface Stop {
  x: number;
  z: number;
  yaw: number;
}

/** Shelters on the kerb, facing the road (yaw: direction the open side faces). */
export const STOPS: Stop[] = [
  { x: -23.5, z: -5.05, yaw: 0 },
  { x: 23.5, z: 5.05, yaw: Math.PI },
  { x: -51.5, z: 5.05, yaw: Math.PI },
  { x: 51.5, z: -5.05, yaw: 0 },
  { x: -38.95, z: 20.5, yaw: -Math.PI / 2 },
  { x: 17.05, z: -39.5, yaw: -Math.PI / 2 },
  { x: 4.5, z: 54.95, yaw: 0 },
  { x: -4.5, z: -33.05, yaw: 0 },
];

function BusStops() {
  const frame = useMemo(() => createPropMaterial({ color: '#3a4049', roughness: 0.45, metalness: 0.6 }), []);
  const glass = useMemo(() => createPropMaterial({ color: '#8fb4c8', roughness: 0.05, metalness: 0.4, opacity: 0.35 }), []);
  const ad = useMemo(() => createGlowMaterial('#e8f0ff', 1.8, 0.15), []);
  return (
    <group>
      {STOPS.map((s, i) => (
        <group key={i} position={[s.x, PLINTH_H, s.z]} rotation-y={s.yaw}>
          <mesh position={[0, 0.44, 0.05]} material={frame} castShadow>
            <boxGeometry args={[1.25, 0.035, 0.42]} />
          </mesh>
          <mesh position={[0, 0.23, -0.12]} material={glass}>
            <boxGeometry args={[1.18, 0.38, 0.015]} />
          </mesh>
          <mesh position={[0.6, 0.23, 0.04]} material={ad}>
            <boxGeometry args={[0.025, 0.38, 0.3]} />
          </mesh>
          <mesh position={[-0.6, 0.23, 0.04]} material={glass}>
            <boxGeometry args={[0.015, 0.38, 0.3]} />
          </mesh>
          {[-0.6, 0.6].map((x) => (
            <mesh key={x} position={[x, 0.22, -0.12]} material={frame}>
              <boxGeometry args={[0.03, 0.44, 0.03]} />
            </mesh>
          ))}
          <mesh position={[0, 0.09, -0.05]} material={frame}>
            <boxGeometry args={[0.8, 0.025, 0.1]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Benches() {
  const list = useMemo(() => {
    const out: { x: number; z: number; yaw: number }[] = [];
    for (let x = -65; x <= 65; x += 10) out.push({ x, z: 66.9, yaw: 0 });
    return out;
  }, []);
  const wood = useMemo(() => createPropMaterial({ color: '#5a3e2a', roughness: 0.8 }), []);
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => {
    const seat = new BoxGeometry(0.62, 0.03, 0.14).translate(0, 0.085, 0);
    const back = new BoxGeometry(0.62, 0.1, 0.025).translate(0, 0.15, -0.065);
    const l1 = new BoxGeometry(0.03, 0.085, 0.12).translate(0.27, 0.042, 0);
    const l2 = new BoxGeometry(0.03, 0.085, 0.12).translate(-0.27, 0.042, 0);
    return mergeGeometries([seat, back, l1, l2].map((g) => g.toNonIndexed()), false)!;
  }, []);
  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    list.forEach((b, i) => {
      q.setFromAxisAngle(new Vector3(0, 1, 0), b.yaw);
      m.compose(new Vector3(b.x, PLINTH_H, b.z), q, new Vector3(1, 1, 1));
      ref.current!.setMatrixAt(i, m);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, [list]);
  return <instancedMesh ref={ref} args={[geo, wood, list.length]} raycast={noRaycast} castShadow />;
}

export function StreetLife() {
  return (
    <group>
      <Pedestrians />
      <BusStops />
      <Benches />
    </group>
  );
}
