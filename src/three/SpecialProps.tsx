import { useMemo } from 'react';
import { PLINTH_H, HOSPITAL_POS, COOLING_PLANT_POS } from '../data/city';
import { createGlowMaterial, createPropMaterial } from './materials/surfaceMaterials';

const Y0 = PLINTH_H;

function Hospital() {
  const pad = useMemo(() => createPropMaterial({ color: '#20262e', roughness: 0.7 }), []);
  const mark = useMemo(() => createGlowMaterial('#e8f1ff', 1.6, 0.2), []);
  const red = useMemo(() => createGlowMaterial('#ff3b36', 4.5, 0.4), []);
  const top = Y0 + 2.6 + 8.9;
  const { x, z } = HOSPITAL_POS;
  return (
    <group>
      {/* helipad */}
      <mesh position={[x - 1.8, top + 0.04, z]} material={pad} receiveShadow>
        <cylinderGeometry args={[2.25, 2.25, 0.08, 40]} />
      </mesh>
      <mesh position={[x - 1.8, top + 0.09, z]} rotation-x={-Math.PI / 2} material={mark}>
        <ringGeometry args={[1.85, 2.0, 48]} />
      </mesh>
      <group position={[x - 1.8, top + 0.1, z]}>
        <mesh position={[-0.42, 0, 0]} material={mark}>
          <boxGeometry args={[0.16, 0.02, 1.2]} />
        </mesh>
        <mesh position={[0.42, 0, 0]} material={mark}>
          <boxGeometry args={[0.16, 0.02, 1.2]} />
        </mesh>
        <mesh material={mark}>
          <boxGeometry args={[0.84, 0.02, 0.16]} />
        </mesh>
      </group>
      {/* red cross signs on south + east faces */}
      <group position={[x + 2.6, Y0 + 9.6, z + 3.13]}>
        <mesh material={red}>
          <boxGeometry args={[1.25, 0.36, 0.06]} />
        </mesh>
        <mesh material={red}>
          <boxGeometry args={[0.36, 1.25, 0.06]} />
        </mesh>
      </group>
      <group position={[x + 5.28, Y0 + 9.6, z - 0.8]} rotation-y={Math.PI / 2}>
        <mesh material={red}>
          <boxGeometry args={[1.25, 0.36, 0.06]} />
        </mesh>
        <mesh material={red}>
          <boxGeometry args={[0.36, 1.25, 0.06]} />
        </mesh>
      </group>
      {/* emergency canopy */}
      <mesh position={[33.5, Y0 + 1.1, -6.2]} material={pad}>
        <boxGeometry args={[5, 0.14, 2]} />
      </mesh>
      <mesh position={[33.5, Y0 + 1.0, -5.25]} material={red}>
        <boxGeometry args={[4.6, 0.06, 0.05]} />
      </mesh>
    </group>
  );
}

function SchoolField() {
  const grass = useMemo(() => createPropMaterial({ color: '#173826', roughness: 0.95 }), []);
  const lines = useMemo(() => createGlowMaterial('#dfe8f2', 0.9, 0.15), []);
  const track = useMemo(() => createPropMaterial({ color: '#5a2a24', roughness: 0.9 }), []);
  const cx = -32.5;
  const cz = -40;
  return (
    <group position={[cx, Y0 + 0.01, cz]}>
      <mesh rotation-x={-Math.PI / 2} material={track} receiveShadow>
        <planeGeometry args={[9.2, 10]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} material={grass} receiveShadow>
        <planeGeometry args={[7.4, 8.2]} />
      </mesh>
      {[
        [0, 0.02, -3.9, 7.0, 0.06],
        [0, 0.02, 3.9, 7.0, 0.06],
        [0, 0.02, 0, 7.0, 0.05],
      ].map(([x, y, z, w, d], i) => (
        <mesh key={i} position={[x, y, z]} material={lines}>
          <boxGeometry args={[w, 0.01, d]} />
        </mesh>
      ))}
      {[-3.5, 3.5].map((x) => (
        <mesh key={x} position={[x, 0.02, 0]} material={lines}>
          <boxGeometry args={[0.06, 0.01, 7.8]} />
        </mesh>
      ))}
      <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2} material={lines}>
        <ringGeometry args={[1.0, 1.08, 40]} />
      </mesh>
    </group>
  );
}

