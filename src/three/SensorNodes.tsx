import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Intersection,
  type Raycaster,
} from 'three';
import { SENSORS, type Sensor } from '../data/sensors';
import type { LayerId } from '../data/networks';
import { live, runtime } from '../simulation/runtime';
import { T } from '../simulation/timeline';
import { useTwinStore } from '../store/useTwinStore';
import { G } from './shaders/globals';
import { undergroundInteractive } from './networks/NetworkLayer';
import { createPropMaterial } from './materials/surfaceMaterials';
import { TRENCH } from '../data/incident';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

export const STATE_COLORS = {
  healthy: new Color('#2fe0a8'),
  warn: new Color('#ffb547'),
  critical: new Color('#ff4d3d'),
};

const CRITICAL_IDS = new Set(['P-17', 'M-06', 'M-07']);

/** 0 healthy · 1 warning · 2 critical — deterministic from the scenario clock. */
export function sensorState(s: Sensor): number {
  const st = useTwinStore.getState();
  if (!s.cluster) return 0;
  if (live.burst > 0.5 || live.future > 0.5) return 2;
  if (st.status === 'idle') return 0;
  const t = runtime.t;
  if (t < T.anomaly + 0.6) return 0;
  if (t >= T.restore + 1.0) return 0;
  if (t >= T.leak - 0.5 && CRITICAL_IDS.has(s.id)) return 2;
  return 1;
}

const HALO_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aState;
  attribute float aPhase;
  uniform float uTime;
  uniform float uSize;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vState;
  varying float vPhase;
  void main() {
    vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float k = clamp(-center.z / 28.0, 0.28, 1.6);
    float size = uSize * k * mix(1.0, 1.7, step(0.5, aState));
    center.xy += position.xy * size;
    gl_Position = projectionMatrix * center;
    vUv = position.xy * 2.0;
    vColor = aColor;
    vState = aState;
    vPhase = aPhase;
  }
`;

const HALO_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vState;
  varying float vPhase;
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float speed = vState < 0.5 ? 0.32 : (vState < 1.5 ? 0.8 : 1.35);
    float a = 0.0;
    for (int k = 0; k < 2; k++) {
      float rr = fract(uTime * speed + vPhase + float(k) * 0.5);
      float ring = 1.0 - smoothstep(0.0, 0.07, abs(r - rr));
      a += ring * (1.0 - rr) * (vState < 0.5 ? 0.35 : 0.9);
    }
    a += exp(-r * 7.0) * (vState < 0.5 ? 0.5 : 1.1);
    gl_FragColor = vec4(vColor * a * uOpacity, 1.0);
  }
`;

