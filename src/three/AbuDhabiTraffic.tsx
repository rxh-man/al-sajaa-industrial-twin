import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, Vector3, type Intersection, type Raycaster } from 'three';
import { AD, type XZ } from '../data/abudhabi';
import { TRENCH } from '../data/incident';
import { mulberry32 } from '../data/rng';
import { live, runtime } from '../simulation/runtime';
import { T, fastForwardAt } from '../simulation/timeline';
import { useTwinStore } from '../store/useTwinStore';
import { VEHICLE_LENGTH, vehicleGeometry, type VehicleKind } from './vehicles/vehicleModels';
import { createVehicleMaterial } from './vehicles/vehicleMaterial';
import { G } from './shaders/globals';

/** Headlight cones ahead of each car and a red tail glow behind it (brighter when braking), on the asphalt. */
function createBeamMaterial() {
  return new ShaderMaterial({
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
  });
}

/**
 * Everyday traffic on the real downtown streets (OpenStreetMap): cars keep right, follow
 * one-way rules, turn at real junctions, keep their distance, steer around the dig site
 * while it is open, and speed up with the rest of the city during the fast-forwarded drive.
 */

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};
/** Raised decks: the flyover, the cloverleaf loops and the ramps. Keep in step with ElevatedRoads.tsx. */
export const DECK_Y = 0.62;
export const isElevated = (r: { o?: number; n: string }) => r.o === 1 || /flyover|Ramp|Cloverleaf/.test(r.n);
const CAR_SCALE = 0.72; // models are 2.1× life size; on true-scale streets ~1.5× reads best
const LANE_W = 0.34;
const SPEED: Record<string, number> = { trunk: 2.6, primary: 2.4, secondary: 2.1, tertiary: 1.9, unclassified: 1.5, residential: 1.3, living_street: 0.9 };
const WEIGHT: Record<string, number> = { trunk: 5, primary: 5, secondary: 4, tertiary: 3, unclassified: 1.5, residential: 1, living_street: 0.4 };

const FLEET: { kind: VehicleKind; n: number; paint: string[] }[] = [
  { kind: 'sedan', n: 52, paint: ['#f1f2f4', '#f1f2f4', '#c9ccd1', '#9aa0a8', '#2a2d32', '#121316', '#1d2f55', '#6e1a20', '#b5a68d'] },
  { kind: 'suv', n: 34, paint: ['#f1f2f4', '#f1f2f4', '#c9ccd1', '#121316', '#2a2d32', '#b5a68d'] },
  { kind: 'hatch', n: 18, paint: ['#f1f2f4', '#c9ccd1', '#b8452a', '#3b5878'] },
  { kind: 'taxi', n: 24, paint: ['#c8ccd1'] }, // Abu Dhabi taxis: silver with a yellow roof sign
  { kind: 'van', n: 10, paint: ['#f1f2f4', '#c9ccd1'] },
  { kind: 'bus', n: 6, paint: ['#d3d8dd'] },
  { kind: 'truck', n: 6, paint: ['#f1f2f4', '#2f5f9a'] },
];

interface Link {
  a: string;
  b: string;
  pts: XZ[];
  cum: number[];
  len: number;
  speed: number;
  weight: number;
  trench: boolean;
  elev: boolean;
}

interface Car {
  link: number;
  d: number;
  v: number;
  vmul: number;
  len: number;
  x: number;
  z: number;
  yaw: number;
  bx: number;
  bz: number;
  brake: number;
  hidden: boolean;
}

const inTrench = ([x, z]: XZ, pad = 1) => x > TRENCH.minX - pad && x < TRENCH.maxX + pad && z > TRENCH.minZ - pad && z < TRENCH.maxZ + pad;

/** Shift a polyline sideways (positive = right of travel) with mitred corners. */
function offsetLine(pts: XZ[], off: number): XZ[] {
  const normal = (p: XZ, q: XZ): XZ => {
    const dx = q[0] - p[0];
    const dz = q[1] - p[1];
    const L = Math.hypot(dx, dz) || 1;
    return [-dz / L, dx / L];
  };
  return pts.map((p, i) => {
    const n1 = i > 0 ? normal(pts[i - 1], p) : normal(p, pts[i + 1]);
    const n2 = i < pts.length - 1 ? normal(p, pts[i + 1]) : n1;
    let mx = n1[0] + n2[0];
    let mz = n1[1] + n2[1];
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const cos = Math.max(0.5, mx * n2[0] + mz * n2[1]);
    return [p[0] + (mx * off) / cos, p[1] + (mz * off) / cos];
  });
}

