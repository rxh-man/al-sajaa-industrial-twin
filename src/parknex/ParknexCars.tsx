import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Color, InstancedBufferAttribute, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { vehicleGeometry, vehicleProxyGeometry, type VehicleKind } from '../three/vehicles/vehicleModels';
import { createStateAttribute, createVehicleMaterial } from '../three/vehicles/vehicleMaterial';
import { PARKED_SCALE } from '../data/streetscape';
import { bayStatus, FACILITIES, type Bay, type Facility } from './model';
import { opsFrom, usePark } from './store';

/**
 * PARKNEX vehicles with the city's real car models:
 *  - a parked car on every bay the model says is occupied or charging (re-evaluated when the state changes),
 *    full model near the camera and a light proxy further out;
 *  - arriving and leaving cars per facility: road → access drive → entrance barrier → aisle → bay, park, then
 *    back out the same way. Their bays are left empty in the parked set so cars never overlap.
 */
const UP = new Vector3(0, 1, 0);
const PAINT = ['#f1f2f4', '#e6e7ea', '#c9ccd1', '#9aa0a8', '#2a2d32', '#121316', '#1d2f55', '#6e1a20', '#b5a68d', '#3b5878'].map((c) => new Color(c));
const KIND_FOR: Record<string, VehicleKind[]> = {
  visitor: ['sedan', 'suv', 'crossover', 'hatch', 'pickup', 'largeSuv'],
  tenant: ['sedan', 'suv', 'largeSuv', 'crossover'],
  premium: ['luxurySedan', 'sportsGt', 'largeSuv', 'supercar'],
  ev: ['evSedan'],
  accessible: ['suv', 'van'],
  event: ['sedan', 'suv', 'crossover', 'pickup'],
  restricted: ['serviceVan'],
};
const KINDS = [...new Set(Object.values(KIND_FOR).flat())];
const LOD_NEAR = 26;

function instanced(base: BufferGeometry, count: number) {
  const g = new BufferGeometry();
  for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.getAttribute(name));
  g.setAttribute('aState', createStateAttribute(count) as InstancedBufferAttribute);
  g.boundingSphere = base.boundingSphere;
  return g;
}

const hashS = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};
/** heading of a car parked nose-in: rows alternate facing; yaw so the car's +z points into the bay */
const bayYaw = (b: Bay) => (b.alongX ? (b.row % 2 === 0 ? Math.PI : 0) : b.row % 2 === 0 ? -Math.PI / 2 : Math.PI / 2);
const kindOf = (b: Bay): VehicleKind => {
  const list = KIND_FOR[b.category];
  return list[Math.floor(hashS(b.id) * list.length)];
};

/** a route for one moving car: road → drive → entrance → inside → aisle → bay */
function routeFor(f: Facility, b: Bay): [number, number][] {
  const e = f.entrance;
  const inside: [number, number] = [e.x - e.nx * 0.6, e.z - e.nz * 0.6];
  // aisle point: in front of the bay, toward the lot centre
  const toC = b.alongX ? Math.sign(f.site.z - b.z) || 1 : Math.sign(f.site.x - b.x) || 1;
  const aisle: [number, number] = b.alongX ? [b.x, b.z + toC * 0.5] : [b.x + toC * 0.5, b.z];
  const turn: [number, number] = b.alongX ? [inside[0], aisle[1]] : [aisle[0], inside[1]];
  return [[e.roadX, e.roadZ], [e.x + e.nx * 0.05, e.z + e.nz * 0.05], inside, turn, aisle, [b.x, b.z]];
}

function samplePath(pts: [number, number][], u: number) {
  const seg: number[] = [];
  let L = 0;
  for (let i = 1; i < pts.length; i++) seg.push((L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])));
  const d = u * L;
  let i = seg.findIndex((s) => s >= d);
  if (i < 0) i = seg.length - 1;
  const s0 = i === 0 ? 0 : seg[i - 1];
  const t = (d - s0) / Math.max(1e-6, seg[i] - s0);
  const [ax, az] = pts[i];
  const [bx, bz] = pts[i + 1];
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, yaw: Math.atan2(bx - ax, bz - az) };
}

