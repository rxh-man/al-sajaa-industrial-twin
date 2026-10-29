import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { AD, type XZ } from '../data/abudhabi';
import { RAIL_LAYOUT, railCentre, trackPath, type TrackId } from '../data/railLayout';
import { motionScale } from '../store/useTwinStore';

/**
 * Etihad Rail: a double track, the bridges where it crosses roads, and two passenger trains, one each way.
 * The line comes from the baseline data (class 'rail'); the tracks run either side of it (src/data/railLayout.ts)
 * and spread round an island platform at the station and the halt. It is crossed at four underpasses only
 * (Emirates Road E611 and Al Sajaa Streets 4, 13 and 19; the other streets stop either side of the track, see
 * scripts/build-world-fixes.py): over each one both tracks rise onto a shared deck above the road, with ramps
 * either side and piers kept out of the carriageway. Crossings closer together than two ramps share one deck.
 * Each train brakes into every platform, waits there (RAIL_LAYOUT.dwellSeconds), and pulls away again.
 */

const BRIDGE_H = 0.7;   // deck height above ground (about 7 m); clears a five-lane carriageway
const DECK_HALF = 1.2;  // flat part of the deck either side of the crossing (units)
const RAMP = 1.6;       // length of each ramp down to the ground
const SAMPLE = 0.2;     // path sampling step for the track geometry (units)
const RAIL_GAUGE = 0.12;
const SLEEPER_PITCH = 0.3;
const PIER_W = 0.22;
const DECK_W = 1.1;     // width of the bridge deck slab: carries both tracks (units)
const PIER_EVERY = 3.0; // pier spacing along a viaduct (30 m)
const PIER_CLEAR = 1.1; // piers stay this far (along the line) from a crossing's centre line: clear of a trunk carriageway

const LOCO = 2.4;
const CARRIAGE = 2.2;
const GAP = 0.15;
const UNITS = [LOCO, CARRIAGE, CARRIAGE, CARRIAGE, CARRIAGE];
export const TRAIN_LENGTH = UNITS.reduce((a, b) => a + b, 0) + GAP * (UNITS.length - 1);
const SPEED = 1.6;      // line speed (units / s)
const ACCEL = 0.45;     // braking and pulling away (units / s²)
const RUNOUT = 40;      // distance run past the end of the line before the train comes round again

/** Advance the train's clock by one frame at the motion scale (full 1, reduced 0.3, off 0). Pure, so it can be tested. */
export function advanceRailClock(t: number, dt: number, scale: number): number {
  return t + Math.min(dt, 0.1) * SPEED * scale;
}

export interface TrainState {
  /** distance of the head along the train's direction of travel (0 = start of its run) */
  u: number;
  v: number;
  /** seconds left standing at the platform */
  dwell: number;
  /** index of the next stop in `stops` */
  next: number;
}

/**
 * One frame of a train's run: pull away to line speed, brake so the head stops exactly at the next stop (head
 * positions, ascending), stand there for `dwellSeconds`, and run on; past the end it comes round again. The frame
 * is clamped and scaled by the motion setting like advanceRailClock (reduced slows it, off holds it). Pure.
 */
export function stepTrain(st: TrainState, dt: number, scale: number, stops: number[], total: number, dwellSeconds = RAIL_LAYOUT.dwellSeconds): TrainState {
  const t = Math.min(dt, 0.1) * scale;
  if (t <= 0) return st;
  let { u, v, dwell, next } = st;
  if (dwell > 0) {
    dwell -= t;
    if (dwell > 0) return { u, v: 0, dwell, next };
    dwell = 0;
    next += 1;
  }
  const stop = next < stops.length ? stops[next] : Infinity;
  const dist = stop - u;
  // the fastest speed from which the train can still stop at the stop
  const vStop = Number.isFinite(dist) ? Math.sqrt(2 * ACCEL * Math.max(0, dist)) : Infinity;
  v = Math.min(SPEED, v + ACCEL * t, vStop);
  u += v * t;
  if (Number.isFinite(stop) && u >= stop - 1e-3) {
    u = stop;
    v = 0;
    dwell = dwellSeconds;
  }
  if (u > total + RUNOUT) return { u: 0, v: 0, dwell: 0, next: 0 };
  return { u, v, dwell, next };
}