function buildLinks() {
  const uses = new Map<string, number>();
  for (const r of AD.roads) for (const id of r.k) uses.set(id, (uses.get(id) ?? 0) + 1);
  const links: Link[] = [];
  for (const r of AD.roads) {
    if (!(r.c in SPEED)) continue;
    const lanes = r.o ? Math.max(1, Math.min(2, Math.round((r.w * 10 - 1) / 3.4) - 1)) : 1;
    const oneWay = !!r.o || /Roundabout/.test(r.n);
    for (const dir of oneWay ? [1] : [1, -1]) {
      const pts = dir === 1 ? r.p : [...r.p].reverse();
      const ids = dir === 1 ? r.k : [...r.k].reverse();
      let s = 0;
      for (let i = 1; i < pts.length; i++) {
        if (i < pts.length - 1 && (uses.get(ids[i]) ?? 0) < 2) continue;
        const piece = pts.slice(s, i + 1);
        for (let k = 0; k < lanes; k++) {
          const off = r.o ? r.w / 2 - LANE_W * (k + 0.5) : r.w / 4;
          const lp = offsetLine(piece, off);
          const cum = [0];
          for (let j = 1; j < lp.length; j++) cum.push(cum[j - 1] + Math.hypot(lp[j][0] - lp[j - 1][0], lp[j][1] - lp[j - 1][1]));
          const len = cum[cum.length - 1];
          if (len < 0.05) continue;
          links.push({ a: ids[s], b: ids[i], pts: lp, cum, len, speed: SPEED[r.c], weight: WEIGHT[r.c], trench: lp.some((p) => inTrench(p)), elev: isElevated(r) });
        }
        s = i;
      }
    }
  }
  const out = new Map<string, number[]>();
  links.forEach((l, i) => out.set(l.a, [...(out.get(l.a) ?? []), i]));
  return { links, out };
}

function sample(l: Link, d: number) {
  let i = 1;
  while (i < l.cum.length - 1 && l.cum[i] < d) i++;
  const t = Math.min(1, Math.max(0, (d - l.cum[i - 1]) / Math.max(1e-6, l.cum[i] - l.cum[i - 1])));
  const [ax, az] = l.pts[i - 1];
  const [bx, bz] = l.pts[i];
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, yaw: Math.atan2(bx - ax, bz - az) };
}

function instanced(kind: VehicleKind, count: number) {
  const base = vehicleGeometry(kind);
  const g = new BufferGeometry();
  for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.getAttribute(name));
  const state = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) state.set([1, 0, 0, 0], i * 4);
  g.setAttribute('aState', new InstancedBufferAttribute(state, 4));
  g.boundingSphere = base.boundingSphere;
  return g;
}

// Signals at junctions: each junction alternates east-west and north-south green on a fixed cycle.
const SIGNAL_CYCLE = 36;   // seconds for one full cycle (green + amber both ways)
const GREEN = 15;          // seconds of green per axis
const AMBER = 3;
const simClock = { t: 0 };
function junctionNodes(links: Link[]) {
  const arms = new Map<string, number>();
  for (const l of links) arms.set(l.b, (arms.get(l.b) ?? 0) + 1);
  const sig = new Map<string, number>();
  let k = 0;
  for (const [node, n] of arms) if (n >= 3) sig.set(node, (k++) % 2);
  return sig;
}
/** 'go' while the axis has green (or amber far enough back to stop); 'stop' otherwise. */
function signalState(offset: number, axis: 0 | 1, now: number, dist: number) {
  const t = (now + offset * GREEN) % SIGNAL_CYCLE;
  const phase = axis === 0 ? t : (t + SIGNAL_CYCLE / 2) % SIGNAL_CYCLE;
  if (phase < GREEN) return 'go';
  if (phase < GREEN + AMBER) return dist < 6 ? 'go' : 'stop';
  return 'stop';
}

