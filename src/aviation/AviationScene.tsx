import { useMemo } from 'react';
import * as THREE from 'three';
import { useAviationStore } from './store';
import { FLIGHTS, STANDS, flightTurnaround, scenarioDelayMin, type Flight } from './model';
import { flightBoard, type Weather } from './ops';

/**
 * MRR AVIATION airport district (fictional), a separate slab east of the city diorama.
 * Aircraft, stand status and ground vehicles are driven by the same board and turnaround data the panel shows.
 * Materials and box geometry are cached and shared, so adding the airport does not multiply GPU state.
 * Only mounted while MRR AVIATION is open.
 */
export const AIRPORT_CENTRE = { x: 292, z: -6 } as const;

/** Stand positions relative to AIRPORT_CENTRE. A-row and B-row on the apron, R-row on the regional strip. */
export const STAND_OFFSET: Record<string, { x: number; z: number }> = {
  A1: { x: -18, z: 12 }, A2: { x: -10, z: 12 }, A3: { x: -2, z: 12 }, A4: { x: 6, z: 12 }, A5: { x: 14, z: 12 },
  B1: { x: 22, z: 12 }, B2: { x: 30, z: 12 },
  R1: { x: -6, z: 2 }, R2: { x: 6, z: 2 },
};

export function standWorld(stand: string) {
  const o = STAND_OFFSET[stand];
  return { x: AIRPORT_CENTRE.x + o.x, z: AIRPORT_CENTRE.z + o.z };
}

const C = {
  slab: '#2f4f5e',
  asphalt: '#44505a',
  taxi: '#55616a',
  paint: '#eef2f5',
  terminal: '#d4dde3',
  glass: '#3d6f80',
  tower: '#e6edf1',
  hangar: '#8d9ca5',
  cargo: '#a9b5bc',
  navy: '#0f2a4a',
  teal: '#1aa3a3',
  gold: '#c9a24a',
  fuselage: '#f6f8fa',
  gse: '#f0c040',
  fault: '#e5484d',
  replace: '#1aa3a3',
  beaconOk: '#7ef0e6',
  beaconBad: '#ff5d5d',
};

// ---------- shared, cached GPU state ----------
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, roughness = 0.7, metalness = 0.05): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    matCache.set(key, m);
  }
  return m;
}
const glowCache = new Map<string, THREE.MeshStandardMaterial>();
/** Self-lit material (runway edge lights, window glow, status beacons). Visible without scene lights. */
function glowMat(color: string, intensity = 1.4): THREE.MeshStandardMaterial {
  const key = `${color}|${intensity}`;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, toneMapped: false });
    glowCache.set(key, m);
  }
  return m;
}
const geoCache = new Map<string, THREE.BoxGeometry>();
function boxGeo(s: [number, number, number]): THREE.BoxGeometry {
  const key = s.join(',');
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(s[0], s[1], s[2]);
    geoCache.set(key, g);
  }
  return g;
}

type V3 = [number, number, number];

function Box({ p, s, c, r = [0, 0, 0], shadow = false }: { p: V3; s: V3; c: string; r?: V3; shadow?: boolean }) {
  return (
    <mesh position={p} rotation={r} geometry={boxGeo(s)} material={mat(c)} castShadow={shadow} receiveShadow />
  );
}

function Glow({ p, s, c, intensity }: { p: V3; s: V3; c: string; intensity?: number }) {
  return <mesh position={p} geometry={boxGeo(s)} material={glowMat(c, intensity)} />;
}

// ---------- vehicles and aircraft ----------
export type Equip = 'Baggage tractor' | 'Catering truck' | 'Ground power unit' | 'Fuel bowser' | 'Pushback tractor';
const EQUIP_SLOT: Record<Equip, V3> = {
  'Baggage tractor': [-5.2, 0, 1],
  'Catering truck': [5.4, 0, -1],
  'Ground power unit': [-5.4, 0, -3],
  'Fuel bowser': [5.6, 0, 3],
  'Pushback tractor': [-9.5, 0, 0],
};

function Vehicle({ p, color, kind }: { p: V3; color: string; kind: Equip }) {
  const long = kind === 'Catering truck' || kind === 'Fuel bowser' ? 2.8 : 2.0;
  return (
    <group position={p}>
      <Box p={[0, 0.55, 0]} s={[1.5, 0.9, long]} c={color} shadow />
      <Box p={[0, 1.15, long * 0.25]} s={[1.2, 0.5, 0.9]} c={C.navy} />
    </group>
  );
}

