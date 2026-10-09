import { STREET_X, STREET_Z } from '../data/city';
import { mulberry32 } from '../data/rng';

/**
 * Lane-level traffic for the street grid.
 *
 *  · every intersection runs a signal plan (through/right, protected left, all-red)
 *  · cars follow the Intelligent Driver Model behind the car ahead or a red stop line
 *  · turns are smooth quadratic curves through the junction box, indicators blink before them
 *  · the avenue segment over the excavation can be closed; traffic re-routes around it
 *
 * World units: 1 = 10 m. Cars are drawn at 2.1× scale, speeds are tuned for legibility.
 */

export const LANES_STD = [0.6, 1.55];
export const LANES_WIDE = [1.0, 1.9, 2.82];
export const PARK_STD = 2.24;
export const PARK_WIDE = 4.13;
export const NS_HALF = 2.5;
export const EW_HALF = [2.5, 2.5, 4.5, 2.5, 2.5];
/** front bumper stops this far before the junction box (just ahead of the painted stop line) */
const STOP_BACK = 2.62;
const CYCLE = 30;

type Dir = 0 | 1 | 2 | 3; // E S W N
const DX = [1, 0, -1, 0];
const DZ = [0, 1, 0, -1];
export type Move = 0 | 1 | 2; // straight, right, left

export interface RoadNode {
  i: number;
  j: number;
  x: number;
  z: number;
  hx: number;
  hz: number;
  out: (RoadEdge | null)[];
  inn: (RoadEdge | null)[];
  offset: number;
}

export interface RoadEdge {
  id: number;
  from: RoadNode;
  to: RoadNode;
  dir: Dir;
  sx: number;
  sz: number;
  ux: number;
  uz: number;
  rx: number;
  rz: number;
  length: number;
  lanes: number[];
  park: number;
  wide: boolean;
  closable: boolean;
  laneCars: Car[][];
  laneTurning: Car[][];
}

export interface TurnPath {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  lut: Float32Array;
  length: number;
}

export interface Car {
  id: number;
  kind: number;
  len: number;
  v0: number;
  v: number;
  acc: number;
  edge: RoadEdge;
  lane: number;
  s: number;
  move: Move;
  toEdge: RoadEdge | null;
  /** inside the junction: path, target edge/lane and the move planned after it */
  turn: TurnPath | null;
  turnMove: Move;
  outEdge: RoadEdge | null;
  outLane: number;
  committed: boolean;
  /** exit lane + the move after the coming junction, fixed once per approach */
  planned: number;
  nextMove: Move;
  nextEdge: RoadEdge | null;
  brake: number;
  indicator: number;
  x: number;
  z: number;
  yaw: number;
}

export interface Signals {
  /** phase colour shown to the through movement of approach `dir` at node: 0 red, 1 amber, 2 green */
  head: (node: RoadNode, dir: Dir) => number;
}

const rng = mulberry32(90210);

function makeNodes(): RoadNode[][] {
  const nodes: RoadNode[][] = [];
  STREET_X.forEach((x, i) => {
    nodes[i] = [];
    STREET_Z.forEach((z, j) => {
      nodes[i][j] = { i, j, x, z, hx: NS_HALF, hz: EW_HALF[j], out: [null, null, null, null], inn: [null, null, null, null], offset: rng() * CYCLE };
    });
  });
  return nodes;
}

function makeEdge(id: number, a: RoadNode, b: RoadNode, dir: Dir): RoadEdge {
  const ux = DX[dir];
  const uz = DZ[dir];
  const ha = dir === 0 || dir === 2 ? a.hx : a.hz;
  const hb = dir === 0 || dir === 2 ? b.hx : b.hz;
  const sx = a.x + ux * ha;
  const sz = a.z + uz * ha;
  const ex = b.x - ux * hb;
  const ez = b.z - uz * hb;
  const horizontal = dir === 0 || dir === 2;
  const wide = horizontal && a.j === 2;
  const lanes = wide ? LANES_WIDE : LANES_STD;
  const closable = horizontal && a.j === 2 && Math.min(a.i, b.i) === 2 && Math.max(a.i, b.i) === 3;
  return {
    id,
    from: a,
    to: b,
    dir,
    sx,
    sz,
    ux,
    uz,
    rx: -uz,
    rz: ux,
    length: Math.hypot(ex - sx, ez - sz),
    lanes,
    park: wide ? PARK_WIDE : PARK_STD,
    wide,
    closable,
    laneCars: lanes.map(() => []),
    laneTurning: lanes.map(() => []),
  };
}

