import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Network, NetNode } from '../../data/networks';

export interface PipeInstance {
  matrix: Matrix4;
  seg: number;
  flow: number;
  flowIso: number;
  reroute: number;
  start: Vector3;
  end: Vector3;
  radius: number;
}

export interface BuiltNetwork {
  pipes: PipeInstance[];
  elbows: Matrix4[];
  hubs: Matrix4[];
  flanges: Matrix4[];
  risers: Matrix4[];
  hubPositions: Vector3[];
}

const UP = new Vector3(0, 1, 0);
export const ELBOW_RATIO = 2.6;

function dirFrom(node: NetNode, other: [number, number]) {
  return new Vector3(other[0] - node.x, 0, other[1] - node.z).normalize();
}

/** Converts a network graph into instance transforms for pipes and fittings. */
export function buildNetworkGeometry(net: Network): BuiltNetwork {
  const nodeByKey = new Map(net.nodes.map((n) => [n.key, n]));
  const key = (x: number, z: number) => `${x.toFixed(2)},${z.toFixed(2)}`;
  const y = net.layer.depth;

  type Kind = 'elbow' | 'hub' | 'coupling' | 'end' | 'boundary';
  const kind = new Map<string, Kind>();
  const elbowR = new Map<string, number>();
  const out: BuiltNetwork = { pipes: [], elbows: [], hubs: [], flanges: [], risers: [], hubPositions: [] };

  const riserKeys = new Set(net.risers.map((r) => key(r.x, r.z)));
  for (const n of net.nodes) {
    if (n.boundary) {
      kind.set(n.key, 'boundary');
      continue;
    }
    const segs = n.edges.map((i) => net.segments[i]);
    if (segs.length >= 3 || riserKeys.has(n.key)) {
      kind.set(n.key, 'hub');
      const r = Math.max(...segs.map((s) => s.radius));
      const m = new Matrix4().compose(new Vector3(n.x, y, n.z), new Quaternion(), new Vector3(r * 1.42, r * 1.42, r * 1.42));
      out.hubs.push(m);
      out.hubPositions.push(new Vector3(n.x, y, n.z));
      continue;
    }
    if (segs.length === 1) {
      kind.set(n.key, 'end');
      continue;
    }
    const [s1, s2] = segs;
    const o1: [number, number] = key(s1.a[0], s1.a[1]) === n.key ? s1.b : s1.a;
    const o2: [number, number] = key(s2.a[0], s2.a[1]) === n.key ? s2.b : s2.a;
    const d1 = dirFrom(n, o1);
    const d2 = dirFrom(n, o2);
    if (Math.abs(d1.dot(d2)) < 0.01) {
      kind.set(n.key, 'elbow');
      const r = Math.min(s1.radius, s2.radius);
      const R = r * ELBOW_RATIO;
      elbowR.set(n.key, R);
      const c = new Vector3(n.x, y, n.z).addScaledVector(d1, R).addScaledVector(d2, R);
      const xAxis = d2.clone().negate();
      const yAxis = d1.clone().negate();
      const zAxis = new Vector3().crossVectors(xAxis, yAxis);
      const basis = new Matrix4().makeBasis(xAxis, yAxis, zAxis);
      const m = new Matrix4().compose(c, new Quaternion().setFromRotationMatrix(basis), new Vector3(r, r, r));
      out.elbows.push(m);
    } else {
      kind.set(n.key, 'coupling');
    }
  }

  const flange = (p: Vector3, dir: Vector3, r: number) => {
    const q = new Quaternion().setFromUnitVectors(UP, dir);
    out.flanges.push(new Matrix4().compose(p, q, new Vector3(r * 1.3, 0.14, r * 1.3)));
  };

  for (const s of net.segments) {
    const ka = key(s.a[0], s.a[1]);
    const kb = key(s.b[0], s.b[1]);
    const na = nodeByKey.get(ka)!;
    const nb = nodeByKey.get(kb)!;
    const start = new Vector3(s.a[0], y, s.a[1]);
    const end = new Vector3(s.b[0], y, s.b[1]);
    const dir = end.clone().sub(start).normalize();
    const kA = kind.get(ka);
    const kB = kind.get(kb);
    if (kA === 'elbow') start.addScaledVector(dir, elbowR.get(ka)!);
    if (kB === 'elbow') end.addScaledVector(dir, -elbowR.get(kb)!);
    if (kA === 'boundary') start.addScaledVector(dir, -0.03);
    if (kB === 'boundary') end.addScaledVector(dir, 0.03);
    const len = start.distanceTo(end);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const q = new Quaternion().setFromUnitVectors(UP, dir);
    out.pipes.push({
      matrix: new Matrix4().compose(mid, q, new Vector3(s.radius, len, s.radius)),
      seg: s.index,
      flow: s.flowDir,
      flowIso: s.flowDirIso,
      reroute: s.reroute ? 1 : 0,
      start: start.clone(),
      end: end.clone(),
      radius: s.radius,
    });
    // flanges at fittings + periodic couplings
    const hubOffset = (r: number) => r * 1.42 * 0.92;
    if (kA === 'hub') flange(new Vector3(na.x, y, na.z).addScaledVector(dir, hubOffset(s.radius)), dir, s.radius);
    else if (kA !== 'boundary') flange(start, dir, s.radius);
    if (kB === 'hub') flange(new Vector3(nb.x, y, nb.z).addScaledVector(dir, -hubOffset(s.radius)), dir, s.radius);
    else if (kB !== 'boundary') flange(end, dir, s.radius);
    const joints = Math.floor(len / 8);
    for (let j = 1; j <= joints; j++) {
      const t = j / (joints + 1);
      flange(start.clone().lerp(end, t), dir, s.radius * 0.92);
    }
  }

  for (const r of net.risers) {
    const h = r.y1 - r.y0;
    out.risers.push(new Matrix4().compose(new Vector3(r.x, r.y0 + h / 2, r.z), new Quaternion(), new Vector3(r.radius, h, r.radius)));
  }
  return out;
}
