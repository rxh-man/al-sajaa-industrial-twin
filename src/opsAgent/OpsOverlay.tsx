import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import type { HighlightRole } from '../solutions/types';
import { useOpsStore } from './store';

/**
 * Draws the agent's highlight on the existing city: pipes, roads, roofs and routes it found or acted on, as
 * coloured lines and pins just above the ground. No new city geometry; nothing is drawn when the panel is closed.
 */

const COLOR: Record<HighlightRole, string> = {
  problem: '#ff4d4f',
  affected: '#ffb020',
  action: '#22c55e',
  route: '#38bdf8',
  alt: '#a78bfa',
  facility: '#f8fafc',
};
const Y = 0.14;
const noRaycast = () => {};

export function OpsOverlay() {
  const open = useOpsStore((s) => s.open);
  const h = useOpsStore((s) => s.highlight);
  const executed = useOpsStore((s) => s.executed);
  const lines = useMemo(() => {
    if (!h) return [];
    const byRole = new Map<HighlightRole, [number, number, number][]>();
    for (const p of h.paths) {
      const arr = byRole.get(p.role) ?? [];
      for (let i = 1; i < p.pts.length; i++) arr.push([p.pts[i - 1][0], Y, p.pts[i - 1][1]], [p.pts[i][0], Y, p.pts[i][1]]);
      byRole.set(p.role, arr);
    }
    return [...byRole].filter(([, pts]) => pts.length >= 2);
  }, [h]);
  if (!open || !h) return null;
  return (
    <group>
      {lines.map(([role, pts]) => (
        <Line key={role} points={pts} segments color={COLOR[role]} lineWidth={role === 'route' || role === 'alt' ? 3 : 2.5} transparent opacity={0.95} depthTest={false} renderOrder={20} raycast={noRaycast} />
      ))}
      {h.points.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.5, 0]} raycast={noRaycast} renderOrder={21}>
            <cylinderGeometry args={[0.08, 0.08, 1, 8]} />
            <meshBasicMaterial color={COLOR[p.role]} depthTest={false} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, 1.05, 0]} raycast={noRaycast} renderOrder={21}>
            <sphereGeometry args={[executed && p.role === 'action' ? 0.32 : 0.22, 12, 8]} />
            <meshBasicMaterial color={COLOR[p.role]} depthTest={false} transparent opacity={0.95} />
          </mesh>
          {(p.role === 'problem' || p.role === 'facility' || (h.points.length <= 8 && p.role === 'action')) && (
            <Html position={[0, 1.5, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
              <div className={`ops-pin ops-pin-${p.role}`}>{p.label}</div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}