const BODY_H = 0.42;
const BODY_W = 0.36;

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

/**
 * shared line data (pure; tested): the centre line, its crossings with roads and the height profile, and both
 * tracks. The line runs along x, so a track point's height is the centre's height at the same x.
 */
export function railGeometry() {
  const path = railCentre();
  const cum = arcLengths(path);
  const total = cum[cum.length - 1] || 1;
  const crossS = path.length > 1 ? crossings(path, cum) : [];
  const spans = viaductSpans(crossS);
  const height = heightFn(spans);
  const x0 = path.length ? path[0][0] : 0;
  const heightAtX = (x: number) => height(x - x0);
  const tracks = (['westbound', 'eastbound'] as TrackId[]).map((id) => {
    const p = trackPath(id);
    const c = arcLengths(p);
    const dir = RAIL_LAYOUT.tracks.find((t) => t.id === id)!.dir;
    return { id, path: p, cum: c, total: c[c.length - 1] || 1, dir };
  });
  return { path, cum, total, crossS, spans, height, heightAtX, tracks };
}

/** arc length on a track where it passes x (the line runs along x) */
function arcAtX(path: XZ[], cum: number[], x: number) {
  for (let i = 1; i < path.length; i++) {
    const [ax] = path[i - 1];
    const [bx] = path[i];
    if ((x - ax) * (x - bx) <= 0 && ax !== bx) return cum[i - 1] + ((x - ax) / (bx - ax)) * (cum[i] - cum[i - 1]);
  }
  return x < path[0][0] ? 0 : cum[cum.length - 1];
}

/** head positions (in each train's own travel distance) that stop it with its middle at each platform's middle */
export function trainStops(track: ReturnType<typeof railGeometry>['tracks'][number]) {
  const stops = RAIL_LAYOUT.stations.map((s) => {
    const arc = arcAtX(track.path, track.cum, (s.x0 + s.x1) / 2);
    const mid = track.dir > 0 ? arc : track.total - arc;
    return mid + TRAIN_LENGTH / 2;
  });
  return stops.sort((a, b) => a - b);
}

function useRailGeometry() {
  return useMemo(railGeometry, []);
}

/**
 * The track: two steel rails and sleepers per track, sampled finely so the deck can rise and fall smoothly, a
 * shared deck slab wherever the line is raised, and piers along each span.
 */