function Depot() {
  const truckBody = useMemo(() => createPropMaterial({ color: '#d7dbe0', roughness: 0.45 }), []);
  const truckCab = useMemo(() => createPropMaterial({ color: '#e07a1f', roughness: 0.5, emissive: '#e07a1f', emissiveIntensity: 0.15 }), []);
  const fence = useMemo(() => createPropMaterial({ color: '#59616c', roughness: 0.6, metalness: 0.5 }), []);
  const lamp = useMemo(() => createGlowMaterial('#ffe2b0', 4, 0.1), []);
  const trucks = [
    [48.8, 38],
    [56.2, 38],
    [58.6, 38],
    [61, 38],
    [63.4, 38],
  ];
  return (
    <group>
      {trucks.map(([x, z], i) => (
        <group key={i} position={[x, Y0, z]} scale={2.2}>
          <mesh position={[0, 0.16, -0.1]} material={truckBody} castShadow>
            <boxGeometry args={[0.36, 0.3, 0.6]} />
          </mesh>
          <mesh position={[0, 0.13, 0.3]} material={truckCab} castShadow>
            <boxGeometry args={[0.34, 0.24, 0.2]} />
          </mesh>
        </group>
      ))}
      {/* yard fence */}
      {[
        [48.8, 34.6, 4.4, 0.06],
        [59.7, 34.6, 11.4, 0.06],
        [46.6, 40.5, 0.06, 11.8],
        [65.4, 40.5, 0.06, 11.8],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, Y0 + 0.3, z]} material={fence}>
          <boxGeometry args={[w, 0.6, d]} />
        </mesh>
      ))}
      {[48, 64].map((x) => (
        <group key={x} position={[x, Y0, 42]}>
          <mesh position={[0, 1.1, 0]} material={fence}>
            <cylinderGeometry args={[0.05, 0.06, 2.2, 6]} />
          </mesh>
          <mesh position={[0, 2.22, 0]} material={lamp}>
            <boxGeometry args={[0.3, 0.06, 0.3]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function PumpStation() {
  const tank = useMemo(() => createPropMaterial({ color: '#7d8794', roughness: 0.4, metalness: 0.5 }), []);
  const band = useMemo(() => createGlowMaterial('#38b6f0', 2.4, 0.5), []);
  const pipe = useMemo(() => createPropMaterial({ color: '#2f7fb4', roughness: 0.35, metalness: 0.6 }), []);
  const tanks: [number, number, number, number][] = [
    [-33.2, 48.4, 2.3, 3.4],
    [-28.6, 49.6, 1.8, 2.8],
  ];
  return (
    <group>
      {tanks.map(([x, z, r, h], i) => (
        <group key={i} position={[x, Y0, z]}>
          <mesh position={[0, h / 2, 0]} material={tank} castShadow receiveShadow>
            <cylinderGeometry args={[r, r, h, 36]} />
          </mesh>
          <mesh position={[0, h * 0.62, 0]} material={band}>
            <cylinderGeometry args={[r + 0.02, r + 0.02, 0.16, 36, 1, true]} />
          </mesh>
          <mesh position={[0, h + 0.18, 0]} material={tank} castShadow>
            <cylinderGeometry args={[r * 0.2, r, 0.36, 36]} />
          </mesh>
        </group>
      ))}
      <mesh position={[-24.5, Y0 + 0.9, 49.2]} rotation-z={Math.PI / 2} material={pipe}>
        <cylinderGeometry args={[0.22, 0.22, 4.2, 12]} />
      </mesh>
    </group>
  );
}

function Substation() {
  const metal = useMemo(() => createPropMaterial({ color: '#626b77', roughness: 0.5, metalness: 0.6 }), []);
  const xfmr = useMemo(() => createPropMaterial({ color: '#4a5260', roughness: 0.55, metalness: 0.4 }), []);
  const warn = useMemo(() => createGlowMaterial('#f0c23b', 2.2, 0.3), []);
  const units = [-46, -41.5, -37];
  return (
    <group>
      {units.map((z) => (
        <group key={z} position={[58, Y0, z]}>
          <mesh position={[0, 1.1, 0]} material={xfmr} castShadow>
            <boxGeometry args={[2.2, 2.2, 2.4]} />
          </mesh>
          {[-1.25, 1.25].map((dx) => (
            <mesh key={dx} position={[dx, 1, 0]} material={metal}>
              <boxGeometry args={[0.3, 1.8, 2.0]} />
            </mesh>
          ))}
          <mesh position={[0, 2.3, 0]} material={warn}>
            <boxGeometry args={[0.5, 0.08, 0.5]} />
          </mesh>
          {/* gantry */}
          <mesh position={[3.4, 2.4, -1]} material={metal}>
            <boxGeometry args={[0.12, 4.8, 0.12]} />
          </mesh>
          <mesh position={[3.4, 2.4, 1]} material={metal}>
            <boxGeometry args={[0.12, 4.8, 0.12]} />
          </mesh>
          <mesh position={[3.4, 4.75, 0]} material={metal}>
            <boxGeometry args={[0.12, 0.12, 2.2]} />
          </mesh>
        </group>
      ))}
      {[
        [56, -53.4, 18.4, 0.06],
        [56, -34.6, 18.4, 0.06],
        [65.2, -44, 0.06, 18.8],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, Y0 + 0.45, z]} material={metal}>
          <boxGeometry args={[w, 0.9, d]} />
        </mesh>
      ))}
    </group>
  );
}

function CoolingTowers() {
  const shell = useMemo(() => createPropMaterial({ color: '#8e98a5', roughness: 0.5, metalness: 0.3 }), []);
  const fan = useMemo(() => createPropMaterial({ color: '#1a1f26', roughness: 0.6 }), []);
  const top = Y0 + 4.2;
  return (
    <group>
      {[-4, 0, 4].map((dx) => (
        <group key={dx} position={[COOLING_PLANT_POS.x + dx, top, COOLING_PLANT_POS.z]}>
          <mesh position={[0, 0.6, 0]} material={shell} castShadow>
            <cylinderGeometry args={[1.25, 1.45, 1.2, 28]} />
          </mesh>
          <mesh position={[0, 1.22, 0]} material={fan}>
            <cylinderGeometry args={[1.05, 1.05, 0.05, 28]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function SpecialProps() {
  return (
    <group>
      <Hospital />
      <SchoolField />
      <Depot />
      <PumpStation />
      <Substation />
      <CoolingTowers />
    </group>
  );
}