export const NODES = makeNodes();
export const EDGES: RoadEdge[] = (() => {
  const list: RoadEdge[] = [];
  const nI = STREET_X.length;
  const nJ = STREET_Z.length;
  for (let i = 0; i < nI; i++)
    for (let j = 0; j < nJ; j++) {
      const a = NODES[i][j];
      if (i + 1 < nI) {
        const b = NODES[i + 1][j];
        const e = makeEdge(list.length, a, b, 0);
        list.push(e);
        a.out[0] = e;
        b.inn[0] = e;
        const w = makeEdge(list.length, b, a, 2);
        list.push(w);
        b.out[2] = w;
        a.inn[2] = w;
      }
      if (j + 1 < nJ) {
        const b = NODES[i][j + 1];
        const s = makeEdge(list.length, a, b, 1);
        list.push(s);
        a.out[1] = s;
        b.inn[1] = s;
        const n = makeEdge(list.length, b, a, 3);
        list.push(n);
        b.out[3] = n;
        a.inn[3] = n;
      }
    }
  return list;
})();

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

let simTime = 0;

/** 0 red · 1 amber · 2 green for movement `move` arriving at `node` heading `dir`. */
export function signalFor(node: RoadNode, dir: Dir, move: Move, t = simTime): number {
  const tau = (((t + node.offset) % CYCLE) + CYCLE) % CYCLE;
  const ns = dir === 1 || dir === 3;
  const base = ns ? 0 : 15;
  const p = tau - base;
  if (p < 0 || p >= 15) return 0;
  if (move === 2) {
    if (p >= 10.5 && p < 13.5) return 2;
    if (p >= 13.5 && p < 14.5) return 1;
    return 0;
  }
  if (p < 9) return 2;
  if (p < 10.5) return 1;
  return 0;
}

export const signals: Signals = { head: (node, dir) => signalFor(node, dir, 0) };

/* ------------------------------------------------------------------ */
/* Closures                                                            */
/* ------------------------------------------------------------------ */

let closed = false;
export function setRoadClosed(v: boolean) {
  closed = v;
}
export const isClosed = (e: RoadEdge | null) => !e || (closed && e.closable);

/* ------------------------------------------------------------------ */
/* Routing helpers                                                     */
/* ------------------------------------------------------------------ */

const turnDir = (d: Dir, m: Move): Dir => (m === 0 ? d : m === 1 ? (((d + 1) % 4) as Dir) : (((d + 3) % 4) as Dir));

function chooseMove(e: RoadEdge): { move: Move; edge: RoadEdge } | null {
  const opts: { move: Move; edge: RoadEdge; w: number }[] = [];
  for (const m of [0, 1, 2] as Move[]) {
    const next = e.to.out[turnDir(e.dir, m)];
    if (!next || isClosed(next)) continue;
    opts.push({ move: m, edge: next, w: m === 0 ? 0.56 : m === 1 ? 0.25 : 0.19 });
  }
  if (!opts.length) return null;
  let r = rng() * opts.reduce((a, o) => a + o.w, 0);
  for (const o of opts) {
    r -= o.w;
    if (r <= 0) return o;
  }
  return opts[opts.length - 1];
}

function laneFor(move: Move, n: number) {
  if (move === 2) return 0;
  if (move === 1) return n - 1;
  return n === 3 ? 1 + Math.floor(rng() * 2) : Math.floor(rng() * n);
}

