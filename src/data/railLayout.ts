import LAYOUT from './rail-layout.json';
import { AD, type XZ } from './abudhabi';

/**
 * Etihad Rail double track (src/data/rail-layout.json): where each track runs across the line, and the rail
 * envelope (tracks plus ballast) that roads, lamps, parked cars and trees keep out of. The line runs along x, so
 * the station zones are x ranges; between them each track sits 0.225 from the centre, and over `blend` units
 * either side of a station it eases out to its station offset around the island platform. Shared by the track
 * and trains (RailTrain.tsx), the lamps, the streetscape and the tests; scripts/world_lib.py mirrors it.
 */
export const RAIL_LAYOUT = LAYOUT;
export type TrackId = 'westbound' | 'eastbound';

const smooth = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/** 0 away from stations, 1 alongside a platform, easing in over `blend` */
export function stationWeight(x: number) {
  let w = 0;
  for (const s of LAYOUT.stations) {
    const d = x < s.x0 ? s.x0 - x : x > s.x1 ? x - s.x1 : 0;
    w = Math.max(w, 1 - smooth(d / LAYOUT.blend));
  }
  return w;
}

export function trackOffset(id: TrackId, x: number) {
  const t = LAYOUT.tracks.find((q) => q.id === id)!;
  return t.offset + (t.stationOffset - t.offset) * stationWeight(x);
}

/** the baseline rail centre line (track ends trimmed by the corrections) */
export function railCentre(): XZ[] {
  const r = AD.roads.find((q) => q.c === 'rail');
  return r ? (r.p as XZ[]) : [];
}

/** a track's own polyline: the centre line offset across it, sampled finely so the station spread is smooth */
export function trackPath(id: TrackId, step = 0.5): XZ[] {
  const c = railCentre();
  const out: XZ[] = [];
  for (let i = 1; i < c.length; i++) {
    const [ax, az] = c[i - 1];
    const [bx, bz] = c[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-9) continue;
    const nx = -(bz - az) / L;
    const nz = (bx - ax) / L;
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const z = az + ((bz - az) * k) / n;
      const o = trackOffset(id, x);
      out.push([x + nx * o, z + nz * o]);
    }
  }
  return out;
}

/** across-line extent of the rail envelope at x: [north edge, south edge] as offsets from the centre */
export function envelopeAt(x: number): [number, number] {
  return [trackOffset('westbound', x) - LAYOUT.ballast, trackOffset('eastbound', x) + LAYOUT.ballast];
}

/** true when (x, z) lies inside the rail envelope, widened by margin (the line runs along x at the centre's z) */
export function inRailEnvelope(x: number, z: number, margin = 0) {
  const c = railCentre();
  if (c.length < 2 || x < c[0][0] - margin || x > c[c.length - 1][0] + margin) return false;
  // the centre line is straight along x here; find its z at x
  let cz = c[0][1];
  for (let i = 1; i < c.length; i++) if (x <= c[i][0]) {
    const t = (x - c[i - 1][0]) / (c[i][0] - c[i - 1][0] || 1);
    cz = c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t;
    break;
  }
  const [n, s] = envelopeAt(x);
  return z > cz + n - margin && z < cz + s + margin;
}
