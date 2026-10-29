import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { AD, type AdRoad } from '../data/abudhabi';
import { kerbDistance } from '../data/spatial';
import { DECK_Y, isElevated } from './AbuDhabiTraffic';

/**
 * Raised roads (the Al Sajaa Interchange flyover, and any flyover, loop or ramp): a deck that follows the road's
 * height profile (AdRoad.y, else DECK_Y), the road's width plus shoulders, with a concrete slab, parapet walls,
 * painted edge lines and dashed lane lines, and a central column with a hammerhead cap about every 3 units
 * wherever the deck is high enough to need one. No column stands on a carriageway below: a column that would
 * is moved along the deck to clear ground, or left out. elevatedLayout() is pure and tested.
 */

type XZ = [number, number];
const SLAB = 0.07;          // deck slab depth below the road surface
const SHOULDER = 0.15;      // deck beyond the carriageway on each side
const PARAPET_H = 0.09;
const PARAPET_W = 0.04;
const PIER_EVERY = 3.0;
const PIER_MIN_Y = 0.3;     // lower than this the ramp sits on fill, not on columns
const MIN_Y = 0.012;        // a hair above the ground where a ramp lands

export interface Pier {
  x: number;
  z: number;
  /** top of the column (underside of the slab) */
  top: number;
  /** heading of the road there, for the hammerhead cap */
  yaw: number;
  /** half width of the deck there */
  hw: number;
}

const heights = (r: AdRoad) => r.y ?? r.p.map(() => DECK_Y);

function frame(pts: XZ[]) {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    return { nx: -dz / L, nz: dx / L, tx: dx / L, tz: dz / L };
  });
}

/** quads between two offset lines along the road: (offset, height above the surface) at each end of every segment */
function strip(out: number[], pts: XZ[], ys: number[], a: [number, number], b: [number, number]) {
  const f = frame(pts);
  for (let i = 0; i < pts.length - 1; i++) {
    const P = (j: number, off: number, dy: number) => [pts[j][0] + f[j].nx * off, Math.max(MIN_Y, ys[j]) + dy, pts[j][1] + f[j].nz * off];
    const p1 = P(i, a[0], a[1]);
    const p2 = P(i, b[0], b[1]);
    const p3 = P(i + 1, a[0], a[1]);
    const p4 = P(i + 1, b[0], b[1]);
    out.push(...p1, ...p2, ...p3, ...p2, ...p4, ...p3);
  }
}

export function elevatedLayout(roads: AdRoad[] = AD.roads) {
  const top: number[] = [];
  const sides: number[] = [];
  const lines: number[] = [];
  const piers: Pier[] = [];
  const dashes: { x: number; y: number; z: number; yaw: number }[] = [];
  for (const r of roads) {
    if (!isElevated(r)) continue;
    const pts = r.p as XZ[];
    const ys = heights(r);
    const hw = r.w / 2 + SHOULDER;
    // road surface
    strip(top, pts, ys, [-hw, 0], [hw, 0]);
    // slab edges and underside
    strip(sides, pts, ys, [hw, 0], [hw, -SLAB]);
    strip(sides, pts, ys, [-hw, -SLAB], [-hw, 0]);
    strip(sides, pts, ys, [hw, -SLAB], [-hw, -SLAB]);
    // parapets: inner face, top, outer face on each side
    for (const s of [-1, 1]) {
      const e = s * hw;
      const i = s * (hw - PARAPET_W);
      strip(sides, pts, ys, [i, 0], [i, PARAPET_H]);
      strip(sides, pts, ys, [i, PARAPET_H], [e, PARAPET_H]);
      strip(sides, pts, ys, [e, PARAPET_H], [e, 0]);
    }
    // edge lines just above the surface
    const lw = 0.03;
    strip(lines, pts, ys, [r.w / 2 - lw, 0.003], [r.w / 2, 0.003]);
    strip(lines, pts, ys, [-r.w / 2, 0.003], [-r.w / 2 + lw, 0.003]);
    // dashed lane lines between the lanes
    const lanes = r.l ?? Math.max(1, Math.round((r.w * 10) / 3.6));
    const f = frame(pts);
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      for (let s = (0.8 - (acc % 0.8)) % 0.8; s < L; s += 0.8) {
        const u = s / L;
        const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u;
        const z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u;
        const y = Math.max(MIN_Y, ys[i] + (ys[i + 1] - ys[i]) * u) + 0.004;
        for (let k = 1; k < lanes; k++) {
          const off = -r.w / 2 + (r.w * k) / lanes;
          dashes.push({ x: x + f[i].nx * off, y, z: z + f[i].nz * off, yaw: Math.atan2(f[i].tx, f[i].tz) });
        }
      }
      acc += L;
    }
    // columns: every PIER_EVERY along the road where it is high enough, never on a carriageway below
    let next = PIER_EVERY / 2;
    acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      while (next <= acc + L) {
        for (const shift of [0, 0.5, -0.5, 1.0, -1.0]) {
          const s = Math.min(L, Math.max(0, next - acc + shift));
          const u = L ? s / L : 0;
          const x = ax + (bx - ax) * u;
          const z = az + (bz - az) * u;
          const y = ys[i] + (ys[i + 1] - ys[i]) * u;
          if (y < PIER_MIN_Y) break;
          if (kerbDistance(x, z) < 0.35) continue; // a road passes underneath here
          piers.push({ x, z, top: y - SLAB, yaw: Math.atan2(bx - ax, bz - az), hw });
          break;
        }
        next += PIER_EVERY;
      }
      acc += L;
    }
  }
  return { top, sides, lines, piers, dashes };
}

