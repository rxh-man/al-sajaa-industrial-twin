import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Object3D, type InstancedMesh } from 'three';
import { Line } from '@react-three/drei';
import { LabelSprite } from '../three/LabelSprite';
import { WAREHOUSE_ROOF_RECORDS } from '../data/climateAgents';
import { snapshot } from './model';
import { PLANTS } from './green';
import { applyFilters, useSusStore } from './store';
import { ROAD_TRAFFIC } from './model';
import { SIZES } from './development';
import { HighlightView } from '../opsAgent/OpsOverlay';
import { WATER_LEAK } from '../solutions/scenarios/waterLeak';
import { CLIMATE } from '../solutions/scenarios/climate';

/**
 * The Command Centre's link to the 3D city: whatever the dashboard selects is drawn here on the existing
 * geometry (footprints, trees, roads, roofs), and proposed developments are drawn on their computed sites.
 * Nothing renders unless the dashboard is open and a map layer is chosen.
 */

const noRaycast = () => {};
const tmp = new Object3D();
const col = new Color();

/** CO₂ intensity colour ramp: green → amber → red */
function ramp(t: number) {
  const u = Math.max(0, Math.min(1, t));
  return col.setRGB(u < 0.5 ? 0.2 + 1.4 * u : 0.95, u < 0.5 ? 0.8 : 0.8 - 1.2 * (u - 0.5), 0.25).clone();
}

function Boxes({ boxes }: { boxes: { x0: number; z0: number; x1: number; z1: number; y: number; h: number; c: Color }[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    boxes.forEach((b, i) => {
      tmp.position.set((b.x0 + b.x1) / 2, b.y + b.h / 2, (b.z0 + b.z1) / 2);
      tmp.scale.set(Math.abs(b.x1 - b.x0) + 0.08, b.h, Math.abs(b.z1 - b.z0) + 0.08);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, b.c);
    });
    m.count = boxes.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [boxes]);
  if (!boxes.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, boxes.length)]} raycast={noRaycast} renderOrder={18} frustumCulled={false}>
      <boxGeometry />
      <meshBasicMaterial transparent opacity={0.72} depthWrite={false} />
    </instancedMesh>
  );
}

function Dots({ pts, color, r = 0.35 }: { pts: { x: number; z: number }[]; color: string; r?: number }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    pts.forEach((p, i) => {
      tmp.position.set(p.x, 1.6, p.z);
      tmp.scale.set(r, r, r);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.count = pts.length;
    m.instanceMatrix.needsUpdate = true;
  }, [pts, r]);
  if (!pts.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, pts.length)]} raycast={noRaycast} renderOrder={18} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.9} />
    </instancedMesh>
  );
}

export function SustainabilityOverlay() {
  const open = useSusStore((s) => s.open);
  const layer = useSusStore((s) => s.layer);
  const levers = useSusStore((s) => s.levers);
  const filters = useSusStore((s) => s.filters);
  const picked = useSusStore((s) => s.picked);
  const dev = useSusStore((s) => s.dev);
  const devMitigated = useSusStore((s) => s.devMitigated);

  const snap = useMemo(() => (open && layer === 'facilities' ? snapshot(levers) : null), [open, layer, levers]);
  const facilityBoxes = useMemo(() => {
    if (!snap) return [];
    const list = applyFilters(snap.facilities, filters);
    const max = Math.max(1, ...list.map((f) => f.co2T / Math.max(1, f.floorM2)));
    return list.flatMap((f) =>
      f.boxes.map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1, y: f.top + 0.02, h: picked === f.id ? 1.2 : 0.18, c: picked === f.id ? new Color('#4fd1e8') : ramp(f.co2T / Math.max(1, f.floorM2) / max) })),
    );
  }, [snap, filters, picked]);

  const roads = useMemo(() => {
    if (layer !== 'traffic') return [];
    return [...ROAD_TRAFFIC].sort((a, b) => b.vehKmDay / Math.max(0.01, b.km) - a.vehKmDay / Math.max(0.01, a.km)).slice(0, 40);
  }, [layer]);

  const devBoxes = useMemo(() => {
    if (layer !== 'development' || !dev) return [];
    return dev.sites.map((s) => ({ x0: s.x - s.w / 2, z0: s.z - s.d / 2, x1: s.x + s.w / 2, z1: s.z + s.d / 2, y: 0, h: 1.1, c: new Color(devMitigated ? '#38bdf8' : '#f59e0b') }));
  }, [layer, dev, devMitigated]);

  const scenarioHl = useMemo(() => (open && layer === 'water' ? WATER_LEAK.run(WATER_LEAK.defaults).highlight : open && layer === 'heat' ? CLIMATE.run(CLIMATE.defaults).highlight : null), [open, layer]);

  if (!open || layer === 'none') return null;
  return (
    <group>
      {layer === 'facilities' && <Boxes boxes={facilityBoxes} />}
      {scenarioHl && <HighlightView h={layer === 'heat' ? { ...scenarioHl, points: [] } : scenarioHl} />}
      {layer === 'trees' && (
        <>
          <Dots pts={PLANTS.filter((p) => p.type === 'shade')} color="#22c55e" r={0.32} />
          <Dots pts={PLANTS.filter((p) => p.type === 'palm')} color="#a3e635" r={0.26} />
        </>
      )}
      {layer === 'solar' && (
        <Boxes boxes={WAREHOUSE_ROOF_RECORDS.flatMap((r) => r.boxes.map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1, y: r.topY + 0.03, h: 0.12, c: new Color(levers.rooftopSolar > 0 ? '#38bdf8' : '#facc15') })))} />
      )}
      {layer === 'traffic' &&
        roads.map((r, i) => (
          <Line key={i} points={r.pts.map(([x, z]) => [x, 0.16, z] as [number, number, number])} color="#ff6b4a" lineWidth={3} depthTest={false} renderOrder={19} raycast={noRaycast} />
        ))}
      {layer === 'development' && dev && (
        <>
          <Boxes boxes={devBoxes} />
          {devMitigated && (
            <Dots
              pts={dev.sites.flatMap((s) => Array.from({ length: 6 }, (_, k) => ({ x: s.x - s.w / 2 - 0.6 + ((s.w + 1.2) * k) / 5, z: s.z + s.d / 2 + 0.7 })))}
              color="#22c55e"
              r={0.3}
            />
          )}
          {dev.sites.slice(0, 1).map((s) => (
            <LabelSprite key="lbl" text={`Proposed · ${dev.sites.length} × ${dev.category.label} (${SIZES[dev.inputs.size].label})`} position={[s.x, 2.4, s.z]} border="#22c55e" />
          ))}
        </>
      )}
    </group>
  );
}
