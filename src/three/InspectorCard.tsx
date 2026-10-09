import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import { X } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { describe } from '../app/assetInfo';
import { LAYERS, type LayerId } from '../data/networks';
import { SENSORS } from '../data/sensors';
import { G } from './shaders/globals';
import { AssetCardBody } from '../components/ui/AssetCardBody';

/** Pinned, world-anchored card for the clicked asset (follows exploded offsets). */
export function InspectorCard() {
  const selection = useTwinStore((s) => s.selection);
  const snap = useTwinStore((s) => s.snap);
  const select = useTwinStore((s) => s.select);
  const ref = useRef<Group>(null);

  useFrame(() => {
    const g = ref.current;
    if (!g || !selection) return;
    const [x, y, z] = selection.point;
    const info = selection.info;
    let dy = 0;
    if (info.kind === 'pipe') {
      const l = LAYERS[info.layer as LayerId];
      dy = G.uExploded.value * (l.explodedY - l.depth);
    } else if (info.kind === 'sensor') {
      const l = LAYERS[SENSORS[info.index].layer];
      dy = G.uExploded.value * (l.explodedY - l.depth);
    } else {
      dy = G.uExploded.value * 12;
    }
    g.position.set(x, y + dy, z);
  });

  const data = selection ? describe(selection.info, snap) : null;
  return (
    <group ref={ref}>
      <Html zIndexRange={[60, 60]} style={{ pointerEvents: 'none' }}>
        {data && (
        <div className="inspector" role="dialog" aria-label={data.title}>
          <svg className="inspector-leader" width="40" height="40" viewBox="0 0 40 40" aria-hidden>
            <circle cx="3" cy="37" r="3" />
            <path d="M3 37 L22 18 L40 18" />
          </svg>
          <div className="inspector-card">
            <button className="inspector-close" onClick={() => select(null)} aria-label="Close">
              <X size={14} />
            </button>
            <AssetCardBody data={data} />
          </div>
        </div>
        )}
      </Html>
    </group>
  );
}