function buildTurn(e: RoadEdge, lane: number, f: RoadEdge, outLane: number): TurnPath {
  const lo = e.lanes[lane];
  const x0 = e.sx + e.ux * e.length + e.rx * lo;
  const z0 = e.sz + e.uz * e.length + e.rz * lo;
  const li = f.lanes[outLane];
  const x2 = f.sx + f.rx * li;
  const z2 = f.sz + f.rz * li;
  let x1: number;
  let z1: number;
  if (e.dir === f.dir) {
    x1 = (x0 + x2) / 2;
    z1 = (z0 + z2) / 2;
  } else if (e.ux !== 0) {
    x1 = x2;
    z1 = z0;
  } else {
    x1 = x0;
    z1 = z2;
  }
  const N = 12;
  const lut = new Float32Array(N + 1);
  let px = x0;
  let pz = z0;
  for (let k = 1; k <= N; k++) {
    const t = k / N;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    const qx = a * x0 + b * x1 + c * x2;
    const qz = a * z0 + b * z1 + c * z2;
    lut[k] = lut[k - 1] + Math.hypot(qx - px, qz - pz);
    px = qx;
    pz = qz;
  }
  return { x0, z0, x1, z1, x2, z2, lut, length: lut[N] };
}

const turnCache = new Map<string, TurnPath>();
function turnPath(e: RoadEdge, lane: number, f: RoadEdge, outLane: number) {
  const key = `${e.id}:${lane}:${f.id}:${outLane}`;
  let p = turnCache.get(key);
  if (!p) {
    p = buildTurn(e, lane, f, outLane);
    turnCache.set(key, p);
  }
  return p;
}

function samplePath(p: TurnPath, s: number, out: { x: number; z: number; yaw: number }) {
  const N = p.lut.length - 1;
  let k = 1;
  while (k < N && p.lut[k] < s) k++;
  const seg = p.lut[k] - p.lut[k - 1];
  const t = ((k - 1) + (seg > 1e-6 ? Math.min(1, Math.max(0, (s - p.lut[k - 1]) / seg)) : 0)) / N;
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  out.x = a * p.x0 + b * p.x1 + c * p.x2;
  out.z = a * p.z0 + b * p.z1 + c * p.z2;
  const dx = 2 * (1 - t) * (p.x1 - p.x0) + 2 * t * (p.x2 - p.x1);
  const dz = 2 * (1 - t) * (p.z1 - p.z0) + 2 * t * (p.z2 - p.z1);
  out.yaw = Math.atan2(dx, dz);
}

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

const A_MAX = 1.7;
const B_COMF = 2.6;
const S0 = 0.38;
const HEADWAY = 0.62;

function idm(v: number, v0: number, gap: number, dv: number) {
  const free = 1 - Math.pow(Math.max(0, v) / Math.max(0.1, v0), 4);
  if (gap >= 1e5) return A_MAX * free;
  const sStar = S0 + Math.max(0, v * HEADWAY + (v * dv) / (2 * Math.sqrt(A_MAX * B_COMF)));
  const g = Math.max(gap, 0.02);
  return A_MAX * (free - (sStar / g) * (sStar / g));
}

export interface TrafficKindSpec {
  kind: number;
  len: number;
  weight: number;
  speed: [number, number];
}

export class TrafficSim {
  cars: Car[] = [];
  private tmp = { x: 0, z: 0, yaw: 0 };

  constructor(count: number, kinds: TrafficKindSpec[]) {
    const total = kinds.reduce((a, k) => a + k.weight, 0);
    let id = 0;
    let guard = 0;
    while (this.cars.length < count && guard++ < count * 40) {
      let r = rng() * total;
      let spec = kinds[0];
      for (const k of kinds) {
        r -= k.weight;
        if (r <= 0) {
          spec = k;
          break;
        }
      }
      const car = this.spawn(id, spec);
      if (car) {
        this.cars.push(car);
        id++;
      }
    }
    for (const c of this.cars) this.place(c);
  }