function geometryOf(pos: number[]) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function Instanced({ geometry, material, mats }: { geometry: BufferGeometry; material: MeshStandardMaterial; mats: Matrix4[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    mats.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [mats]);
  if (!mats.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, mats.length]} castShadow receiveShadow />;
}

export function ElevatedRoads() {
  const layout = useMemo(() => elevatedLayout(), []);
  const geos = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    return { top: geometryOf(layout.top), sides: geometryOf(layout.sides), lines: geometryOf(layout.lines), box };
  }, [layout]);
  const mats = useMemo(
    () => ({
      asphalt: new MeshStandardMaterial({ color: '#2c2e33', roughness: 0.9, side: 2 }),
      concrete: new MeshStandardMaterial({ color: '#c9c3b6', roughness: 0.85, side: 2 }),
      lines: new MeshStandardMaterial({ color: '#e9e6dc', roughness: 0.6, side: 2, polygonOffset: true, polygonOffsetFactor: -2 }),
      pier: new MeshStandardMaterial({ color: '#bdb6a8', roughness: 0.9 }),
    }),
    [],
  );
  const inst = useMemo(() => {
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const columns: Matrix4[] = [];
    const caps: Matrix4[] = [];
    for (const p of layout.piers) {
      q.setFromAxisAngle(up, p.yaw);
      columns.push(new Matrix4().compose(new Vector3(p.x, 0, p.z), q, new Vector3(0.3, Math.max(0.01, p.top - 0.08), 0.5)));
      caps.push(new Matrix4().compose(new Vector3(p.x, p.top - 0.08, p.z), q, new Vector3(p.hw * 1.7, 0.08, 0.42)));
    }
    const dashes = layout.dashes.map((d) => new Matrix4().compose(new Vector3(d.x, d.y, d.z), q.setFromAxisAngle(up, d.yaw).clone(), new Vector3(0.025, 0.002, 0.32)));
    return { columns, caps, dashes };
  }, [layout]);
  if (!layout.top.length) return null;
  return (
    <group>
      <mesh geometry={geos.top} material={mats.asphalt} receiveShadow castShadow />
      <mesh geometry={geos.sides} material={mats.concrete} receiveShadow castShadow />
      <mesh geometry={geos.lines} material={mats.lines} />
      <Instanced geometry={geos.box} material={mats.pier} mats={inst.columns} />
      <Instanced geometry={geos.box} material={mats.pier} mats={inst.caps} />
      <Instanced geometry={geos.box} material={mats.lines} mats={inst.dashes} />
    </group>
  );
}
