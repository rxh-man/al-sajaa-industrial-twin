import { useMemo } from 'react';
import { BufferGeometry, CircleGeometry, DoubleSide, Float32BufferAttribute, MeshStandardMaterial, RingGeometry } from 'three';
import { INTERCHANGE, type AdRoad, type XZ } from '../data/abudhabi';

/**
 * The ground level of the Al Sajaa Interchange (scripts/build-interchange.py; procedural): the roundabout, the
 * slip ramps, the E611 where it runs on the ground, the Western Road and the link to the lagoons, drawn as road
 * ribbons with kerbs, edge lines and dashed centre or lane lines (most of it lies beyond the painted city
 * ground); and the landscaped centre island with its four green loops. The flyover deck is ElevatedRoads.tsx.
 */

const noRaycast = () => {};

function ribbon(roads: AdRoad[], half: (r: AdRoad) => number, y: number, offset = 0) {
  const pos: number[] = [];
  for (const r of roads) {
    const p = r.p as XZ[];
    const hw = half(r);
    const n = p.map((_, i) => {
      const a = p[Math.max(0, i - 1)];
      const b = p[Math.min(p.length - 1, i + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    });
    for (let i = 0; i < p.length - 1; i++) {
      const P = (j: number, s: number) => [p[j][0] + n[j][0] * (offset + s * hw), y, p[j][1] + n[j][1] * (offset + s * hw)];
      pos.push(...P(i, -1), ...P(i + 1, -1), ...P(i, 1), ...P(i, 1), ...P(i + 1, -1), ...P(i + 1, 1));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** dashed line along each road: short quads every `period`, at an offset from the centre line */
function dashes(roads: AdRoad[], off: (r: AdRoad) => number[], y: number, len = 0.3, period = 0.8, w = 0.03) {
  const pos: number[] = [];
  for (const r of roads) {
    const p = r.p as XZ[];
    let acc = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i];
      const [bx, bz] = p[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-6) continue;
      const tx = (bx - ax) / L;
      const tz = (bz - az) / L;
      for (let s = (period - (acc % period)) % period; s + len <= L; s += period) {
        for (const o of off(r)) {
          const cx = ax + tx * s - tz * o;
          const cz = az + tz * s + tx * o;
          const q = (a: number, b: number) => [cx + tx * a - tz * b, y, cz + tz * a + tx * b];
          pos.push(...q(0, -w / 2), ...q(len, -w / 2), ...q(0, w / 2), ...q(0, w / 2), ...q(len, -w / 2), ...q(len, w / 2));
        }
      }
      acc += L;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function Interchange() {
  const ground = useMemo(() => INTERCHANGE.roads.filter((r) => r.o !== 1), []);
  const geos = useMemo(() => {
    const lanesOf = (r: AdRoad) => r.l ?? (r.x === 1 ? 1 : 2);
    return {
      kerb: ribbon(ground, (r) => r.w / 2 + 0.16, 0.005),
      asphalt: ribbon(ground, (r) => r.w / 2, 0.008),
      lane: dashes(ground, (r) => {
        const n = lanesOf(r);
        if (r.x !== 1 && !r.l) return [0]; // two-way road: a dashed centre line
        return Array.from({ length: n - 1 }, (_, k) => -r.w / 2 + (r.w * (k + 1)) / n);
      }, 0.0095),
      edge: dashes(ground, (r) => [-(r.w / 2 - 0.04), r.w / 2 - 0.04], 0.0095, 0.8, 0.8, 0.025),
    };
  }, [ground]);
  const mats = useMemo(
    () => ({
      kerb: new MeshStandardMaterial({ color: '#9f998f', roughness: 0.9, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }),
      asphalt: new MeshStandardMaterial({ color: '#2e3035', roughness: 0.92, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      paint: new MeshStandardMaterial({ color: '#ebe8de', roughness: 0.6, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }),
      lawn: new MeshStandardMaterial({ color: '#5a8a3e', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }),
      lawn2: new MeshStandardMaterial({ color: '#6fa24c', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }),
      hedge: new MeshStandardMaterial({ color: '#3f6b2f', roughness: 0.95 }),
    }),
    [],
  );
  const { centre, island } = INTERCHANGE.meta;
  return (
    <group>
      <mesh geometry={geos.kerb} material={mats.kerb} receiveShadow raycast={noRaycast} />
      <mesh geometry={geos.asphalt} material={mats.asphalt} receiveShadow raycast={noRaycast} />
      <mesh geometry={geos.lane} material={mats.paint} raycast={noRaycast} />
      <mesh geometry={geos.edge} material={mats.paint} raycast={noRaycast} />
      {/* the centre island: a lawn edged by a low hedge ring, with four green loops */}
      <mesh position={[centre[0], 0.006, centre[1]]} rotation-x={-Math.PI / 2} material={mats.lawn} receiveShadow raycast={noRaycast} geometry={useMemo(() => new CircleGeometry(island, 64), [island])} />
      <mesh position={[centre[0], 0.03, centre[1]]} rotation-x={-Math.PI / 2} material={mats.hedge} raycast={noRaycast} geometry={useMemo(() => new RingGeometry(island - 0.18, island, 64), [island])} />
      {INTERCHANGE.loops.map((l) => (
        <group key={`${l.x}:${l.z}`}>
          <mesh position={[l.x, 0.008, l.z]} rotation-x={-Math.PI / 2} material={mats.lawn2} receiveShadow raycast={noRaycast}>
            <circleGeometry args={[l.r, 40]} />
          </mesh>
          <mesh position={[l.x, 0.03, l.z]} rotation-x={-Math.PI / 2} material={mats.hedge} raycast={noRaycast}>
            <ringGeometry args={[l.r - 0.12, l.r, 40]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
