import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Color, MeshStandardMaterial, Object3D, SRGBColorSpace, type InstancedMesh } from 'three';
import { LabelSprite } from '../three/LabelSprite';
import { bayStatus, cityKpis, facilityKpis, FACILITIES, opportunities, stageAt, type BayStatus, type Facility } from './model';
import { opsFrom, usePark } from './store';
import { announce } from './audio';
import { ParknexCars } from './ParknexCars';

/**
 * PARKNEX in the 3D city: every bay coloured by its simulated status, barriers, ANPR posts, availability boards,
 * the PARKNEX sign at Central, cars driving in and out, development sites and construction progress.
 * Bays and equipment are instanced; status colours update only when the state changes.
 */
export const STATUS_COLOR: Record<BayStatus, string> = { available: '#22c55e', occupied: '#ef4444', reserved: '#3b82f6', maintenance: '#eab308', charging: '#a855f7', restricted: '#6b7280' };
const tmp = new Object3D();
const col = new Color();

function boardTexture(lines: string[], accent = '#22c55e') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b1220';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = accent;
  g.lineWidth = 8;
  g.strokeRect(6, 6, 500, 244);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = 'bold 64px sans-serif';
  g.fillText(lines[0], 256, 92);
  g.font = '30px sans-serif';
  g.fillStyle = '#a5f3fc';
  lines.slice(1).forEach((l, i) => g.fillText(l, 256, 150 + i * 44));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function Bays() {
  const ref = useRef<InstancedMesh>(null);
  const bays = useMemo(() => FACILITIES.flatMap((f) => f.bays.map((b) => ({ b, f }))), []);
  const ops = usePark((s) => s.ops);
  const maint = usePark((s) => s.maint);
  const event = usePark((s) => s.event);
  const sel = usePark((s) => s.bay);
  const selectBay = usePark((s) => s.selectBay);
  const selectFacility = usePark((s) => s.selectFacility);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    bays.forEach(({ b }, i) => {
      tmp.position.set(b.x, 0.025, b.z);
      tmp.rotation.set(0, b.alongX ? 0 : Math.PI / 2, 0);
      tmp.scale.set(0.22, 0.02, 0.46);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [bays]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = opsFrom({ ops, maint, event });
    const extra: Record<string, number> = {};
    for (const f of FACILITIES) extra[f.id] = (o.eventVehicles[f.id] ?? 0) / Math.max(1, f.bays.length * f.floors);
    bays.forEach(({ b, f }, i) => m.setColorAt(i, col.set(b.id === sel ? '#ffffff' : STATUS_COLOR[bayStatus(b, f, o, extra[f.id])])));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [bays, ops, maint, event, sel]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, bays.length]}
      onClick={(e) => {
        if (e.instanceId === undefined || e.delta > 4) return;
        e.stopPropagation();
        const { b } = bays[e.instanceId];
        selectFacility(b.facility);
        selectBay(b.id);
        usePark.getState().setOpen(true);
        usePark.getState().setTab('occupancy');
      }}
    >
      <boxGeometry />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
    </instancedMesh>
  );
}