/** Underground sensor nodes for one layer (lives inside that layer's group). */
export function SensorNodes({ layer }: { layer: LayerId }) {
  const sensors = useMemo(() => SENSORS.filter((s) => s.layer === layer), [layer]);
  const n = sensors.length;
  const coreRef = useRef<InstancedMesh>(null);
  const haloRef = useRef<InstancedMesh>(null);
  const hitRef = useRef<InstancedMesh>(null);

  const coreGeo = useMemo(() => new OctahedronGeometry(0.22, 0), []);
  const coreMat = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', toneMapped: true }), []);
  const hitGeo = useMemo(() => new SphereGeometry(1.1, 8, 6), []);
  const hitMat = useMemo(() => new MeshBasicMaterial({ visible: false }), []);
  const haloGeo = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    g.setAttribute('aColor', new InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3));
    g.setAttribute('aState', new InstancedBufferAttribute(new Float32Array(Math.max(1, n)), 1));
    const ph = new Float32Array(Math.max(1, n));
    for (let i = 0; i < n; i++) ph[i] = (i * 0.37) % 1;
    g.setAttribute('aPhase', new InstancedBufferAttribute(ph, 1));
    return g;
  }, [n]);
  const haloMat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: G.uTime, uSize: { value: 0.95 }, uOpacity: { value: 1 } },
        vertexShader: HALO_VERT,
        fragmentShader: HALO_FRAG,
      }),
    [],
  );

  useLayoutEffect(() => {
    const m = new Matrix4();
    sensors.forEach((s, i) => {
      m.makeTranslation(s.x, s.y, s.z);
      coreRef.current!.setMatrixAt(i, m);
      haloRef.current!.setMatrixAt(i, m);
      hitRef.current!.setMatrixAt(i, m);
      coreRef.current!.setColorAt(i, STATE_COLORS.healthy);
    });
    for (const r of [coreRef, haloRef, hitRef]) {
      r.current!.instanceMatrix.needsUpdate = true;
      r.current!.computeBoundingSphere();
    }
  }, [sensors]);

  const tmp = useMemo(() => new Color(), []);
  const rot = useMemo(() => new Matrix4(), []);
  const scl = useMemo(() => new Matrix4(), []);
  const wp = useMemo(() => new Vector3(), []);
  useFrame(({ clock, camera }) => {
    const core = coreRef.current;
    const halo = haloRef.current;
    if (!core || !halo) return;
    const vis = live.layerVis[layer];
    const dim = live.layerDim[layer];
    core.visible = halo.visible = vis > 0.05;
    const colors = haloGeo.getAttribute('aColor') as InstancedBufferAttribute;
    const states = haloGeo.getAttribute('aState') as InstancedBufferAttribute;
    const sel = useTwinStore.getState().selection?.info;
    sensors.forEach((s, i) => {
      const state = sensorState(s);
      const base = state === 2 ? STATE_COLORS.critical : state === 1 ? STATE_COLORS.warn : STATE_COLORS.healthy;
      const selected = sel?.kind === 'sensor' && sel.index === s.index;
      const blink = state === 2 ? 0.65 + 0.35 * Math.sin(clock.elapsedTime * 9 + i) : 1;
      const k = (state > 0 ? 3.2 : 1.6) * (1 - dim * 0.8) * blink * (selected ? 1.8 : 1);
      tmp.copy(base).multiplyScalar(k);
      core.setColorAt(i, tmp);
      tmp.copy(base).multiplyScalar((state > 0 ? 1.4 : 0.55) * (1 - dim * 0.85) * vis);
      colors.setXYZ(i, tmp.r, tmp.g, tmp.b);
      states.setX(i, state);
      // keep markers legible at city scale without dominating close-ups
      wp.set(s.x, s.y, s.z);
      core.parent?.localToWorld(wp);
      const ds = Math.min(1.25, Math.max(0.32, wp.distanceTo(camera.position) / 28));
      rot.makeRotationY(clock.elapsedTime * 0.9 + i);
      scl.makeScale(ds, ds, ds);
      rot.multiply(scl);
      rot.setPosition(s.x, s.y, s.z);
      core.setMatrixAt(i, rot);
    });
    if (core.instanceColor) core.instanceColor.needsUpdate = true;
    core.instanceMatrix.needsUpdate = true;
    colors.needsUpdate = true;
    states.needsUpdate = true;
    if (hitRef.current) hitRef.current.raycast = vis > 0.05 && undergroundInteractive() ? InstancedMesh.prototype.raycast : noRaycast;
  });

  const select = useTwinStore((s) => s.select);
  const setHover = useTwinStore((s) => s.setHover);

  if (n === 0) return null;
  return (
    <group>
      <instancedMesh ref={coreRef} args={[coreGeo, coreMat, n]} raycast={noRaycast} />
      <instancedMesh ref={haloRef} args={[haloGeo, haloMat, n]} raycast={noRaycast} frustumCulled={false} renderOrder={6} />
      <instancedMesh
        ref={hitRef}
        args={[hitGeo, hitMat, n]}
        onPointerMove={(e) => {
          if (e.instanceId === undefined) return;
          e.stopPropagation();
          setHover({ kind: 'sensor', index: sensors[e.instanceId].index });
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          if (e.delta > 4 || e.instanceId === undefined) return;
          e.stopPropagation();
          const s = sensors[e.instanceId];
          select({ info: { kind: 'sensor', index: s.index }, point: [s.x, s.y, s.z] });
        }}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Surface access points (manholes) + anomaly pings                    */
/* ------------------------------------------------------------------ */

const PING_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uAmount;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vPhase;
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = 0.0;
    for (int k = 0; k < 3; k++) {
      float rr = fract(uTime * 0.55 + vPhase + float(k) / 3.0);
      a += (1.0 - smoothstep(0.0, 0.045, abs(r - rr))) * (1.0 - rr);
    }
    a += exp(-r * 9.0) * 0.8;
    gl_FragColor = vec4(uColor * a * uAmount, 1.0);
  }