  private spawn(id: number, spec: TrafficKindSpec): Car | null {
    const e = EDGES[Math.floor(rng() * EDGES.length)];
    if (e.closable) return null;
    const lane = Math.floor(rng() * e.lanes.length);
    const s = 1.2 + rng() * (e.length - 6);
    if (!this.free(e, lane, s, spec.len)) return null;
    const plan = chooseMove(e);
    if (!plan) return null;
    const car: Car = {
      id,
      kind: spec.kind,
      len: spec.len,
      v0: spec.speed[0] + rng() * (spec.speed[1] - spec.speed[0]),
      v: 0,
      acc: 0,
      edge: e,
      lane,
      s,
      move: plan.move,
      toEdge: plan.edge,
      turn: null,
      turnMove: 0,
      outEdge: null,
      outLane: 0,
      committed: false,
      planned: -1,
      nextMove: 0,
      nextEdge: null,
      brake: 0,
      indicator: 0,
      x: 0,
      z: 0,
      yaw: 0,
    };
    car.v = car.v0 * 0.6;
    this.insert(e.laneCars[lane], car);
    return car;
  }

  private free(e: RoadEdge, lane: number, s: number, len: number) {
    for (const c of e.laneCars[lane]) if (Math.abs(c.s - s) < (c.len + len) / 2 + 0.6) return false;
    return true;
  }

  /** keep lane arrays ordered front-most first */
  private insert(arr: Car[], car: Car) {
    let k = arr.length;
    while (k > 0 && arr[k - 1].s < car.s) k--;
    arr.splice(k, 0, car);
  }

  private remove(arr: Car[], car: Car) {
    const k = arr.indexOf(car);
    if (k >= 0) arr.splice(k, 1);
  }

  /** Move cars off a closed edge to a free spot elsewhere (used when the excavation opens under them). */
  evacuateClosed() {
    for (const e of EDGES) {
      if (!isClosed(e) || !e.closable) continue;
      for (let l = 0; l < e.lanes.length; l++) {
        const list = [...e.laneCars[l], ...e.laneTurning[l]];
        for (const car of list) {
          this.remove(e.laneCars[l], car);
          this.remove(e.laneTurning[l], car);
          car.turn = null;
          for (let tries = 0; tries < 60; tries++) {
            const ne = EDGES[Math.floor(rng() * EDGES.length)];
            if (ne.closable) continue;
            const lane = Math.floor(rng() * ne.lanes.length);
            const s = 1.2 + rng() * (ne.length - 6);
            if (!this.free(ne, lane, s, car.len)) continue;
            const plan = chooseMove(ne);
            if (!plan) continue;
            car.edge = ne;
            car.lane = lane;
            car.s = s;
            car.move = plan.move;
            car.toEdge = plan.edge;
            car.committed = false;
            car.planned = -1;
            this.insert(ne.laneCars[lane], car);
            break;
          }
          this.place(car);
        }
      }
    }
    // cars that are mid-junction heading into the closed segment
    for (const car of this.cars) {
      if (car.turn && car.outEdge && isClosed(car.outEdge)) {
        // finish the turn in place: retarget the exit onto another movement from the same approach
        const alt = chooseMove(car.edge);
        if (alt) {
          car.outEdge = alt.edge;
          car.outLane = Math.min(car.outLane, alt.edge.lanes.length - 1);
        }
      }
    }
  }

  step(dt: number, t: number) {
    simTime = t;
    if (dt <= 0) return;
    const h = Math.min(dt, 0.05);
    let remaining = dt;
    while (remaining > 1e-6) {
      const d = Math.min(h, remaining);
      this.tick(d);
      remaining -= d;
    }
    for (const c of this.cars) this.place(c);
  }

