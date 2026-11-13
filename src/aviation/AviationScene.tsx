import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * SAHRA GATEWAY INTERNATIONAL AIRPORT (fictional). A separate district east of the city diorama, on its own slab,
 * so it cannot overlap existing buildings or roads. Low-poly, shared geometries; only mounted while MRR AVIATION is open.
 */
export const AIRPORT_CENTRE = { x: 292, z: -6 } as const;

const C = {
  slab: '#2c4654',
  asphalt: '#3c464d',
  taxi: '#49545b',
  paint: '#e8edf0',
  terminal: '#c9d3d8',
  glass: '#3d6f80',
  glow: '#9ff3f3',
  edge: '#ffd27a',
  tower: '#dfe6ea',
  hangar: '#7d8c95',
  navy: '#0f2a4a',
  teal: '#1aa3a3',
  gold: '#c9a24a',
  fuselage: '#f4f6f8',
};

function Box({ p, s, c, r = [0, 0, 0] }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: [number, number, number] }) {
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.7} metalness={0.05} />
    </mesh>
  );
}

/** Small emissive marker (runway edge light, window glow). Self-lit, so it stays visible without scene lights. */
function Glow({ p, s, c }: { p: [number, number, number]; s: [number, number, number]; c: string }) {
  return (
    <mesh position={p}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.4} toneMapped={false} />
    </mesh>
  );
}

function Aircraft({ x, z, yaw, wide = false }: { x: number; z: number; yaw: number; wide?: boolean }) {
  const len = wide ? 10 : 8;
  const r = wide ? 0.6 : 0.48;
  const geo = useMemo(() => new THREE.CylinderGeometry(r, r, len, 14), [r, len]);
  return (
    <group position={[x, 0.35, z]} rotation={[0, yaw, 0]}>
      <mesh geometry={geo} rotation={[0, 0, Math.PI / 2]} position={[0, 0.5, 0]} castShadow>
        <meshStandardMaterial color={C.fuselage} roughness={0.4} metalness={0.2} />
      </mesh>
      <Box p={[len * 0.42, 0.9, 0]} s={[1.6, 0.9, 0.12]} c={C.navy} />
      <Box p={[-len * 0.5, 1.5, 0]} s={[0.12, 1.4, 0.5]} c={C.teal} />
      <Box p={[-len * 0.5, 1.1, 0]} s={[0.9, 0.12, 2.6]} c={C.fuselage} />
      <Box p={[0.2, 0.25, 1.9]} s={[1.5, 0.12, 2.6]} c={C.fuselage} r={[0.12, 0, 0]} />
      <Box p={[0.2, 0.25, -1.9]} s={[1.5, 0.12, 2.6]} c={C.fuselage} r={[-0.12, 0, 0]} />
      <mesh position={[0.4, -0.05, 1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.9, 10]} />
        <meshStandardMaterial color={C.hangar} />
      </mesh>
      <mesh position={[0.4, -0.05, -1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.9, 10]} />
        <meshStandardMaterial color={C.hangar} />
      </mesh>
      <Box p={[0, 1.02, 0]} s={[len * 0.8, 0.05, 0.05]} c={C.gold} />
    </group>
  );
}

export function AviationScene() {
  const { x, z } = AIRPORT_CENTRE;
  const stands = [
    { id: 'A2', x: x - 10, z: z + 12, yaw: 0 },
    { id: 'A3', x: x - 2, z: z + 12, yaw: 0 },
    { id: 'A5', x: x + 6, z: z + 12, yaw: 0 },
    { id: 'B1', x: x + 14, z: z + 12, yaw: 0 },
  ];
  return (
    <group name="mrr-aviation">
      {/* slab */}
      <Box p={[x, -0.4, z]} s={[120, 0.8, 80]} c={C.slab} />
      {/* runway, centreline and edge lights */}
      <Box p={[x, 0.02, z - 26]} s={[100, 0.1, 4.2]} c={C.asphalt} />
      {[...Array(20)].map((_, i) => (
        <Box key={`rw${i}`} p={[x - 47 + i * 5, 0.08, z - 26]} s={[2.4, 0.04, 0.3]} c={C.paint} />
      ))}
      {[...Array(25)].map((_, i) => (
        <Glow key={`el${i}`} p={[x - 48 + i * 4, 0.12, z - 26 - 2.3]} s={[0.5, 0.1, 0.5]} c={C.edge} />
      ))}
      {[...Array(25)].map((_, i) => (
        <Glow key={`er${i}`} p={[x - 48 + i * 4, 0.12, z - 26 + 2.3]} s={[0.5, 0.1, 0.5]} c={C.edge} />
      ))}
      {/* taxiway */}
      <Box p={[x, 0.02, z - 14]} s={[100, 0.1, 1.6]} c={C.taxi} />
      {/* apron */}
      <Box p={[x + 2, 0.02, z + 12]} s={[38, 0.1, 10]} c={C.taxi} />
      {stands.map((s) => (
        <Box key={s.id} p={[s.x, 0.09, s.z]} s={[0.25, 0.04, 6]} c={C.paint} />
      ))}
      {/* passenger terminal, glazed airside face */}
      <Box p={[x - 4, 2.1, z + 22]} s={[46, 4.2, 6]} c={C.terminal} />
      <Glow p={[x - 4, 2.2, z + 18.9]} s={[44, 2.2, 0.2]} c={C.glow} />
      {/* boarding bridges */}
      {[x - 10, x - 2, x + 6].map((bx, i) => (
        <Box key={`pb${i}`} p={[bx, 1.3, z + 16.6]} s={[0.6, 0.6, 5]} c={C.hangar} />
      ))}
      {/* control tower */}
      <Box p={[x - 30, 3, z + 22]} s={[1, 6, 1]} c={C.tower} />
      <Glow p={[x - 30, 6.4, z + 22]} s={[3, 1.4, 3]} c={C.glow} />
      {/* apron floodlight masts (emissive tips) */}
      {[x - 22, x + 26].map((mx, i) => (
        <group key={`mast${i}`}>
          <Box p={[mx, 4, z + 6]} s={[0.3, 8, 0.3]} c={C.tower} />
          <Glow p={[mx, 8.2, z + 6]} s={[1.2, 0.4, 1.2]} c={C.edge} />
        </group>
      ))}
      {/* cargo terminal and hangar */}
      <Box p={[x + 40, 1.6, z - 8]} s={[16, 3.2, 12]} c={C.hangar} />
      <Box p={[x + 40, 3.2, z - 24]} s={[20, 6.4, 14]} c={C.hangar} />
      {/* aircraft on stands */}
      <Aircraft x={stands[1].x} z={stands[1].z} yaw={Math.PI / 2} />
      <Aircraft x={stands[2].x} z={stands[2].z} yaw={Math.PI / 2} wide />
      <Aircraft x={stands[0].x} z={stands[0].z} yaw={Math.PI / 2} />
    </group>
  );
}
