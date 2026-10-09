import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { VALVES } from '../data/incident';
import { LAYERS } from '../data/networks';
import { live } from '../simulation/runtime';
import { FadeHtml } from './labels/FadeHtml';
import { useTwinStore } from '../store/useTwinStore';
import { useRaf } from '../hooks/useRaf';

const OPEN = new Color('#34d399');
const CLOSING = new Color('#ffb547');
const CLOSED = new Color('#ff4d3d');

function Valve({ id, x, z, isolation }: { id: string; x: number; z: number; isolation: boolean }) {
  const y = LAYERS.water.depth;
  const r = LAYERS.water.radius;
  const wheel = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const bodyMat = useMemo(() => new MeshStandardMaterial({ color: '#3d6f93', roughness: 0.35, metalness: 0.65, envMapIntensity: 1 }), []);
  const wheelMat = useMemo(() => new MeshStandardMaterial({ color: '#c9d4df', roughness: 0.3, metalness: 0.8 }), []);
  const ringMat = useMemo(() => new MeshBasicMaterial({ color: OPEN.clone().multiplyScalar(2.5), toneMapped: true }), []);
  const tmp = useMemo(() => new Color(), []);
  const setHover = useTwinStore((s) => s.setHover);

  useFrame((_, dt) => {
    const closed = isolation ? live.valves : 0;
    if (wheel.current) wheel.current.rotation.y = closed * Math.PI * 5;
    if (closed < 0.5) tmp.copy(OPEN).lerp(CLOSING, closed * 2);
    else tmp.copy(CLOSING).lerp(CLOSED, (closed - 0.5) * 2);
    const highlight = isolation && live.valves > 0.01 ? 1 : 0;
    ringMat.color.copy(tmp).multiplyScalar(1.6 + highlight * 2.2);
    if (ring.current) {
      const s = 1 + highlight * 0.12 * Math.sin(performance.now() * 0.008);
      ring.current.scale.setScalar(s);
    }
    const dim = live.layerDim.water;
    bodyMat.color.set('#3d6f93').multiplyScalar(1 - dim * 0.75);
    void dt;
  });

  return (
    <group position={[x, y, z]}>
      <group onPointerMove={(e) => (live.xray > 0.5 || live.trench > 0.5) && (e.stopPropagation(), setHover({ kind: 'valve', id }))} onPointerOut={() => setHover(null)}>
        {/* body around the main */}
        <mesh rotation-z={Math.PI / 2} material={bodyMat}>
          <cylinderGeometry args={[r * 1.55, r * 1.55, 1.1, 20]} />
        </mesh>
        {/* bonnet + stem */}
        <mesh position={[0, r * 1.5 + 0.35, 0]} material={bodyMat}>
          <cylinderGeometry args={[0.2, 0.26, 0.75, 14]} />
        </mesh>
        <mesh position={[0, r * 1.5 + 0.95, 0]} material={wheelMat}>
          <cylinderGeometry args={[0.05, 0.05, 0.6, 8]} />
        </mesh>
        <group ref={wheel} position={[0, r * 1.5 + 1.2, 0]}>
          <mesh rotation-x={Math.PI / 2} material={wheelMat}>
            <torusGeometry args={[0.42, 0.055, 8, 28]} />
          </mesh>
          <mesh material={wheelMat}>
            <boxGeometry args={[0.84, 0.05, 0.06]} />
          </mesh>
          <mesh material={wheelMat} rotation-y={Math.PI / 2}>
            <boxGeometry args={[0.84, 0.05, 0.06]} />
          </mesh>
        </group>
        {/* status ring */}
        <mesh ref={ring} rotation-y={Math.PI / 2} material={ringMat}>
          <torusGeometry args={[r * 1.75, 0.05, 8, 40]} />
        </mesh>
      </group>
      {isolation && (
        <FadeHtml position={[0, r * 1.5 + 1.9, 0]} opacity={() => (live.valves > 0.02 ? Math.min(1, live.valves * 4) * (1 - live.exploded) : 0)} zIndex={30}>
          <ValveChip id={id} />
        </FadeHtml>
      )}
    </group>
  );
}

function ValveChip({ id }: { id: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  useRaf(() => {
    const closed = live.valves;
    const label = closed > 0.95 ? 'CLOSED' : closed > 0.05 ? 'CLOSING' : 'OPEN';
    if (ref.current && ref.current.textContent !== label) ref.current.textContent = label;
    if (dotRef.current) dotRef.current.dataset.state = label.toLowerCase();
  });
  return (
    <div className="world-chip valve-chip">
      <span className="chip-dot" ref={dotRef} data-state="open" />
      <span className="mono">{id}</span>
      <span className="chip-state" ref={ref}>
        OPEN
      </span>
    </div>
  );
}

export function Valves() {
  return (
    <group>
      {VALVES.map((v) => (
        <Valve key={v.id} {...v} />
      ))}
    </group>
  );
}
