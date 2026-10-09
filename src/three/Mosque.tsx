import { useMemo } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { LatheGeometry, Vector2 } from 'three';
import { BUILDINGS, MOSQUE, PLINTH_H } from '../data/city';
import { live } from '../simulation/runtime';
import { useTwinStore } from '../store/useTwinStore';
import { G } from './shaders/globals';
import { createGlowMaterial, createPropMaterial } from './materials/surfaceMaterials';

const MOSQUE_ID = BUILDINGS.find((b) => b.kind === 'mosque')!.id;

/** Gulf-style dome: a slightly pointed hemisphere. */
function domeGeometry(r: number) {
  const pts: Vector2[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2);
    pts.push(new Vector2(Math.cos(a) * r, Math.sin(a) * r * 1.06));
  }
  pts.push(new Vector2(0, r * 1.16));
  return new LatheGeometry(pts, 32);
}

const { along, across, h: HALL_H } = MOSQUE.hall;
const TOTAL = along + MOSQUE.court;
const HALL_X = -TOTAL / 2 + MOSQUE.court + along / 2; // prayer hall towards the qibla (+x)
const COURT_X = -TOTAL / 2 + MOSQUE.court / 2;
const MIN_X = -TOTAL / 2 + 0.35;
const MIN_Z = -across / 2 + 0.35;

/**
 * Neighbourhood mosque (D-12): prayer hall under a central dome with corner domes, an arcaded
 * courtyard and a minaret with the green balcony lights common across the UAE. The compound
 * is turned to face the qibla, askew to the street grid.
 */
