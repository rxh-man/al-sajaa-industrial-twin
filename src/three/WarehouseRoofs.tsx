import { useMemo } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, type Intersection, type Raycaster } from 'three';
import { WAREHOUSE_ROOF_RECORDS } from '../data/climateAgents';
import { FACTORIES } from '../data/airClimate';
import { AD } from '../data/abudhabi';
import { buildRoadGraph, routeBetween, type FreightRoute, type RoadGraph } from '../data/freightRoute';
import { useTwinStore } from '../store/useTwinStore';
import { RoofHighlight } from './RoofHighlight';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

/** Road graph for freight routes, built once from the existing road polylines. */
let roadGraph: RoadGraph | null = null;
const getRoadGraph = () => (roadGraph ??= buildRoadGraph(AD.roads));

/**
 * Shortest modelled route from a warehouse roof to a factory hall: the nearest factory that the
 * road model can reach (factories are tried nearest first). Null when none is reachable.
 */
export function freightRouteFor(roofId: string): (FreightRoute & { factoryId: number }) | null {
  const roof = WAREHOUSE_ROOF_RECORDS.find((r) => r.id === roofId);
  if (!roof || FACTORIES.length === 0) return null;
  const [cx, cz] = roof.centre;
  const byDistance = [...FACTORIES].sort((p, q) => (p.x - cx) ** 2 + (p.z - cz) ** 2 - ((q.x - cx) ** 2 + (q.z - cz) ** 2));
  for (const f of byDistance.slice(0, 8)) {
    const r = routeBetween(getRoadGraph(), [cx, cz], [f.x, f.z]);
    if (r) return { ...r, factoryId: f.id };
  }
  return null;
}

/**
 * Warehouse roof overlays: hover, selection and the freight route. Roofs are picked by the building
 * meshes themselves (see classifyBuildingPick), so there is no separate pick layer to misalign.
 */
/** Width of the drawn freight route, scene units (0.12 = 1.2 m). Lines are 1 px in WebGL, so the route is a flat ribbon. */
const ROUTE_WIDTH = 0.12;
/** Height above the ground of the drawn route, scene units. Roads and traffic sit at ground level, so the route sits just above them. */
const ROUTE_Y = 0.06;

/** Flat ribbon along the route polyline, on the ground, ROUTE_WIDTH wide. Pure geometry. */
export function routeRibbon(points: readonly (readonly [number, number])[]): BufferGeometry {
  const pos: number[] = [];
  const h = ROUTE_WIDTH / 2;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len === 0) continue;
    // unit normal in the ground plane
    const nx = (-dz / len) * h;
    const nz = (dx / len) * h;
    const p = [ax + nx, ax - nx, bx + nx, bx - nx];
    const q = [az + nz, az - nz, bz + nz, bz - nz];
    // two triangles per segment
    const v = [
      [p[0], q[0]], [p[1], q[1]], [p[2], q[2]],
      [p[1], q[1]], [p[3], q[3]], [p[2], q[2]],
    ];
    for (const [x, z] of v) pos.push(x, ROUTE_Y, z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

export function WarehouseRoofs() {
  const selected = useTwinStore((s) => (s.selection?.info.kind === 'roof' ? s.selection.info.id : null));
  const hovered = useTwinStore((s) => (s.hover?.kind === 'roof' ? s.hover.id : null));
  const routeRoof = useTwinStore((s) => s.routeRoof);
  const excluded = useTwinStore((s) => s.excludedRoofs);

  const route = useMemo(() => (routeRoof && routeRoof === selected ? freightRouteFor(routeRoof) : null), [routeRoof, selected]);
  const routeGeo = useMemo(() => (route ? routeRibbon(route.points) : null), [route]);

  return (
    <group>
      {hovered && hovered !== selected && <RoofHighlight roofId={hovered} color="#ffffff" opacity={0.22} />}
      {selected && <RoofHighlight roofId={selected} color={excluded.includes(selected) ? '#8a93a3' : '#ffd60a'} opacity={0.5} />}
      {routeGeo && (
        <mesh geometry={routeGeo} raycast={noRaycast} renderOrder={6}>
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.9} depthWrite={false} side={DoubleSide} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
        </mesh>
      )}
    </group>
  );
}
