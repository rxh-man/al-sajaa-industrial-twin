import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Group, ShaderMaterial, Vector2, type Intersection, type Raycaster } from 'three';
import { Truck } from 'lucide-react';
import { CREW_ROUTE, POI, TRENCH } from '../data/incident';
import { live } from '../simulation/runtime';
import { G } from './shaders/globals';
import { FadeHtml } from './labels/FadeHtml';
import { createPropMaterial } from './materials/surfaceMaterials';
import { useRaf } from '../hooks/useRaf';
import { vehicleGeometry } from './vehicles/vehicleModels';
import { createVehicleMaterial } from './vehicles/vehicleMaterial';
import { crewCam } from '../simulation/crew';
import { T } from '../simulation/timeline';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};
const Y = 0.17;

/** Polyline with rounded corners, sampled by arc length. */
function sampleRoute(pts: [number, number][], radius = 1.6, step = 0.25) {
  const out: Vector2[] = [];
  const P = pts.map((p) => new Vector2(p[0], p[1]));
  out.push(P[0].clone());
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1];
    const b = P[i];
    const c = P[i + 1];
    const dirIn = b.clone().sub(a).normalize();
    const segLen = a.distanceTo(b);
    const r = c ? Math.min(radius, segLen / 2, b.distanceTo(c) / 2) : 0;
    const end = b.clone().addScaledVector(dirIn, -r);
    const last = out[out.length - 1];
    const n = Math.max(1, Math.floor(last.distanceTo(end) / step));
    for (let k = 1; k <= n; k++) out.push(last.clone().lerp(end, k / n));
    if (c && r > 0) {
      const dirOut = c.clone().sub(b).normalize();
      const start = b.clone().addScaledVector(dirOut, r);
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        const p = end
          .clone()
          .multiplyScalar((1 - t) * (1 - t))
          .add(b.clone().multiplyScalar(2 * (1 - t) * t))
          .add(start.clone().multiplyScalar(t * t));
        out.push(p);
      }
    }
  }
  const lengths = [0];
  for (let i = 1; i < out.length; i++) lengths.push(lengths[i - 1] + out[i].distanceTo(out[i - 1]));
  return { points: out, lengths, total: lengths[lengths.length - 1] };
}

/** Shift a sampled route into the right-hand lane (UAE traffic drives on the right). */
function keepRight(route: ReturnType<typeof sampleRoute>, off: number) {
  const { points } = route;
  const out = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const t = b.clone().sub(a).normalize();
    return new Vector2(p.x - t.y * off, p.y + t.x * off);
  });
  const lengths = [0];
  for (let i = 1; i < out.length; i++) lengths.push(lengths[i - 1] + out[i].distanceTo(out[i - 1]));
  return { points: out, lengths, total: lengths[lengths.length - 1] };
}

const ROUTE = keepRight(sampleRoute(CREW_ROUTE), 0.3);

/**
 * Driving time along the route: the truck slows for corners and junctions, so time is
 * spent unevenly. TIME[i] is the share of the drive used up when reaching point i.
 */
const TIME = (() => {
  const { points, lengths } = ROUTE;
  const cost = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[Math.max(0, i - 2)];
    const b = points[i - 1];
    const c = points[Math.min(points.length - 1, i + 1)];
    const t1 = b.clone().sub(a).normalize();
    const t2 = c.clone().sub(b).normalize();
    const turn = Math.acos(Math.max(-1, Math.min(1, t1.dot(t2))));
    const ds = lengths[i] - lengths[i - 1];
    cost.push(cost[i - 1] + ds * (1 + turn * 9));
  }
  return cost.map((c) => c / cost[cost.length - 1]);
})();

/** Average on-screen speed of the (fast-forwarded) drive, world units per second. */
const AVG_SPEED = ROUTE.total / (T.arrive - T.dispatch - 0.8);

/** Distance along the route after `share` (0..1) of the driving time. */
function distanceAt(share: number) {
  let i = 1;
  while (i < TIME.length - 1 && TIME[i] < share) i++;
  const t = (share - TIME[i - 1]) / Math.max(1e-6, TIME[i] - TIME[i - 1]);
  return ROUTE.lengths[i - 1] + (ROUTE.lengths[i] - ROUTE.lengths[i - 1]) * Math.min(1, Math.max(0, t));
}

function pointAt(d: number) {
  const { points, lengths } = ROUTE;
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < d) i++;
  const t = (d - lengths[i - 1]) / Math.max(1e-6, lengths[i] - lengths[i - 1]);
  const p = points[i - 1].clone().lerp(points[i], Math.min(1, Math.max(0, t)));
  const dir = points[i].clone().sub(points[i - 1]).normalize();
  return { p, dir };
}