/** barriers, ANPR posts, pay stations and a board per facility */
function Equipment() {
  const posts = useRef<InstancedMesh>(null);
  const arms = useRef<InstancedMesh>(null);
  const items = useMemo(() => {
    const p: { x: number; z: number; h: number; s: number }[] = [];
    const a: { x: number; z: number; ry: number }[] = [];
    for (const f of FACILITIES) {
      const e = f.entrance;
      // tangent along the entrance edge; entry lane on one side, exit lane on the other
      const tx = -e.nz;
      const tz = e.nx;
      for (const side of [-1, 1]) {
        const lx = e.x + tx * side * 0.35 - e.nx * 0.15;
        const lz = e.z + tz * side * 0.35 - e.nz * 0.15;
        p.push({ x: lx + tx * side * 0.32, z: lz + tz * side * 0.32, h: 0.12, s: 0.07 }); // barrier cabinet
        a.push({ x: lx, z: lz, ry: Math.atan2(tx, tz) });
        p.push({ x: lx + tx * side * 0.42 + e.nx * 0.2, z: lz + tz * side * 0.42 + e.nz * 0.2, h: 0.6, s: 0.03 }); // ANPR pole
        p.push({ x: lx + tx * side * 0.32 - e.nx * 0.35, z: lz + tz * side * 0.32 - e.nz * 0.35, h: 0.16, s: 0.07 }); // pay station
      }
    }
    return { p, a };
  }, []);
  useLayoutEffect(() => {
    items.p.forEach((q, i) => {
      tmp.position.set(q.x, q.h / 2, q.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(q.s, q.h, q.s);
      tmp.updateMatrix();
      posts.current?.setMatrixAt(i, tmp.matrix);
    });
    items.a.forEach((q, i) => {
      tmp.position.set(q.x, 0.11, q.z);
      tmp.rotation.set(0, q.ry, 0);
      tmp.scale.set(0.02, 0.02, 0.6);
      tmp.updateMatrix();
      arms.current?.setMatrixAt(i, tmp.matrix);
    });
    for (const m of [posts.current, arms.current]) if (m) (m.instanceMatrix.needsUpdate = true), m.computeBoundingSphere();
  }, [items]);
  return (
    <group>
      <instancedMesh ref={posts} args={[undefined, undefined, items.p.length]} raycast={() => {}}>
        <boxGeometry />
        <meshStandardMaterial color="#2b3440" roughness={0.5} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={arms} args={[undefined, undefined, items.a.length]} raycast={() => {}}>
        <boxGeometry />
        <meshStandardMaterial color="#f5f5f5" emissive="#ef4444" emissiveIntensity={0.3} />
      </instancedMesh>
    </group>
  );
}

function Board({ f }: { f: Facility }) {
  const ops = usePark((s) => s.ops);
  const maint = usePark((s) => s.maint);
  const event = usePark((s) => s.event);
  const k = facilityKpis(f, opsFrom({ ops, maint, event }));
  const isCentral = f.id === 'central';
  const mat = useMemo(() => new MeshStandardMaterial({ roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.35 }), []);
  useEffect(() => {
    const old = mat.map;
    mat.map = boardTexture(isCentral ? ['PARKNEX', 'Intelligent Parking & Urban Mobility', `${k.available} spaces free`] : [`${k.available} FREE`, f.name.replace('PARKNEX ', ''), `${Math.round(k.occupancy * 100)} % full`], k.available > 0 ? '#22c55e' : '#ef4444');
    mat.needsUpdate = true;
    old?.dispose();
  }, [mat, k.available, k.occupancy, isCentral, f.name]);
  useEffect(() => () => (mat.map?.dispose(), mat.dispose()), [mat]);
  const e = f.entrance;
  const x = e.x + e.nz * 1.6 + e.nx * 0.3;
  const z = e.z - e.nx * 1.6 + e.nz * 0.3;
  const W = isCentral ? 3.4 : 2.2;
  const selectFacility = usePark((st) => st.selectFacility);
  return (
    <group
      position={[x, 0, z]}
      rotation={[0, Math.atan2(e.nx, e.nz), 0]}
      onClick={(e) => {
        e.stopPropagation();
        selectFacility(f.id);
        usePark.getState().setOpen(true);
        usePark.getState().setTab('facilities');
      }}
    >
      <mesh position={[-W / 2 + 0.05, (isCentral ? 1.6 : 0.9) / 2, 0]} raycast={() => {}}>
        <boxGeometry args={[0.06, isCentral ? 1.6 : 0.9, 0.06]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[W / 2 - 0.05, (isCentral ? 1.6 : 0.9) / 2, 0]} raycast={() => {}}>
        <boxGeometry args={[0.06, isCentral ? 1.6 : 0.9, 0.06]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0, isCentral ? 1.6 : 0.9, 0]} material={mat}>
        <boxGeometry args={[W, W / 2, 0.06]} />
      </mesh>
      <LabelSprite text={`${f.name} · ${k.available} free`} position={[0, (isCentral ? 1.6 : 0.9) + W / 4 + 0.5, 0]} border={k.available > 0 ? '#22c55e' : '#ef4444'} scale={1.2} />
    </group>
  );
}

/** development sites (when the Development tabs are open) and construction progress of approved proposals */
function Development() {
  const tab = usePark((s) => s.tab);
  const proposals = usePark((s) => s.proposals);
  const selectedOpp = usePark((s) => s.selectedOpp);
  const opps = useMemo(() => (tab === 'development' || tab === 'roi' ? opportunities().slice(0, 6) : []), [tab]);
  return (
    <group>
      {opps.map((o) => (
        <group key={o.id}>
          <mesh position={[o.site.x, 0.03, o.site.z]} raycast={() => {}}>
            <boxGeometry args={[o.site.w, 0.02, o.site.d]} />
            <meshBasicMaterial color={o.id === selectedOpp ? '#f59e0b' : '#facc15'} transparent opacity={o.id === selectedOpp ? 0.55 : 0.3} depthWrite={false} />
          </mesh>
          <LabelSprite text={`${o.district} · score ${o.score}`} position={[o.site.x, 1.4, o.site.z]} border="#facc15" />
        </group>
      ))}
      {proposals
        .filter((p) => p.status === 'Under construction' || p.status === 'Operational')
        .map((p) => {
          const h = p.progress;
          const color = h < 0.25 ? '#8b6b4a' : h < 0.5 ? '#9ca3af' : h < 0.75 ? '#374151' : '#1f2937';
          return (
            <group key={p.id}>
              <mesh position={[p.x, 0.02 + h * 0.02, p.z]} raycast={() => {}}>
                <boxGeometry args={[p.w * Math.max(0.3, Math.min(1, h * 1.4)), 0.03, p.d * Math.max(0.3, Math.min(1, h * 1.4))]} />
                <meshStandardMaterial color={color} />
              </mesh>
              {h >= 0.5 &&
                Array.from({ length: Math.floor((p.w - 1) / 0.25) }, (_, i) => (
                  <mesh key={i} position={[p.x - p.w / 2 + 0.6 + i * 0.25, 0.045, p.z - p.d / 4]} raycast={() => {}}>
                    <boxGeometry args={[0.02, 0.005, 0.46]} />
                    <meshBasicMaterial color="#f8fafc" />
                  </mesh>
                ))}
              <LabelSprite text={`${p.status === 'Operational' ? 'PARKNEX · operational' : `Construction ${Math.round(h * 100)} % · ${stageAt(h)}`}`} position={[p.x, 1.6, p.z]} border={p.status === 'Operational' ? '#22c55e' : '#f59e0b'} />
            </group>
          );
        })}
    </group>
  );
}