export function Mosque() {
  const wall = useMemo(() => createPropMaterial({ color: '#ece6da', roughness: 0.62, emissive: '#3a2c18', emissiveIntensity: 0.18 }), []);
  const dome = useMemo(() => createPropMaterial({ color: '#f4f1ea', roughness: 0.35, metalness: 0.15, emissive: '#4a3a22', emissiveIntensity: 0.22 }), []);
  const floor = useMemo(() => createPropMaterial({ color: '#d9d3c6', roughness: 0.5 }), []);
  const gold = useMemo(() => createPropMaterial({ color: '#d4a64a', roughness: 0.3, metalness: 0.9, emissive: '#6b4d14', emissiveIntensity: 0.5 }), []);
  const windows = useMemo(() => createGlowMaterial('#ffcf8a', 1.5, 0.08), []);
  const green = useMemo(() => createGlowMaterial('#3dff8a', 3.2, 0.1), []);
  const mainDome = useMemo(() => domeGeometry(1.1), []);
  const smallDome = useMemo(() => domeGeometry(0.3), []);
  const capDome = useMemo(() => domeGeometry(0.19), []);

  // hover highlight shared with the building shader's selection colours
  useFrame(() => {
    const on = G.uHoverBuilding.value === MOSQUE_ID || G.uSelectedBuilding.value === MOSQUE_ID;
    wall.emissiveIntensity = on ? 0.42 : 0.18;
  });

  const setHover = useTwinStore((s) => s.setHover);
  const setHoverSector = useTwinStore((s) => s.setHoverSector);
  const select = useTwinStore((s) => s.select);
  const solid = () => live.xray < 0.5 && live.exploded < 0.3;
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!solid()) return;
    e.stopPropagation();
    setHover({ kind: 'building', id: MOSQUE_ID });
    setHoverSector('D-12');
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4 || !solid()) return;
    e.stopPropagation();
    select({ info: { kind: 'building', id: MOSQUE_ID }, point: [e.point.x, e.point.y, e.point.z] });
  };

  const windowRow = (n: number, length: number, fixed: number, side: 'x' | 'z', y: number) =>
    Array.from({ length: n }, (_, i) => {
      const t = -length / 2 + (length / n) * (i + 0.5);
      const pos: [number, number, number] = side === 'z' ? [HALL_X + t, y, fixed] : [fixed, y, t];
      const size: [number, number, number] = side === 'z' ? [0.24, 0.42, 0.02] : [0.02, 0.42, 0.24];
      return (
        <mesh key={`${side}${fixed}${i}`} position={pos} material={windows}>
          <boxGeometry args={size} />
        </mesh>
      );
    });

  return (
    <group position={[MOSQUE.x, PLINTH_H, MOSQUE.z]} rotation-y={MOSQUE.yaw} onPointerMove={onMove} onPointerOut={() => setHover(null)} onClick={onClick}>
      {/* marble platform and courtyard */}
      <mesh position={[0, 0.03, 0]} material={floor} receiveShadow>
        <boxGeometry args={[TOTAL + 0.4, 0.06, across + 0.4]} />
      </mesh>
      {/* prayer hall */}
      <mesh position={[HALL_X, HALL_H / 2, 0]} material={wall} castShadow receiveShadow>
        <boxGeometry args={[along, HALL_H, across]} />
      </mesh>
      <mesh position={[HALL_X, HALL_H + 0.06, 0]} material={wall} castShadow>
        <boxGeometry args={[along + 0.12, 0.12, across + 0.12]} />
      </mesh>
      {windowRow(7, along - 0.6, across / 2 + 0.005, 'z', 0.62)}
      {windowRow(7, along - 0.6, -across / 2 - 0.005, 'z', 0.62)}
      {windowRow(6, across - 1.0, HALL_X - along / 2 - 0.005, 'x', 0.62)}
      {/* mihrab bay on the qibla wall */}
      <mesh position={[HALL_X + along / 2 + 0.22, 0.55, 0]} material={wall} castShadow>
        <boxGeometry args={[0.44, 1.1, 1.0]} />
      </mesh>
      {/* central dome on its drum, corner domes */}
      <mesh position={[HALL_X, HALL_H + 0.27, 0]} material={wall} castShadow>
        <cylinderGeometry args={[1.12, 1.12, 0.3, 32]} />
      </mesh>
      <mesh geometry={mainDome} position={[HALL_X, HALL_H + 0.42, 0]} material={dome} castShadow />
      <mesh position={[HALL_X, HALL_H + 0.42 + 1.1 * 1.16 + 0.12, 0]} material={gold}>
        <cylinderGeometry args={[0.02, 0.03, 0.26, 6]} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <group key={`${sx}${sz}`} position={[HALL_X + sx * (along / 2 - 0.45), HALL_H + 0.12, sz * (across / 2 - 0.45)]}>
            <mesh position={[0, 0.08, 0]} material={wall}>
              <cylinderGeometry args={[0.32, 0.32, 0.16, 20]} />
            </mesh>
            <mesh geometry={smallDome} position={[0, 0.16, 0]} material={dome} castShadow />
          </group>
        )),
      )}
      {/* courtyard arcade walls and entrance portal */}
      {[-1, 1].map((sz) => (
        <mesh key={sz} position={[COURT_X, 0.32, sz * (across / 2 - 0.08)]} material={wall} castShadow>
          <boxGeometry args={[MOSQUE.court, 0.64, 0.16]} />
        </mesh>
      ))}
      {[-1, 1].map((sz) => (
        <mesh key={`f${sz}`} position={[-TOTAL / 2 + 0.08, 0.32, sz * (across / 4 + 0.5)]} material={wall} castShadow>
          <boxGeometry args={[0.16, 0.64, across / 2 - 1.0]} />
        </mesh>
      ))}
      <mesh position={[-TOTAL / 2 + 0.12, 0.62, 0]} material={wall} castShadow>
        <boxGeometry args={[0.32, 1.24, 1.3]} />
      </mesh>
      <mesh position={[-TOTAL / 2 - 0.05, 0.48, 0]} material={windows}>
        <boxGeometry args={[0.02, 0.6, 0.6]} />
      </mesh>
      {/* minaret */}
      <group position={[MIN_X, 0, MIN_Z]}>
        <mesh position={[0, 0.65, 0]} material={wall} castShadow>
          <boxGeometry args={[0.72, 1.3, 0.72]} />
        </mesh>
        <mesh position={[0, 2.55, 0]} material={wall} castShadow>
          <cylinderGeometry args={[0.22, 0.27, 2.5, 8]} />
        </mesh>
        <mesh position={[0, 3.86, 0]} material={wall} castShadow>
          <cylinderGeometry args={[0.42, 0.3, 0.14, 16]} />
        </mesh>
        <mesh position={[0, 3.98, 0]} material={green}>
          <cylinderGeometry args={[0.43, 0.43, 0.05, 20, 1, true]} />
        </mesh>
        <mesh position={[0, 4.18, 0]} material={wall} castShadow>
          <cylinderGeometry args={[0.17, 0.2, 0.4, 8]} />
        </mesh>
        <mesh geometry={capDome} position={[0, 4.38, 0]} material={dome} />
        <mesh position={[0, 4.74, 0]} material={gold}>
          <cylinderGeometry args={[0.015, 0.02, 0.22, 6]} />
        </mesh>
        {/* crescent finial, opening upwards */}
        <mesh position={[0, 4.9, 0]} rotation-z={2.59} material={gold}>
          <torusGeometry args={[0.06, 0.013, 6, 14, Math.PI * 1.35]} />
        </mesh>
      </group>
    </group>
  );
}
