import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import { SECTOR_BY_ID, PLINTH } from '../data/city';
import { live } from '../simulation/runtime';
import { useTwinStore } from '../store/useTwinStore';
import { FadeHtml } from './labels/FadeHtml';

const B12 = SECTOR_BY_ID.get('B-12')!;

/** Status label for the incident sector — colour/state follow the scenario. */
function AlertLabel() {
  const stateRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const healed = live.healed > 0.5;
    const sev = live.sectorSeverity > 0.5;
    const state = healed ? 'STABLE' : sev ? 'INCIDENT' : 'ANOMALY';
    const tone = healed ? 'ok' : sev ? 'alert' : 'warn';
    if (stateRef.current && stateRef.current.textContent !== state) stateRef.current.textContent = state;
    if (boxRef.current && boxRef.current.dataset.tone !== tone) boxRef.current.dataset.tone = tone;
  });
  return (
    <FadeHtml position={[B12.x - PLINTH / 2 + 0.5, 0.4, B12.z - PLINTH / 2 + 0.5]} opacity={() => live.sectorAlert * (1 - live.exploded)} zIndex={27}>
      <div className="sector-tag is-alert" ref={boxRef} data-tone="warn">
        <span className="sector-id mono">Area B-12</span>
        <span className="sector-state" ref={stateRef}>
          ANOMALY
        </span>
      </div>
    </FadeHtml>
  );
}

/**
 * Hover label for any sector. The Html root stays mounted (mounting/unmounting
 * drei Html roots during a render is unsafe); only its anchor and content change.
 */
function HoverLabel() {
  const hoverSector = useTwinStore((s) => s.hoverSector);
  const xray = useTwinStore((s) => s.xray);
  const hoveringBuilding = useTwinStore((s) => s.hover?.kind === 'building');
  const ref = useRef<Group>(null);
  const s = hoverSector ? SECTOR_BY_ID.get(hoverSector) : undefined;
  const show = !!s && !xray && !hoveringBuilding && !(s.id === 'B-12' && live.sectorAlert > 0.3);

  useFrame(() => {
    if (ref.current && s) ref.current.position.set(s.x - PLINTH / 2 + 0.5, 0.4, s.z - PLINTH / 2 + 0.5);
  });

  return (
    <group ref={ref}>
      <Html zIndexRange={[19, 19]} style={{ pointerEvents: 'none' }}>
        {show && s && (
          <div className="sector-tag">
            <span className="sector-id mono">{s.id}</span>
          </div>
        )}
      </Html>
    </group>
  );
}

export function SectorOverlay() {
  return (
    <group>
      <AlertLabel />
      <HoverLabel />
    </group>
  );
}