export function ParknexCars() {
  const material = useMemo(() => createVehicleMaterial('#22c55e'), []);
  const ops = usePark((s) => s.ops);
  const maint = usePark((s) => s.maint);
  const event = usePark((s) => s.event);
  const playing = usePark((s) => s.playing);
  // movers: three per facility, on fixed visitor bays (excluded from the parked set)
  const movers = useMemo(
    () =>
      FACILITIES.flatMap((f) =>
        f.bays
          .filter((b) => b.category === 'visitor' || b.category === 'event' || b.category === 'premium')
          .filter((_, i) => i % 41 === 7)
          .slice(0, 3)
          .map((b, i) => ({ f, b, kind: kindOf(b), route: routeFor(f, b), ph: (i * 0.33 + f.id.length * 0.07) % 1, paint: PAINT[Math.floor(hashS(b.id + 'm') * PAINT.length)] })),
      ),
    [],
  );
  const moverBays = useMemo(() => new Set(movers.map((m) => m.b.id)), [movers]);
  const parked = useMemo(() => {
    const o = opsFrom({ ops, maint, event });
    const out: { b: Bay; kind: VehicleKind; m: Matrix4; c: Color }[] = [];
    const q = new Quaternion();
    const s = new Vector3(PARKED_SCALE, PARKED_SCALE, PARKED_SCALE);
    for (const f of FACILITIES) {
      const extra = (o.eventVehicles[f.id] ?? 0) / Math.max(1, f.bays.length * f.floors);
      for (const b of f.bays) {
        if (moverBays.has(b.id)) continue;
        const st = bayStatus(b, f, o, extra);
        if (st !== 'occupied' && st !== 'charging') continue;
        out.push({ b, kind: kindOf(b), m: new Matrix4().compose(new Vector3(b.x, 0.03, b.z), q.setFromAxisAngle(UP, bayYaw(b)), s), c: PAINT[Math.floor(hashS(b.id) * PAINT.length)] });
      }
    }
    return out;
    // quarter-hour resolution is what bayStatus uses
  }, [Math.floor(ops.hour * 4), ops.tariffMul, ops.eventVehicles, ops.released, maint, event, moverBays]); // eslint-disable-line react-hooks/exhaustive-deps
  const byKind = useMemo(() => KINDS.map((k) => parked.filter((p) => p.kind === k)), [parked]);
  const geos = useMemo(() => KINDS.map((k) => ({ full: instanced(vehicleGeometry(k), 400), far: instanced(vehicleProxyGeometry(k), 400) })), []);
  const full = useRef<(InstancedMesh | null)[]>([]);
  const far = useRef<(InstancedMesh | null)[]>([]);
  const last = useRef({ x: Infinity, y: Infinity, z: Infinity, list: null as unknown });
  const moving = useRef<(InstancedMesh | null)[]>([]);
  const moverKinds = useMemo(() => [...new Set(movers.map((m) => m.kind))], [movers]);
  const moverGeos = useMemo(() => moverKinds.map((k) => instanced(vehicleGeometry(k), movers.length)), [moverKinds, movers.length]);

  useEffect(() => () => {
    material.dispose();
    for (const g of [...geos.flatMap((x) => [x.full, x.far]), ...moverGeos]) g.dispose();
  }, [material, geos, moverGeos]);

  useFrame(({ camera, clock }) => {
    // parked: split full/proxy by distance when the camera moved or the set changed
    const cp = camera.position;
    const L = last.current;
    if (L.list !== parked || Math.abs(cp.x - L.x) + Math.abs(cp.y - L.y) + Math.abs(cp.z - L.z) > 1) {
      L.x = cp.x;
      L.y = cp.y;
      L.z = cp.z;
      L.list = parked;
      const near2 = LOD_NEAR * LOD_NEAR;
      byKind.forEach((list, k) => {
        const fm = full.current[k];
        const pm = far.current[k];
        if (!fm || !pm) return;
        let a = 0;
        let b = 0;
        for (const p of list.slice(0, 400)) {
          const d2 = (p.b.x - cp.x) ** 2 + (p.b.z - cp.z) ** 2 + cp.y * cp.y;
          if (d2 < near2) (fm.setMatrixAt(a, p.m), fm.setColorAt(a++, p.c));
          else (pm.setMatrixAt(b, p.m), pm.setColorAt(b++, p.c));
        }
        fm.count = a;
        pm.count = b;
        for (const m of [fm, pm]) {
          m.instanceMatrix.needsUpdate = true;
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
      });
    }
    // movers: 0–0.35 drive in, 0.35–0.65 parked, 0.65–1 back out
    const t = clock.elapsedTime * (playing ? 0.06 : 0.025);
    const q = new Quaternion();
    const s = new Vector3(PARKED_SCALE, PARKED_SCALE, PARKED_SCALE);
    const m = new Matrix4();
    moverKinds.forEach((k, ki) => {
      const mesh = moving.current[ki];
      if (!mesh) return;
      let c = 0;
      for (const mv of movers) {
        if (mv.kind !== k) continue;
        const u = (t + mv.ph) % 1;
        const along = u < 0.35 ? u / 0.35 : u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35;
        const p = samplePath(mv.route, Math.min(0.999, along));
        // forwards in, reversing out (the car keeps facing the bay while it backs out)
        const yaw = u < 0.35 ? p.yaw : u < 0.65 ? bayYaw(mv.b) : p.yaw;
        mesh.setMatrixAt(c, m.compose(new Vector3(p.x, 0.03, p.z), q.setFromAxisAngle(UP, yaw), s));
        mesh.setColorAt(c++, mv.paint);
      }
      mesh.count = c;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  });

  return (
    <group>
      {KINDS.map((k, i) => (
        <group key={k}>
          <instancedMesh ref={(r) => void (full.current[i] = r)} args={[geos[i].full, material, 400]} count={0} frustumCulled={false} raycast={() => {}} castShadow />
          <instancedMesh ref={(r) => void (far.current[i] = r)} args={[geos[i].far, material, 400]} count={0} frustumCulled={false} raycast={() => {}} />
        </group>
      ))}
      {moverKinds.map((k, i) => (
        <instancedMesh key={k} ref={(r) => void (moving.current[i] = r)} args={[moverGeos[i], material, movers.length]} count={0} frustumCulled={false} raycast={() => {}} castShadow />
      ))}
    </group>
  );
}