function RouteRibbon() {
  const geo = useMemo(() => {
    const { points, lengths } = ROUTE;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const w = 0.55;
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const t = next.clone().sub(prev).normalize();
      const n = new Vector2(-t.y, t.x);
      const p = points[i];
      pos.push(p.x + n.x * w, Y, p.y + n.y * w, p.x - n.x * w, Y, p.y - n.y * w);
      uv.push(lengths[i], 0, lengths[i], 1);
      if (i < points.length - 1) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: G.uTime,
          uProgress: { value: 0 },
          uAmount: { value: 0 },
          uTotal: { value: ROUTE.total },
          uColor: { value: new Color('#f2f6ff').multiplyScalar(1.9) },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uProgress;
          uniform float uAmount;
          uniform float uTotal;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float s = vUv.x;
            float head = uProgress * uTotal;
            if (s > head) discard;
            float cell = fract(s / 0.9 - uTime * 2.2);
            vec2 q = vec2((cell - 0.5) * 0.9, (vUv.y - 0.5) * 1.1);
            float dotM = 1.0 - smoothstep(0.17, 0.24, length(q));
            float core = 1.0 - smoothstep(0.0, 0.08, abs(vUv.y - 0.5));
            float headGlow = exp(-(head - s) * 1.2);
            float a = (dotM * 0.9 + core * 0.12 + headGlow * 0.8) * uAmount;
            gl_FragColor = vec4(uColor * a, 1.0);
          }
        `,
      }),
    [],
  );
  useFrame(() => {
    mat.uniforms.uProgress.value = live.route;
    mat.uniforms.uAmount.value = live.routeVisible;
  });
  return <mesh geometry={geo} material={mat} raycast={noRaycast} renderOrder={8} />;
}

/** The crew vehicle model with beacons and headlights on; brake lights while slowing. */
function crewVehicle() {
  const g = vehicleGeometry('crew').clone();
  const n = g.getAttribute('position').count;
  const state = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) state.set([1, 0, 1, 0], i * 4);
  g.setAttribute('aState', new Float32BufferAttribute(state, 4));
  return g;
}

function CrewTruck() {
  const ref = useRef<Group>(null);
  const vehicle = useMemo(() => crewVehicle(), []);
  const paint = useMemo(() => {
    const m = createVehicleMaterial('#f08a24');
    m.color.set('#e9ecef');
    return m;
  }, []);
  const lastD = useRef(0);
  const yaw = useRef<number | null>(null);
  const haloMat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: G.uTime, uColor: { value: new Color('#ffc46b').multiplyScalar(1.4) } },
        vertexShader: /* glsl */ `
          varying vec2 vP;
          void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uColor; varying vec2 vP;
          void main() {
            float d = length(vP) / 3.0;
            float ring = (1.0 - smoothstep(0.0, 0.06, abs(d - fract(uTime * 0.9)))) * (1.0 - fract(uTime * 0.9));
            float core = exp(-d * d * 18.0) * 0.5;
            gl_FragColor = vec4(uColor * (ring * 0.8 + core), 1.0);
          }
        `,
      }),
    [],
  );
  useFrame((_, rawDt) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.1);
    const vis = live.routeVisible;
    g.visible = vis > 0.02;
    const d = distanceAt(live.truck);
    const { p, dir } = pointAt(d);
    g.position.set(p.x, 0.02, p.y);
    // heading eases through corners instead of snapping
    const target = Math.atan2(dir.x, dir.y);
    if (yaw.current === null) yaw.current = target;
    let diff = target - yaw.current;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    yaw.current += diff * Math.min(1, dt * 9);
    g.rotation.y = yaw.current;
    g.scale.setScalar(Math.max(0.001, vis));
    // brake lights while the truck slows for a corner or the stop at the dig site
    const speed = (d - lastD.current) / Math.max(dt, 1e-3);
    const state = vehicle.getAttribute('aState') as Float32BufferAttribute;
    const braking = live.truck >= 0.999 || (live.truck > 0.01 && speed < AVG_SPEED * 0.45) ? 1 : 0;
    if (state.getY(0) !== braking) {
      for (let i = 0; i < state.count; i++) state.setY(i, braking);
      state.needsUpdate = true;
    }
    lastD.current = d;
    crewCam.x = p.x;
    crewCam.z = p.y;
    crewCam.yaw = yaw.current;
    crewCam.active = vis > 0.5 && live.truck < 0.999;
  });
  return (
    <group ref={ref}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.2, 0]} material={haloMat}>
        <planeGeometry args={[4.6, 4.6]} />
      </mesh>
      <mesh geometry={vehicle} material={paint} scale={0.95} castShadow />
      <FadeHtml position={[0, 1.8, 0]} opacity={() => live.routeVisible * (1 - live.exploded)} zIndex={32} center>
        <TruckLabel />
      </FadeHtml>
    </group>
  );
}

function TruckLabel() {
  const ref = useRef<HTMLSpanElement>(null);
  useRaf(() => {
    if (!ref.current) return;
    const txt = live.truck > 0.985 ? 'ON SITE' : `ETA ${Math.max(1, Math.round(18 * (1 - live.truck)))} min`;
    if (ref.current.textContent !== txt) ref.current.textContent = txt;
  });
  return (
    <div className="crew-chip">
      <Truck size={13} strokeWidth={2.2} />
      <span>Crew 07</span>
      <b className="tnum" ref={ref}>
        ETA 18 min
      </b>
    </div>
  );
}

function DepotBeacon() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: G.uTime, uAmount: { value: 0 }, uColor: { value: new Color('#dfe8ff').multiplyScalar(1.6) } },
        vertexShader: /* glsl */ `
          varying vec2 vP;
          void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uAmount; uniform vec3 uColor; varying vec2 vP;
          void main() {
            float d = length(vP) / 4.0;
            float a = 0.0;
            for (int k = 0; k < 2; k++) {
              float r = fract(uTime * 0.6 + float(k) * 0.5);
              a += (1.0 - smoothstep(0.0, 0.05, abs(d - r))) * (1.0 - r);
            }
            gl_FragColor = vec4(uColor * a * uAmount, 1.0);
          }
        `,
      }),
    [],
  );
  useFrame(() => {
    mat.uniforms.uAmount.value = live.routeVisible * (1 - live.truck * 0.6);
  });
  const start = CREW_ROUTE[0];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[start[0], 0.2, start[1]]} material={mat} raycast={noRaycast}>
        <planeGeometry args={[8, 8]} />
      </mesh>
      <FadeHtml position={[POI.depot.x, POI.depot.y + 2.4, POI.depot.z]} opacity={() => live.routeVisible * (1 - live.truck)} zIndex={21}>
        <div className="poi-badge is-depot">
          <span className="poi-icon">
            <Truck size={14} strokeWidth={2.2} />
          </span>
          <div>
            <div className="poi-name">{POI.depot.name}</div>
          </div>
        </div>
      </FadeHtml>
    </group>
  );
}

/** Barriers around the work zone once the crew is on site. */
function WorkZone() {
  const ref = useRef<Group>(null);
  const white = useMemo(() => createPropMaterial({ color: '#e8ebef', roughness: 0.5 }), []);
  const orange = useMemo(() => createPropMaterial({ color: '#f07c1e', roughness: 0.5, emissive: '#f07c1e', emissiveIntensity: 0.35 }), []);
  const barriers = useMemo(() => {
    const out: { x: number; z: number; r: number }[] = [];
    for (let x = TRENCH.minX; x <= TRENCH.maxX; x += 2.3) {
      out.push({ x, z: TRENCH.minZ - 0.5, r: 0 });
      out.push({ x, z: TRENCH.maxZ + 0.5, r: 0 });
    }
    out.push({ x: TRENCH.minX - 0.5, z: 0, r: Math.PI / 2 });
    out.push({ x: TRENCH.maxX + 0.5, z: -2.2, r: Math.PI / 2 });
    out.push({ x: TRENCH.maxX + 0.5, z: 2.2, r: Math.PI / 2 });
    return out;
  }, []);
  useFrame(() => {
    if (!ref.current) return;
    const v = live.truck > 0.98 ? live.routeVisible : 0;
    ref.current.visible = v > 0.02;
    ref.current.scale.y = Math.max(0.001, v);
  });
  return (
    <group ref={ref}>
      {barriers.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]} rotation-y={b.r}>
          <mesh position={[0, 0.32, 0]} material={i % 2 ? white : orange}>
            <boxGeometry args={[1.7, 0.16, 0.08]} />
          </mesh>
          <mesh position={[-0.75, 0.2, 0]} material={white}>
            <boxGeometry args={[0.06, 0.4, 0.06]} />
          </mesh>
          <mesh position={[0.75, 0.2, 0]} material={white}>
            <boxGeometry args={[0.06, 0.4, 0.06]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function RepairRoute() {
  return (
    <group>
      <RouteRibbon />
      <CrewTruck />
      <DepotBeacon />
      <WorkZone />
    </group>
  );
}
