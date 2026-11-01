import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { NETWORKS } from '../data/networks';
import { useTwinStore } from '../store/useTwinStore';
import { useEnv } from './store';

/** Network segments below the Layers panel's health threshold, drawn at ground level over visible layers. */
export function AssetHealthOverlay() {
  const below = useEnv((e) => e.healthBelow);
  const visible = useTwinStore((s) => s.visible);
  const pts = useMemo(() => {
    if (!below) return [];
    const out: [number, number, number][] = [];
    for (const n of NETWORKS) {
      if (!visible[n.layer.id]) continue;
      for (const s of n.segments) if (s.meta.health < below) out.push([s.a[0], 0.12, s.a[1]], [s.b[0], 0.12, s.b[1]]);
    }
    return out;
  }, [below, visible]);
  if (pts.length < 2) return null;
  return <Line points={pts} segments color="#ff5a3c" lineWidth={2.5} depthTest={false} renderOrder={19} raycast={() => {}} />;
}
