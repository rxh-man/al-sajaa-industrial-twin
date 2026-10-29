import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { AD, type XZ } from '../data/abudhabi';
import { motionScale } from '../store/useTwinStore';

/**
 * Etihad Rail: the 3D track, the bridges where it crosses roads, and a passenger train on it.
 * The line comes from the baseline data (class 'rail'). It is crossed at four underpasses only (Emirates Road
 * E611 and Al Sajaa Streets 4, 13 and 19; the other streets stop either side of the track, see
 * scripts/build-world-fixes.py): over each one it rises onto a deck above the road, with ramps either side and
 * piers kept out of the carriageway. Crossings closer together than two ramps share one deck. The track and the
 * train share one height profile, so the train rides over the underpasses.
 */

const BRIDGE_H = 0.7;   // deck height above ground (about 7 m); clears a five-lane carriageway
const DECK_HALF = 1.2;  // flat part of the deck either side of the crossing (units)
const RAMP = 1.6;       // length of each ramp down to the ground
const SAMPLE = 0.2;     // path sampling step for the track geometry (units)
const RAIL_GAUGE = 0.12;
const SLEEPER_PITCH = 0.3;
const PIER_W = 0.22;
const DECK_W = 0.5;   // width of the bridge deck slab (units)
const PIER_EVERY = 3.0; // pier spacing along a viaduct (30 m)
const PIER_CLEAR = 1.1; // piers stay this far (along the line) from a crossing's centre line: clear of a trunk carriageway

const LOCO = 2.4;
const CARRIAGE = 2.2;
const GAP = 0.15;
const UNITS = [LOCO, CARRIAGE, CARRIAGE, CARRIAGE, CARRIAGE];
const SPEED = 1.6;

/** Advance the train's clock by one frame at the motion scale (full 1, reduced 0.3, off 0). Pure, so it can be tested. */
export function advanceRailClock(t: number, dt: number, scale: number): number {
  return t + Math.min(dt, 0.1) * SPEED * scale;
}
const BODY_H = 0.42;
const BODY_W = 0.36;

function railPath(): XZ[] {
  const r = AD.roads.find((q) => q.c === 'rail');
  return r ? (r.p as XZ[]) : [];
}

/** cumulative arc length along the path */
function arcLengths(path: XZ[]) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  return cum;
}

/** points where the rail line crosses a road centre line: returns arc-length positions along the rail */
function crossings(path: XZ[], cum: number[]): number[] {
  const out: number[] = [];
  const cross = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) => {
    const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
    const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
  };
  for (const r of AD.roads) {
    // every drivable street at ground level is bridged (tunnels and flyovers already clear the line)
    if (!DRIVABLE.test(r.c) || r.t === 1 || r.o === 1) continue;
    const rp = r.p as XZ[];
    for (let i = 1; i < path.length; i++) {
      for (let j = 1; j < rp.length; j++) {
        const t = cross(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1], rp[j - 1][0], rp[j - 1][1], rp[j][0], rp[j][1]);
        if (t !== null) out.push(cum[i - 1] + (cum[i] - cum[i - 1]) * t);
      }
    }
  }
  // merge crossings that are closer than the deck (one bridge per crossing area)
  out.sort((a, b) => a - b);
  const merged: number[] = [];
  for (const s of out) if (!merged.length || s - merged[merged.length - 1] > 0.8) merged.push(s);
  return merged;
}