/** advances the simulated clock while playing and announces entries/exits (if audio is on) */
function Clock() {
  const acc = useRef(0);
  useFrame((_, dt) => {
    const s = usePark.getState();
    if (s.playing) {
      // one simulated hour every 12 seconds
      const h = (s.ops.hour + dt / 12) % 24;
      s.setOps({ hour: Math.round(h * 100) / 100 });
    }
    // construction advances while anything is under construction (one stage every ~6 s)
    for (const p of s.proposals)
      if (p.status === 'Under construction') {
        const progress = Math.min(1, p.progress + dt / 24);
        s.upsertProposal({ ...p, progress, status: progress >= 1 ? 'Operational' : p.status, history: progress >= 1 ? [...p.history, { status: 'Operational', note: 'Construction complete (simulated).', seq: p.history.length + 1 }] : p.history });
        if (progress >= 1) announce('New PARKNEX facility is now operational.');
      }
    acc.current += dt;
    if (s.playing && s.audio && acc.current > 20) {
      acc.current = 0;
      const k = cityKpis(opsFrom(s));
      const best = [...k.per].sort((a, b) => b.available - a.available)[0];
      announce(`Parking available. ${best.available} spaces at ${best.name}.`);
    }
  });
  return null;
}

/** upper decks of multistorey facilities: a slab per floor on columns, so capacity × floors is visible */
function Decks() {
  const ref = useRef<InstancedMesh>(null);
  const parts = useMemo(() => {
    const out: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[] = [];
    for (const f of FACILITIES) {
      if (f.floors < 2) continue;
      const s = f.site;
      for (let k = 1; k < f.floors; k++) {
        out.push({ x: s.x, y: k * 0.32, z: s.z, sx: s.w - 0.2, sy: 0.04, sz: s.d - 0.2 });
        for (const cx of [-0.42, 0, 0.42]) for (const cz of [-0.42, 0.42]) out.push({ x: s.x + cx * s.w, y: k * 0.32 - 0.16, z: s.z + cz * s.d, sx: 0.08, sy: 0.32, sz: 0.08 });
      }
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    parts.forEach((p, i) => {
      tmp.position.set(p.x, p.y, p.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(p.sx, p.sy, p.sz);
      tmp.updateMatrix();
      ref.current?.setMatrixAt(i, tmp.matrix);
    });
    if (ref.current) (ref.current.instanceMatrix.needsUpdate = true), ref.current.computeBoundingSphere();
  }, [parts]);
  if (!parts.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, parts.length]} castShadow receiveShadow raycast={() => {}}>
      <boxGeometry />
      <meshStandardMaterial color="#c9c4b8" roughness={0.85} transparent opacity={0.55} />
    </instancedMesh>
  );
}

/** asphalt access drive from each entrance to the kerb, with a lane divider */
function Drives() {
  return (
    <group>
      {FACILITIES.map((f) => {
        const e = f.entrance;
        const len = Math.hypot(e.roadX - e.x, e.roadZ - e.z) + 0.3;
        const cx = (e.x + e.roadX) / 2;
        const cz = (e.z + e.roadZ) / 2;
        const ry = Math.atan2(e.nx, e.nz);
        return (
          <group key={f.id} position={[cx, 0, cz]} rotation={[0, ry, 0]}>
            <mesh position={[0, 0.012, 0]} receiveShadow raycast={() => {}}>
              <boxGeometry args={[1.2, 0.02, len]} />
              <meshStandardMaterial color="#2f3338" roughness={0.95} />
            </mesh>
            <mesh position={[0, 0.024, 0]} raycast={() => {}}>
              <boxGeometry args={[0.03, 0.005, len * 0.9]} />
              <meshBasicMaterial color="#f5d90a" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function ParknexScene() {
  const open = usePark((s) => s.open);
  return (
    <group>
      <Bays />
      <Equipment />
      {FACILITIES.map((f) => (
        <Board key={f.id} f={f} />
      ))}
      <ParknexCars />
      <Drives />
      <Decks />
      {open && <Development />}
      <Clock />
    </group>
  );
}