export function RailTrack() {
  const { path, cum, total, crossS, spans, height, heightAtX, tracks } = useRailGeometry();
  const built = useMemo(() => {
    const rails: Matrix4[] = [];
    const sleepers: Matrix4[] = [];
    const piers: Matrix4[] = [];
    const decks: Matrix4[] = [];
    const q = new Quaternion();
    const pos = new Vector3();
    const scale = new Vector3();
    const p = { x: 0, z: 0, dx: 0, dz: 0 };
    const up = new Vector3(0, 1, 0);
    // the deck slab under both tracks wherever the line is raised (along the centre line)
    for (let s = 0; s < total - 1e-6; s += SAMPLE) {
      const s2 = Math.min(total, s + SAMPLE);
      const hm = (height(s) + height(s2)) / 2;
      if (hm <= 0.01) continue;
      pointAt(path, cum, s, p);
      const x0 = p.x, z0 = p.z;
      pointAt(path, cum, s2, p);
      const len = Math.hypot(p.x - x0, p.z - z0);
      if (len < 1e-6) continue;
      q.setFromAxisAngle(up, Math.atan2(p.x - x0, p.z - z0));
      decks.push(new Matrix4().compose(pos.set((x0 + p.x) / 2, hm - 0.06, (z0 + p.z) / 2), q, scale.set(DECK_W, 0.12, len * 1.02)));
    }
    // rails and sleepers, per track
    for (const t of tracks) {
      let nextSleeper = 0;
      for (let s = 0; s < t.total - 1e-6; s += SAMPLE) {
        const s2 = Math.min(t.total, s + SAMPLE);
        pointAt(t.path, t.cum, s, p);
        const x0 = p.x, z0 = p.z;
        pointAt(t.path, t.cum, s2, p);
        const x1 = p.x, z1 = p.z;
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len < 1e-6) continue;
        const yaw = Math.atan2(x1 - x0, z1 - z0);
        q.setFromAxisAngle(up, yaw);
        const hm = (heightAtX(x0) + heightAtX(x1)) / 2;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const px = Math.cos(yaw), pz = -Math.sin(yaw);
        for (const side of [-1, 1]) {
          pos.set(mx + px * RAIL_GAUGE * side, hm + 0.07, mz + pz * RAIL_GAUGE * side);
          scale.set(0.035, 0.07, len);
          rails.push(new Matrix4().compose(pos, q, scale));
        }
        while (nextSleeper < s2) {
          const u = (nextSleeper - s) / SAMPLE;
          const sx = x0 + (x1 - x0) * u;
          pos.set(sx, heightAtX(sx) + 0.035, z0 + (z1 - z0) * u);
          scale.set(0.5, 0.04, 0.08);
          sleepers.push(new Matrix4().compose(pos, q, scale));
          nextSleeper += SLEEPER_PITCH;
        }
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
        q.setFromAxisAngle(up, yaw);
        pos.set(p.x, BRIDGE_H / 2, p.z);
        scale.set(DECK_W * 0.8, BRIDGE_H, PIER_W * 2);
        piers.push(new Matrix4().compose(pos, q, scale));
      }
    }
    return { rails, sleepers, piers, decks };
  }, [path, cum, total, crossS, spans, height, heightAtX, tracks]);

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
      <instancedMesh ref={deckRef} args={[undefined, undefined, Math.max(1, built.decks.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#a7a49d" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={pierRef} args={[undefined, undefined, Math.max(1, built.piers.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#8f8b84" roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

/** One passenger train on one track, following the height profile and stopping at each platform. */
function Train({ track, start, livery }: { track: ReturnType<typeof railGeometry>['tracks'][number]; start: number; livery: string }) {
  const { heightAtX } = useRailGeometry();
  const stops = useMemo(() => trainStops(track), [track]);
  const cars = useRef<(Group | null)[]>([]);
  const state = useRef<TrainState>({ u: start, v: SPEED, dwell: 0, next: stops.findIndex((s) => s > start) === -1 ? stops.length : stops.findIndex((s) => s > start) });
  const p = useMemo(() => ({ x: 0, z: 0, dx: 0, dz: 0 }), []);

  useFrame((_, dt) => {
    // motion setting: reduced slows the train, off holds it where it is
    state.current = stepTrain(state.current, dt, motionScale(), stops, track.total);
    let back = state.current.u;
    UNITS.forEach((len, k) => {
      const g = cars.current[k];
      const mid = back - len / 2; // this car's middle, in travel distance
      if (g) {
        const arc = track.dir > 0 ? mid : track.total - mid;
        const s = Math.min(track.total, Math.max(0, arc));
        pointAt(track.path, track.cum, s, p);
        g.position.set(p.x, heightAtX(p.x) + 0.21, p.z);
        g.rotation.y = Math.atan2(p.dx * track.dir, p.dz * track.dir);
        g.visible = mid >= 0 && mid <= track.total;
      }
      back -= len + GAP;
    });
  });

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
            <meshStandardMaterial color={livery} roughness={0.6} />
          </mesh>
          <mesh position={[0, BODY_H * 0.42, 0]}>
            <boxGeometry args={[BODY_W + 0.012, 0.09, len * 0.9]} />
            <meshStandardMaterial color="#1f2a33" roughness={0.2} metalness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Two passenger trains, one each way, so they pass each other on the double track. */
export function RailTrain() {
  const { tracks, path } = useRailGeometry();
  if (path.length < 2) return null;
  const east = tracks.find((t) => t.id === 'eastbound')!;
  const west = tracks.find((t) => t.id === 'westbound')!;
  return (
    <group>
      <Train track={east} start={0} livery="#b51f2b" />
      <Train track={west} start={west.total * 0.45} livery="#8a6a2e" />
    </group>
  );
}