const DRIVABLE = /^(trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$/;

/** raised spans [start, end] in arc length: one per crossing, merged where two would leave less than two ramps between them */
export function viaductSpans(crossS: number[]): [number, number][] {
  const spans: [number, number][] = [];
  for (const c of crossS) {
    const a = c - DECK_HALF;
    const b = c + DECK_HALF;
    const last = spans[spans.length - 1];
    if (last && a - last[1] < RAMP * 2 + 1) last[1] = b;
    else spans.push([a, b]);
  }
  return spans;
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** height of the rail deck at arc length s: BRIDGE_H along each raised span, ramping down to the ground */
export function heightFn(spans: [number, number][]) {
  return (s: number) => {
    let h = 0;
    for (const [a, b] of spans) {
      const d = s < a ? a - s : s > b ? s - b : 0;
      if (d === 0) return BRIDGE_H;
      if (d < RAMP) h = Math.max(h, BRIDGE_H * (1 - smooth(d / RAMP)));
    }
    return h;
  };
}
export const RAIL_BRIDGE_H = BRIDGE_H;

/** position on the path at arc length s */
function pointAt(path: XZ[], cum: number[], s: number, out: { x: number; z: number; dx: number; dz: number }) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const a = path[i - 1], b = path[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const u = Math.min(1, Math.max(0, (s - cum[i - 1]) / seg));
  out.x = a[0] + (b[0] - a[0]) * u;
  out.z = a[1] + (b[1] - a[1]) * u;
  out.dx = b[0] - a[0];
  out.dz = b[1] - a[1];
  return out;
}

/** shared path data: arc lengths, crossings with roads, and the height profile (pure; tested) */
export function railGeometry() {
  const path = railPath();
  const cum = arcLengths(path);
  const total = cum[cum.length - 1] || 1;
  const crossS = path.length > 1 ? crossings(path, cum) : [];
  const spans = viaductSpans(crossS);
  return { path, cum, total, crossS, spans, height: heightFn(spans) };
}

function useRailGeometry() {
  return useMemo(railGeometry, []);
}

/**
 * The raised track: two steel rails and sleepers, sampled finely so the deck can rise and fall
 * smoothly. Piers stand at the ends of each bridge deck.
 */
export function RailTrack() {
  const { path, cum, total, crossS, spans, height } = useRailGeometry();
  const built = useMemo(() => {
    const rails: Matrix4[] = [];
    const sleepers: Matrix4[] = [];
    const piers: Matrix4[] = [];
    const decks: Matrix4[] = [];
    const q = new Quaternion();
    const pos = new Vector3();
    const scale = new Vector3();
    const p = { x: 0, z: 0, dx: 0, dz: 0 };
    let nextSleeper = 0;
    for (let s = 0; s < total - 1e-6; s += SAMPLE) {
      const s2 = Math.min(total, s + SAMPLE);
      pointAt(path, cum, s, p);
      const x0 = p.x, z0 = p.z;
      pointAt(path, cum, s2, p);
      const x1 = p.x, z1 = p.z;
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-6) continue;
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      q.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
      const h0 = height(s), h1 = height(s2);
      const hm = (h0 + h1) / 2;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const px = Math.cos(yaw), pz = -Math.sin(yaw);
      // concrete deck slab under the track wherever the line is raised
      if (hm > 0.01) {
        pos.set(mx, hm - 0.06, mz);
        scale.set(DECK_W, 0.12, len * 1.02);
        decks.push(new Matrix4().compose(pos, q, scale));
      }
      for (const side of [-1, 1]) {
        pos.set(mx + px * RAIL_GAUGE * side, hm + 0.07, mz + pz * RAIL_GAUGE * side);
        scale.set(0.035, 0.07, len);
        rails.push(new Matrix4().compose(pos, q, scale));
      }
      while (nextSleeper < s2) {
        const u = (nextSleeper - s) / SAMPLE;
        const hs = height(nextSleeper);
        pos.set(x0 + (x1 - x0) * u, hs + 0.035, z0 + (z1 - z0) * u);
        scale.set(0.5, 0.04, 0.08);
        sleepers.push(new Matrix4().compose(pos, q, scale));
        nextSleeper += SLEEPER_PITCH;
      }
    }
    // piers: at both ends of each span and every PIER_EVERY along it, from the ground up to the deck
    for (const [a, b] of spans) {
      const n = Math.max(1, Math.round((b - a) / PIER_EVERY));
      for (let i = 0; i <= n; i++) {
        let sAt = a + ((b - a) * i) / n;
        // never in a carriageway: a pier near a crossing steps clear of the road under the deck
        for (const c of crossS) if (Math.abs(sAt - c) < PIER_CLEAR) sAt = c + (sAt < c ? -PIER_CLEAR : PIER_CLEAR);
        if (sAt < 0 || sAt > total) continue;
        pointAt(path, cum, sAt, p);
        const yaw = Math.atan2(p.dx, p.dz);
        q.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
        pos.set(p.x, BRIDGE_H / 2, p.z);
        scale.set(PIER_W, BRIDGE_H, PIER_W * 2);
        piers.push(new Matrix4().compose(pos, q, scale));
      }
    }
    return { rails, sleepers, piers, decks };
  }, [path, cum, total, crossS, spans, height]);

  const railRef = useRef<InstancedMesh>(null);
  const sleeperRef = useRef<InstancedMesh>(null);
  const pierRef = useRef<InstancedMesh>(null);
  const deckRef = useRef<InstancedMesh>(null);
  // instance matrices are written once the instanced meshes exist
  useEffect(() => {
    const set = (ref: React.RefObject<InstancedMesh | null>, mats: Matrix4[]) => {
      const m = ref.current;
      if (!m) return;
      mats.forEach((mat, i) => m.setMatrixAt(i, mat));
      m.instanceMatrix.needsUpdate = true;
    };
    set(railRef, built.rails);
    set(sleeperRef, built.sleepers);
    set(pierRef, built.piers);
    set(deckRef, built.decks);
  }, [built]);

  if (path.length < 2) return null;
  return (
    <group>
      <instancedMesh ref={railRef} args={[undefined, undefined, built.rails.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#b9bcc2" roughness={0.35} metalness={0.7} />
      </instancedMesh>
      <instancedMesh ref={sleeperRef} args={[undefined, undefined, built.sleepers.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#5b4a3a" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={deckRef} args={[undefined, undefined, built.decks.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#a7a49d" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={pierRef} args={[undefined, undefined, built.piers.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#8f8b84" roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

/** A passenger train on the track, following the same height profile as the deck. */
export function RailTrain() {
  const { path, cum, total, height } = useRailGeometry();
  const cars = useRef<(Group | null)[]>([]);
  const t0 = useRef(0);
  const p = useMemo(() => ({ x: 0, z: 0, dx: 0, dz: 0 }), []);
  const tmp = useMemo(() => new Vector3(), []);

  useFrame((_, dt) => {
    // motion setting: reduced slows the train, off holds it where it is
    t0.current = advanceRailClock(t0.current, dt, motionScale());
    const head = t0.current % (total + 40);
    let back = head;
    UNITS.forEach((len, k) => {
      const g = cars.current[k];
      const s = Math.min(total, Math.max(0, back));
      if (g) {
        pointAt(path, cum, s, p);
        tmp.set(p.x, height(s) + 0.21, p.z);
        g.position.copy(tmp);
        g.rotation.y = Math.atan2(p.dx, p.dz);
        g.visible = back >= 0 && back <= total;
      }
      back -= len + GAP;
    });
  });

  if (path.length < 2) return null;
  return (
    <group>
      {UNITS.map((len, k) => (
        <group key={k} ref={(el) => (cars.current[k] = el)} userData={{ railCar: k }}>
          <mesh position={[0, BODY_H / 2, 0]} castShadow>
            <boxGeometry args={[BODY_W, BODY_H, len]} />
            <meshStandardMaterial color={k === 0 ? '#e9e7e2' : '#dfe3e8'} roughness={0.5} metalness={0.1} />
          </mesh>
          <mesh position={[0, BODY_H * 0.62, 0]}>
            <boxGeometry args={[BODY_W + 0.01, 0.05, len]} />
            <meshStandardMaterial color="#b51f2b" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