export function AbuDhabiTraffic() {
  const { links, out, cars, kindOf } = useMemo(() => {
    const { links, out } = buildLinks();
    const rnd = mulberry32(2026);
    const total = links.reduce((s, l) => s + l.weight * l.len, 0);
    const pickLink = () => {
      let r = rnd() * total;
      for (let i = 0; i < links.length; i++) {
        r -= links[i].weight * links[i].len;
        if (r <= 0) return i;
      }
      return links.length - 1;
    };
    const cars: Car[] = [];
    const kindOf: number[] = [];
    const sigNodes = junctionNodes(links);
    (globalThis as { __sig?: Map<string, number> }).__sig = sigNodes;
    FLEET.forEach((f, fi) => {
      for (let n = 0; n < f.n; n++) {
        const link = pickLink();
        const d = rnd() * links[link].len;
        const s = sample(links[link], d);
        cars.push({ link, d, v: 0, vmul: 0.65 + rnd() * 0.7, len: VEHICLE_LENGTH[f.kind] * CAR_SCALE, x: s.x, z: s.z, yaw: s.yaw, bx: 0, bz: 0, brake: 0, hidden: false });
        kindOf.push(fi);
      }
    });
    return { links, out, cars, kindOf };
  }, []);

  const groups = useMemo(() => FLEET.map((_, fi) => cars.map((_, ci) => ci).filter((ci) => kindOf[ci] === fi)), [cars, kindOf]);
  const geos = useMemo(() => FLEET.map((f, fi) => instanced(f.kind, groups[fi].length)), [groups]);
  const mat = useMemo(() => createVehicleMaterial(), []);
  const meshes = useRef<(InstancedMesh | null)[]>([]);
  const painted = useRef(false);
  const rnd = useMemo(() => mulberry32(77), []);
  const m4 = useMemo(() => new Matrix4(), []);
  const q = useMemo(() => new Quaternion(), []);
  const p = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  const sc = useMemo(() => new Vector3(), []);
  const beamRef = useRef<InstancedMesh>(null);
  const beamGeo = useMemo(() => {
    const g = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    g.setAttribute('aPool', new InstancedBufferAttribute(new Float32Array(cars.length * 2 * 2), 2));
    return g;
  }, [cars]);
  const beamMat = useMemo(() => createBeamMaterial(), []);

  useFrame((_, rawDt) => {
    const st = useTwinStore.getState();
    const active = st.status !== 'idle';
    const dt = Math.min(rawDt, 0.1) * fastForwardAt(runtime.t, active);
    const closed = active && runtime.t >= T.open && runtime.t < T.resolved;

    // who is directly ahead on the same link
    const byLink = new Map<number, number[]>();
    cars.forEach((c, i) => byLink.set(c.link, [...(byLink.get(c.link) ?? []), i]));
    for (const idxs of byLink.values()) idxs.sort((i, j) => cars[i].d - cars[j].d);

    simClock.t += dt;
    const sigNodes = (globalThis as { __sig?: Map<string, number> }).__sig ?? new Map<string, number>();
    cars.forEach((c, ci) => {
      const l = links[c.link];
      let target = l.speed * c.vmul;
      const near = byLink.get(c.link)!;
      const pos = near.indexOf(ci);
      if (pos < near.length - 1) {
        const lead = cars[near[pos + 1]];
        const gap = lead.d - c.d - (lead.len + c.len) / 2;
        if (gap < 0.9) target = Math.min(target, Math.max(0, lead.v * (gap / 0.9)));
      }
      // signals: stop short of the line when this approach is red
      const sigAxis = Math.abs(l.pts[l.pts.length - 1][0] - l.pts[0][0]) > Math.abs(l.pts[l.pts.length - 1][1] - l.pts[0][1]) ? 0 : 1;
      const toEnd = l.len - c.d;
      if (sigNodes.has(l.b) && toEnd < 22) {
        const offset = sigNodes.get(l.b)!;
        if (signalState(offset, sigAxis, simClock.t, toEnd) === 'stop' && toEnd > 1.2) {
          target = Math.min(target, Math.max(0, (toEnd - 1.2) * 0.9));
        }
      }
      // no collisions: anything in front within reach (on any link) sets the pace
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      for (let j = 0; j < cars.length; j++) {
        if (j === ci) continue;
        const o = cars[j];
        const dx = o.x - c.x, dz = o.z - c.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 3.2 || dist < 0.01) continue;
        if (dx * fx + dz * fz <= 0) continue;
        const clear = dist - (o.len + c.len) / 2;
        if (clear < 1.6) target = Math.min(target, Math.max(0, o.v * (clear / 1.6)));
        if (clear < 0.3) target = 0;
      }
      if (closed && l.trench && c.d < l.len) target *= 0.55;
      const brake = target < c.v - 0.05 ? 1 : 0;
      c.v += (target - c.v) * Math.min(1, dt * (brake ? 4 : 2.2));
      c.brake += (brake - c.brake) * Math.min(1, dt * 8);
      c.d += c.v * dt;
      while (c.d >= links[c.link].len) {
        const cur = links[c.link];
        const before = sample(cur, cur.len);
        let options = (out.get(cur.b) ?? []).filter((i) => links[i].b !== cur.a && !(closed && links[i].trench));
        if (!options.length) options = (out.get(cur.b) ?? []).filter((i) => !(closed && links[i].trench));
        c.d -= cur.len;
        if (!options.length) {
          // dead end at the map edge: re-enter somewhere on a main road
          c.link = Math.floor(rnd() * links.length);
          c.d = 0;
          c.bx = c.bz = 0;
          continue;
        }
        const w = options.map((i) => links[i].weight);
        let r = rnd() * w.reduce((a, b) => a + b, 0);
        let pick = options[0];
        for (let k = 0; k < options.length; k++) {
          r -= w[k];
          if (r <= 0) {
            pick = options[k];
            break;
          }
        }
        c.link = pick;
        const after = sample(links[pick], 0);
        c.bx += before.x - after.x;
        c.bz += before.z - after.z;
      }
      const s = sample(links[c.link], c.d);
      const k = Math.exp(-dt * 7);
      c.bx *= k;
      c.bz *= k;
      c.x = s.x + c.bx;
      c.z = s.z + c.bz;
      let dy = s.yaw - c.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.yaw += dy * Math.min(1, Math.min(rawDt, 0.1) * 9);
      c.hidden = closed && inTrench([c.x, c.z], 0.2);
    });

    const vis = live.exploded < 0.9;
    groups.forEach((idxs, gi) => {
      const mesh = meshes.current[gi];
      if (!mesh) return;
      mesh.visible = vis;
      const state = mesh.geometry.getAttribute('aState') as InstancedBufferAttribute;
      const prng = mulberry32(500 + gi);
      idxs.forEach((ci, n) => {
        const c = cars[ci];
        q.setFromAxisAngle(up, c.yaw);
        p.set(c.x, 0.01, c.z);
        sc.setScalar(c.hidden ? 0.0001 : CAR_SCALE);
        p.y = links[c.link].elev ? DECK_Y : 0.01;
        mesh.setMatrixAt(n, m4.compose(p, q, sc));
        state.setY(n, c.brake);
        if (!painted.current) {
          const pal = FLEET[gi].paint;
          mesh.setColorAt(n, new Color(pal[Math.floor(prng() * pal.length)]));
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      state.needsUpdate = true;
      if (!painted.current && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    painted.current = true;

    // headlight cones and tail glows follow the cars
    const beams = beamRef.current;
    if (beams) {
      beams.visible = vis;
      const attr = beamGeo.getAttribute('aPool') as InstancedBufferAttribute;
      cars.forEach((c, i) => {
        const fx = Math.sin(c.yaw);
        const fz = Math.cos(c.yaw);
        const s = c.hidden ? 0.0001 : CAR_SCALE;
        q.setFromAxisAngle(up, c.yaw);
        p.set(c.x + fx * (c.len / 2 + 1.1 * s), 0.03, c.z + fz * (c.len / 2 + 1.1 * s));
        beams.setMatrixAt(i * 2, m4.compose(p, q, sc.set(1.1 * s, 1, 2.2 * s)));
        attr.setXY(i * 2, 0, 0);
        p.set(c.x - fx * (c.len / 2 + 0.14 * s), 0.03, c.z - fz * (c.len / 2 + 0.14 * s));
        beams.setMatrixAt(i * 2 + 1, m4.compose(p, q, sc.set(0.66 * s, 1, 0.5 * s)));
        attr.setXY(i * 2 + 1, 1, c.brake);
      });
      beams.instanceMatrix.needsUpdate = true;
      attr.needsUpdate = true;
    }
  });

  return (
    <group>
      {FLEET.map((f, i) => (
        <instancedMesh
          key={f.kind}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          args={[geos[i], mat, Math.max(1, groups[i].length)]}
          count={groups[i].length}
          frustumCulled={false}
          raycast={noRaycast}
          castShadow
        />
      ))}
      <instancedMesh ref={beamRef} args={[beamGeo, beamMat, cars.length * 2]} frustumCulled={false} raycast={noRaycast} renderOrder={3} />
    </group>
  );
}