  private tick(dt: number) {
    for (const e of EDGES) {
      for (let l = 0; l < e.lanes.length; l++) {
        const lane = e.laneCars[l];
        const turning = e.laneTurning[l];
        // --- cars inside the junction (leader first) ---
        for (let k = 0; k < turning.length; k++) {
          const car = turning[k];
          const p = car.turn!;
          let gap = 1e6;
          let dv = 0;
          if (k > 0) {
            const lead = turning[k - 1];
            gap = lead.s - lead.len / 2 - (car.s + car.len / 2);
            dv = car.v - lead.v;
          } else if (car.outEdge) {
            const tail = car.outEdge.laneCars[car.outLane];
            const last = tail[tail.length - 1];
            if (last) {
              gap = p.length - car.s - car.len / 2 + (last.s - last.len / 2);
              dv = car.v - last.v;
            }
          }
          const vT = car.turnMove === 0 ? car.v0 : car.turnMove === 1 ? 1.05 : 1.45;
          car.acc = idm(car.v, Math.min(car.v0, vT), gap, dv);
        }
        // --- cars on the edge (front-most first) ---
        for (let k = 0; k < lane.length; k++) {
          const car = lane[k];
          let gap = 1e6;
          let dv = 0;
          if (k > 0) {
            const lead = lane[k - 1];
            gap = lead.s - lead.len / 2 - (car.s + car.len / 2);
            dv = car.v - lead.v;
          } else {
            const lead = turning[turning.length - 1];
            if (lead) {
              gap = e.length - car.s - car.len / 2 + (lead.s - lead.len / 2);
              dv = car.v - lead.v;
            }
          }
          let acc = idm(car.v, car.v0, gap, dv);
          // turn speed: slow down before entering the junction box
          const toBox = e.length - car.s;
          if (car.move !== 0) {
            const vT = (car.move === 1 ? 1.05 : 1.45) + 0.45 * Math.max(0, toBox - car.len);
            acc = Math.min(acc, idm(car.v, Math.min(car.v0, vT), 1e6, 0));
          }
          // stop line
          if (k === 0 && !car.committed) {
            if (!car.toEdge || isClosed(car.toEdge)) {
              const plan = chooseMove(e);
              if (plan) {
                car.move = plan.move;
                car.toEdge = plan.edge;
                car.planned = -1;
              }
            }
            const dStop = e.length - STOP_BACK - (car.s + car.len / 2);
            const sig = signalFor(e.to, e.dir, car.move);
            let go = false;
            if (car.toEdge && !isClosed(car.toEdge)) {
              const tgtLane = Math.min(this.planLane(car), car.toEdge.lanes.length - 1);
              const tail = car.toEdge.laneCars[tgtLane];
              const last = tail[tail.length - 1];
              const room = !last || last.s - last.len / 2 > car.len + 0.5;
              if (room && (sig === 2 || (sig === 1 && dStop < (car.v * car.v) / (2 * B_COMF) + 0.05))) go = true;
            }
            if (!go && dStop > -0.05) acc = Math.min(acc, idm(car.v, car.v0, Math.max(dStop, 0.01), car.v));
            if (go && dStop < 0.2) car.committed = true;
          }
          car.acc = acc;
        }
      }
    }

    // integrate + transitions (iterate over a snapshot since cars move between lists)
    for (const car of this.cars) {
      const prevV = car.v;
      car.v = Math.max(0, car.v + car.acc * dt);
      car.s += (prevV + car.v) * 0.5 * dt;
      const decel = car.acc < -0.4 ? Math.min(1, -car.acc / 2.2) : 0;
      const target = car.v < 0.05 ? 0.9 : decel;
      car.brake += (target - car.brake) * Math.min(1, dt * 8);
      if (car.turn) {
        if (car.s >= car.turn.length) this.exitTurn(car);
      } else if (car.s >= car.edge.length) {
        this.enterTurn(car);
      }
      // indicators: blink on approach and through the turn
      const near = car.turn ? 1 : car.edge.length - car.s < 7 ? 1 : 0;
      const m = car.turn ? car.turnMove : car.move;
      car.indicator = near && m !== 0 ? (m === 2 ? 1 : -1) : 0;
    }
  }

  /** Exit lane for the coming turn, chosen for the move after it; fixed once per approach. */
  private planLane(car: Car) {
    if (car.planned < 0) {
      const after = car.toEdge ? chooseMove(car.toEdge) : null;
      car.nextMove = after ? after.move : 0;
      car.nextEdge = after ? after.edge : null;
      car.planned = laneFor(car.nextMove, car.toEdge ? car.toEdge.lanes.length : 2);
    }
    return car.planned;
  }