function Aircraft({ x, z, type, status, selected }: { x: number; z: number; type: Flight['type']; status: 'ok' | 'delay'; selected: boolean }) {
  const wide = type === 'Wide-body';
  const regional = type === 'Regional';
  const len = wide ? 10 : regional ? 6.5 : 8;
  const r = wide ? 0.6 : regional ? 0.36 : 0.48;
  const fuse = useMemo(() => new THREE.CylinderGeometry(r, r, len, 14), [r, len]);
  return (
    <group position={[x, 0.35, z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh geometry={fuse} rotation={[0, 0, Math.PI / 2]} position={[0, 0.5, 0]} castShadow material={mat(C.fuselage, 0.4, 0.2)} />
      <Box p={[len * 0.42, 0.9, 0]} s={[1.6, 0.9, 0.12]} c={C.navy} />
      <Box p={[-len * 0.5, 1.5, 0]} s={[0.12, 1.4, 0.5]} c={C.teal} />
      <Box p={[-len * 0.5, 1.1, 0]} s={[0.9, 0.12, 2.6]} c={C.fuselage} />
      <Box p={[0.2, 0.25, 1.9]} s={[1.5, 0.12, 2.6]} c={C.fuselage} r={[0.12, 0, 0]} />
      <Box p={[0.2, 0.25, -1.9]} s={[1.5, 0.12, 2.6]} c={C.fuselage} r={[-0.12, 0, 0]} />
      <mesh position={[0.4, -0.05, 1.1]} rotation={[Math.PI / 2, 0, 0]} material={mat(C.hangar)}>
        <cylinderGeometry args={[0.22, 0.22, 0.9, 10]} />
      </mesh>
      <mesh position={[0.4, -0.05, -1.1]} rotation={[Math.PI / 2, 0, 0]} material={mat(C.hangar)}>
        <cylinderGeometry args={[0.22, 0.22, 0.9, 10]} />
      </mesh>
      <Box p={[0, 1.02, 0]} s={[len * 0.8, 0.05, 0.05]} c={C.gold} />
      {/* status beacon on the tail: teal on plan, red when the turnaround is delayed */}
      <Glow p={[-len * 0.5, 2.2, 0]} s={[0.4, 0.4, 0.4]} c={status === 'ok' ? C.beaconOk : C.beaconBad} intensity={2} />
      {selected && <Glow p={[0, 0.12, 0]} s={[len + 3, 0.04, 7]} c="#ffffff" intensity={0.6} />}
    </group>
  );
}

export function AviationScene() {
  const open = useAviationStore((s) => s.open);
  const selected = useAviationStore((s) => s.selectedFlight);
  const now = useAviationStore((s) => s.clock);
  const weather = useAviationStore((s) => s.weather) as Weather;
  const extraDelay = useAviationStore((s) => s.extraDelay);
  const tractorFailed = useAviationStore((s) => s.baggageTractorFailed);
  const replaced = useAviationStore((s) => s.replacementAssigned);

  const scen = useMemo(() => ({ baggageTractorFailed: tractorFailed, replacementAssigned: replaced }), [tractorFailed, replaced]);
  const scenDelay = scenarioDelayMin(scen);
  const board = useMemo(() => flightBoard(weather, extraDelay, scenDelay, now), [weather, extraDelay, scenDelay, now]);

  // flights physically on a stand at the clock, with their turnaround activities
  const onStand = board.filter((r) => r.arrEst <= now && now < r.depEst);
  // turnaround activities use the same arrival and departure as the board row
  const occupied = new Map(onStand.map((r) => [r.stand, r]));

  return (
    <group name="mrr-aviation" visible={open}>
      {/* slab and runway */}
      <Box p={[AIRPORT_CENTRE.x, -0.4, AIRPORT_CENTRE.z]} s={[124, 0.8, 84]} c={C.slab} />
      <Box p={[AIRPORT_CENTRE.x, 0.02, AIRPORT_CENTRE.z - 26]} s={[100, 0.1, 4.2]} c={C.asphalt} />
      {Array.from({ length: 20 }, (_, i) => (
        <Box key={`rw${i}`} p={[AIRPORT_CENTRE.x - 47 + i * 5, 0.08, AIRPORT_CENTRE.z - 26]} s={[2.4, 0.04, 0.3]} c={C.paint} />
      ))}
      {Array.from({ length: 25 }, (_, i) => (
        <Glow key={`el${i}`} p={[AIRPORT_CENTRE.x - 48 + i * 4, 0.12, AIRPORT_CENTRE.z - 28.3]} s={[0.5, 0.1, 0.5]} c={C.gold} intensity={1.6} />
      ))}
      {Array.from({ length: 25 }, (_, i) => (
        <Glow key={`er${i}`} p={[AIRPORT_CENTRE.x - 48 + i * 4, 0.12, AIRPORT_CENTRE.z - 23.7]} s={[0.5, 0.1, 0.5]} c={C.gold} intensity={1.6} />
      ))}
      {/* taxiway and apron */}
      <Box p={[AIRPORT_CENTRE.x, 0.02, AIRPORT_CENTRE.z - 14]} s={[100, 0.1, 1.6]} c={C.taxi} />
      <Box p={[AIRPORT_CENTRE.x + 6, 0.02, AIRPORT_CENTRE.z + 12]} s={[62, 0.1, 10]} c={C.taxi} />
      <Box p={[AIRPORT_CENTRE.x, 0.02, AIRPORT_CENTRE.z + 2]} s={[26, 0.1, 6]} c={C.taxi} />
      {/* stands: teal free, amber occupied, white when selected */}
      {STANDS.map((id) => {
        const w = standWorld(id);
        const occ = occupied.get(id);
        const isSel = occ ? occ.id === selected : board.find((r) => r.id === selected)?.stand === id;
        const c = isSel ? '#ffffff' : occ ? C.gold : C.teal;
        return (
          <group key={id}>
            <Glow p={[w.x, 0.09, w.z]} s={[0.3, 0.04, 6.4]} c={c} intensity={isSel ? 2 : occ ? 0.9 : 0.6} />
            <Glow p={[w.x - 3.6, 0.09, w.z]} s={[0.2, 0.04, 6]} c={c} intensity={0.6} />
            <Glow p={[w.x + 3.6, 0.09, w.z]} s={[0.2, 0.04, 6]} c={c} intensity={0.6} />
          </group>
        );
      })}
      {/* passenger terminal with lit airside glazing */}
      <Box p={[AIRPORT_CENTRE.x - 4, 2.1, AIRPORT_CENTRE.z + 22]} s={[46, 4.2, 6]} c={C.terminal} shadow />
      <Glow p={[AIRPORT_CENTRE.x - 4, 2.2, AIRPORT_CENTRE.z + 18.9]} s={[44, 2.2, 0.2]} c="#9ff3f3" intensity={0.8} />
      {[-10, -2, 6].map((dx, i) => (
        <Box key={`pb${i}`} p={[AIRPORT_CENTRE.x + dx, 1.3, AIRPORT_CENTRE.z + 16.6]} s={[0.6, 0.6, 5]} c={C.hangar} />
      ))}
      {/* control tower */}
      <Box p={[AIRPORT_CENTRE.x - 30, 3, AIRPORT_CENTRE.z + 22]} s={[1, 6, 1]} c={C.tower} shadow />
      <Glow p={[AIRPORT_CENTRE.x - 30, 6.4, AIRPORT_CENTRE.z + 22]} s={[3, 1.4, 3]} c="#9ff3f3" intensity={0.8} />
      {/* cargo terminal and hangar, clear of the runway */}
      <Box p={[AIRPORT_CENTRE.x + 42, 1.6, AIRPORT_CENTRE.z + 1]} s={[14, 3.2, 10]} c={C.cargo} shadow />
      <Box p={[AIRPORT_CENTRE.x + 42, 3.2, AIRPORT_CENTRE.z + 22]} s={[18, 6.4, 14]} c={C.hangar} shadow />
      {/* aircraft on the stands that the board says are occupied now */}
      {onStand.map((r) => {
        const w = standWorld(r.stand);
        const f = FLIGHTS.find((x) => x.id === r.id)!;
        const isSel = r.id === selected;
        const delayed = r.id === 'SH204' && scenDelay > 0;
        const tr = flightTurnaround(f, r.arrEst - f.arrMin, r.id === 'SH204' ? scen : { baggageTractorFailed: false, replacementAssigned: false });
        const active = tr.rows.filter((row) => row.equipment && row.start <= now && now < row.finish);
        return (
          <group key={r.id} name={`aircraft-${r.id}`} position={[w.x, 0, w.z]}>
            <Aircraft x={0} z={0} type={f.type} status={delayed ? 'delay' : 'ok'} selected={isSel} />
            {active.map((row) => {
              const eq = row.equipment as Equip;
              const slot = EQUIP_SLOT[eq];
              if (!slot) return null;
              const failedHere = r.id === 'SH204' && tractorFailed && !replaced && row.id === 'load' && eq === 'Baggage tractor';
              const replacementHere = r.id === 'SH204' && tractorFailed && replaced && row.id === 'load' && eq === 'Baggage tractor';
              const color = failedHere ? C.fault : replacementHere ? C.replace : C.gse;
              return <group key={`${r.id}-${row.id}`} name={`gse-${r.id}-${row.id}`}><Vehicle p={[slot[0], 0, slot[2]]} color={color} kind={eq} /></group>;
            })}
          </group>
        );
      })}
    </group>
  );
}
