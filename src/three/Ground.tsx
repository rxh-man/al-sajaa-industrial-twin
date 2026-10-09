import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, Mesh, PlaneGeometry } from 'three';
import { DIORAMA, RIVER } from '../data/city';
import { onLand } from '../data/abudhabi';
import { TRENCH } from '../data/incident';
import { live } from '../simulation/runtime';
import { useTwinStore } from '../store/useTwinStore';
import { createAsphaltMaterial, createPropMaterial, createSoilMaterial, createUndersideMaterial } from './materials/surfaceMaterials';

/** Stops pointer events from reaching underground assets while the surface is opaque. */
export function blockIfSolid(e: ThreeEvent<PointerEvent | MouseEvent>) {
  if (live.xray > 0.5 || live.exploded > 0.3) return;
  const p = e.point;
  if (live.trench > 0.5 && p.x > TRENCH.minX && p.x < TRENCH.maxX && p.z > TRENCH.minZ && p.z < TRENCH.maxZ) return;
  e.stopPropagation();
}

const W = DIORAMA.maxX - DIORAMA.minX;
const D = DIORAMA.maxZ - DIORAMA.minZ;
const CX = (DIORAMA.minX + DIORAMA.maxX) / 2;
const CZ = (DIORAMA.minZ + DIORAMA.maxZ) / 2;

/** Vertical quads along a polyline (x, z) between two heights; faces right of the walking direction. */
export function wall(points: [number, number][], y0: number, y1: number) {
  const pos: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    pos.push(ax, y0, az, bx, y1, bz, bx, y0, bz, ax, y0, az, ax, y1, az, bx, y1, bz);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * The cut faces of the slab. Along each edge, land shows soil from the bottom up to
 * street level; where the edge runs through the sea, soil stops at the sea bed.
 */
export function Diorama() {
  const soil = useMemo(() => createSoilMaterial(), []);
  const bed = useMemo(() => createPropMaterial({ color: '#0d1114', roughness: 1 }), []);
  const water = useMemo(() => createPropMaterial({ color: '#0e4652', roughness: 0.2, metalness: 0.2, opacity: 0.7, emissive: '#06303a', emissiveIntensity: 0.6 }), []);
  const B = DIORAMA.bottom;
  const { faces, waterFaces } = useMemo(() => {
    const out: BufferGeometry[] = [];
    const wet: BufferGeometry[] = [];
    const edges: [number, number, number, number][] = [
      [DIORAMA.minX, DIORAMA.minZ, DIORAMA.maxX, DIORAMA.minZ],
      [DIORAMA.maxX, DIORAMA.minZ, DIORAMA.maxX, DIORAMA.maxZ],
      [DIORAMA.maxX, DIORAMA.maxZ, DIORAMA.minX, DIORAMA.maxZ],
      [DIORAMA.minX, DIORAMA.maxZ, DIORAMA.minX, DIORAMA.minZ],
    ];
    const step = 0.5;
    for (const [ax, az, bx, bz] of edges) {
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.ceil(L / step);
      let runStart = 0;
      let runLand = onLand(ax + (bx - ax) * 0.001, az + (bz - az) * 0.001);
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const land = i < n ? onLand(ax + (bx - ax) * t, az + (bz - az) * t) : !runLand;
        if (land !== runLand || i === n) {
          const t0 = runStart / n;
          const p0: [number, number] = [ax + (bx - ax) * t0, az + (bz - az) * t0];
          const p1: [number, number] = [ax + (bx - ax) * t, az + (bz - az) * t];
          out.push(wall([p0, p1], B, runLand ? 0 : RIVER.bed));
          if (!runLand) wet.push(wall([p0, p1], RIVER.bed, RIVER.level));
          runStart = i;
          runLand = land;
        }
      }
    }
    return { faces: out, waterFaces: wet };
  }, [B]);

  return (
    <group>
      {faces.map((g, i) => (
        <mesh key={i} geometry={g} material={soil} />
      ))}
      {waterFaces.map((g, i) => (
        <mesh key={`w${i}`} geometry={g} material={water} />
      ))}
      {/* bottom of the slab */}
      <mesh rotation-x={Math.PI / 2} position={[CX, B, CZ]} material={bed}>
        <planeGeometry args={[W, D]} />
      </mesh>
    </group>
  );
}

export function Ground() {
  const asphalt = useMemo(() => createAsphaltMaterial(), []);
  const underside = useMemo(() => createUndersideMaterial(), []);
  const groundGeo = useMemo(() => new PlaneGeometry(W, D, 1, 1), []);
  const select = useTwinStore((s) => s.select);
  const undersideRef = useRef<Mesh>(null);

  useFrame(() => {
    if (undersideRef.current) undersideRef.current.visible = live.xray < 0.98 && live.exploded < 0.98;
  });

  return (
    <group>
      <mesh
        geometry={groundGeo}
        rotation-x={-Math.PI / 2}
        position={[CX, 0, CZ]}
        material={asphalt}
        receiveShadow
        onPointerMove={blockIfSolid}
        onClick={(e) => {
          if (e.delta > 4) return;
          blockIfSolid(e);
        }}
        onDoubleClick={() => select(null)}
      />
      <mesh ref={undersideRef} rotation-x={Math.PI / 2} position={[CX, -0.04, (DIORAMA.minZ + RIVER.minZ) / 2]} material={underside}>
        <planeGeometry args={[W, RIVER.minZ - DIORAMA.minZ]} />
      </mesh>
    </group>
  );
}