  private enterTurn(car: Car) {
    const e = car.edge;
    let f = car.toEdge;
    if (!f || isClosed(f)) {
      const plan = chooseMove(e);
      f = plan ? plan.edge : null;
      if (plan) car.move = plan.move;
      car.planned = -1;
    }
    this.remove(e.laneCars[car.lane], car);
    if (!f) {
      // dead end (should not happen on a full grid): respawn at the start of the edge
      car.s = 0;
      this.insert(e.laneCars[car.lane], car);
      return;
    }
    car.toEdge = f;
    const outLane = Math.min(this.planLane(car), f.lanes.length - 1);
    car.planned = -1;
    car.s -= e.length;
    car.turn = turnPath(e, car.lane, f, outLane);
    car.turnMove = car.move;
    car.outEdge = f;
    car.outLane = outLane;
    e.laneTurning[car.lane].push(car);
  }

  private exitTurn(car: Car) {
    const e = car.edge;
    this.remove(e.laneTurning[car.lane], car);
    const f = car.outEdge!;
    car.s -= car.turn!.length;
    car.turn = null;
    car.edge = f;
    car.lane = car.outLane;
    car.committed = false;
    if (car.nextEdge && !isClosed(car.nextEdge) && car.nextEdge.from === f.to) {
      car.move = car.nextMove;
      car.toEdge = car.nextEdge;
    } else {
      const plan = chooseMove(f);
      car.move = plan ? plan.move : 0;
      car.toEdge = plan ? plan.edge : null;
    }
    car.nextEdge = null;
    this.insert(f.laneCars[car.lane], car);
  }

  private place(car: Car) {
    if (car.turn) {
      samplePath(car.turn, Math.max(0, car.s), this.tmp);
      car.x = this.tmp.x;
      car.z = this.tmp.z;
      car.yaw = this.tmp.yaw;
      return;
    }
    const e = car.edge;
    const off = e.lanes[car.lane];
    car.x = e.sx + e.ux * car.s + e.rx * off;
    car.z = e.sz + e.uz * car.s + e.rz * off;
    car.yaw = Math.atan2(e.ux, e.uz);
  }
}

/* ------------------------------------------------------------------ */
/* Kerbside parking + signal mast positions                            */
/* ------------------------------------------------------------------ */

export interface Slot {
  x: number;
  z: number;
  yaw: number;
}

/** Parking bays along every kerb, skipping junction approaches and the given exclusion boxes. */
export function parkingSlots(spacing: number, exclude: { minX: number; maxX: number; minZ: number; maxZ: number }[]): Slot[] {
  const out: Slot[] = [];
  for (const e of EDGES) {
    for (let s = 3.2; s < e.length - 3.0; s += spacing) {
      const x = e.sx + e.ux * s + e.rx * e.park;
      const z = e.sz + e.uz * s + e.rz * e.park;
      if (exclude.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) continue;
      out.push({ x, z, yaw: Math.atan2(e.ux, e.uz) });
    }
  }
  return out;
}

export interface SignalMast {
  node: RoadNode;
  dir: Dir;
  /** pole base */
  px: number;
  pz: number;
  /** signal head (above the lanes) */
  hx: number;
  hz: number;
  /** direction the lamps face (towards approaching traffic) */
  fx: number;
  fz: number;
  armLen: number;
}

/** One mast per approach, on the far-side kerb, arm reaching over the approaching lanes. */
export function signalMasts(): SignalMast[] {
  const out: SignalMast[] = [];
  for (const col of NODES)
    for (const n of col)
      for (const d of [0, 1, 2, 3] as Dir[]) {
        const e = n.inn[d];
        if (!e) continue;
        const along = d === 0 || d === 2 ? n.hx : n.hz;
        const lat = d === 0 || d === 2 ? n.hz : n.hx;
        const px = n.x + e.ux * (along + 0.45) + e.rx * (lat + 0.45);
        const pz = n.z + e.uz * (along + 0.45) + e.rz * (lat + 0.45);
        const reach = e.lanes[e.lanes.length - 1] * 0.5 + 0.35;
        const hx = n.x + e.ux * (along + 0.45) + e.rx * (lat - reach);
        const hz = n.z + e.uz * (along + 0.45) + e.rz * (lat - reach);
        out.push({ node: n, dir: d, px, pz, hx, hz, fx: -e.ux, fz: -e.uz, armLen: reach + 0.45 });
      }
  return out;
}