`;

export function SurfaceMarkers() {
  const n = SENSORS.length;
  const cluster = useMemo(() => SENSORS.filter((s) => s.cluster), []);
  const lidRef = useRef<InstancedMesh>(null);
  const dotRef = useRef<InstancedMesh>(null);
  const pingRef = useRef<InstancedMesh>(null);
  const lidGeo = useMemo(() => new CylinderGeometry(0.42, 0.42, 0.05, 20), []);
  const lidMat = useMemo(() => createPropMaterial({ color: '#2a3038', roughness: 0.5, metalness: 0.7 }), []);
  const dotGeo = useMemo(() => new CircleGeometry(0.16, 16).rotateX(-Math.PI / 2), []);
  const dotMat = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', toneMapped: true, transparent: true }), []);
  const pingGeo = useMemo(() => {
    const g = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const ph = new Float32Array(cluster.length);
    cluster.forEach((_, i) => (ph[i] = (i * 0.29) % 1));
    g.setAttribute('aPhase', new InstancedBufferAttribute(ph, 1));
    return g;
  }, [cluster]);
  const pingMat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: { uTime: G.uTime, uAmount: { value: 0 }, uColor: { value: new Color('#ffb547').multiplyScalar(1.6) } },
        vertexShader: /* glsl */ `
          attribute float aPhase;
          varying vec2 vUv;
          varying float vPhase;
          void main() {
            vUv = position.xz * 2.0;
            vPhase = aPhase;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: PING_FRAG,
      }),
    [],
  );

  const inTrench = (s: { x: number; z: number }) => s.x > TRENCH.minX && s.x < TRENCH.maxX && s.z > TRENCH.minZ && s.z < TRENCH.maxZ;

  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    SENSORS.forEach((s, i) => {
      m.compose(new Vector3(s.x, 0.025, s.z), q, new Vector3(1, 1, 1));
      lidRef.current!.setMatrixAt(i, m);
      m.compose(new Vector3(s.x, 0.06, s.z), q, new Vector3(1, 1, 1));
      dotRef.current!.setMatrixAt(i, m);
      dotRef.current!.setColorAt(i, STATE_COLORS.healthy);
    });
    cluster.forEach((s, i) => {
      m.compose(new Vector3(s.x, 0.09, s.z), q, new Vector3(6.5, 1, 6.5));
      pingRef.current!.setMatrixAt(i, m);
    });
    for (const r of [lidRef, dotRef, pingRef]) {
      r.current!.instanceMatrix.needsUpdate = true;
      r.current!.computeBoundingSphere();
    }
  }, [cluster]);

  const tmp = useMemo(() => new Color(), []);
  const hidden = useMemo(() => new Matrix4().makeScale(0, 0, 0), []);
  const m = useMemo(() => new Matrix4(), []);
  useFrame(({ clock }) => {
    const dot = dotRef.current;
    const lid = lidRef.current;
    if (!dot || !lid) return;
    const trenchOpen = live.trench > 0.02;
    SENSORS.forEach((s, i) => {
      const state = sensorState(s);
      const c = state === 2 ? STATE_COLORS.critical : state === 1 ? STATE_COLORS.warn : STATE_COLORS.healthy;
      const pulse = 0.7 + 0.3 * Math.sin(clock.elapsedTime * (state ? 6 : 2) + i);
      tmp.copy(c).multiplyScalar((state ? 4 : 1.4) * pulse * (1 - live.xray * 0.7));
      dot.setColorAt(i, tmp);
      const hide = trenchOpen && inTrench(s);
      if (hide) {
        dot.setMatrixAt(i, hidden);
        lid.setMatrixAt(i, hidden);
      } else {
        m.makeTranslation(s.x, 0.06, s.z);
        dot.setMatrixAt(i, m);
        m.makeTranslation(s.x, 0.025, s.z);
        lid.setMatrixAt(i, m);
      }
    });
    if (dot.instanceColor) dot.instanceColor.needsUpdate = true;
    dot.instanceMatrix.needsUpdate = true;
    lid.instanceMatrix.needsUpdate = true;
    pingMat.uniforms.uAmount.value = live.ping * (1 - live.trench) * (live.sectorSeverity > 0.5 ? 1.2 : 1);
    pingMat.uniforms.uColor.value.copy(live.sectorSeverity > 0.5 ? STATE_COLORS.critical : STATE_COLORS.warn).multiplyScalar(1.6);
    if (pingRef.current) pingRef.current.visible = pingMat.uniforms.uAmount.value > 0.01;
  });

  return (
    <group>
      <instancedMesh ref={lidRef} args={[lidGeo, lidMat, n]} raycast={noRaycast} receiveShadow />
      <instancedMesh ref={dotRef} args={[dotGeo, dotMat, n]} raycast={noRaycast} />
      <instancedMesh ref={pingRef} args={[pingGeo, pingMat, cluster.length]} raycast={noRaycast} frustumCulled={false} renderOrder={4} />
    </group>
  );
}
