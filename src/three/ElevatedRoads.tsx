import { useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { AD } from '../data/abudhabi';
import { DECK_Y, isElevated } from './AbuDhabiTraffic';

/** Raised highways: a deck over each flyover, loop and ramp, with piers down to the ground. */
const DECK_HALF_W = 1.25; // 12.5 m deck, roughly two lanes each way on the flyover
const PIER_EVERY = 4.5;   // scene units between piers (45 m)
const PIER_W = 0.5;
const PIER_TOP = DECK_Y - 0.06;

type XZ = [number, number];

function ribbon(pts: XZ[], hw: number, y: number) {
  const pos: number[] = [];
  const n = pts.length;
  const nrm: XZ[] = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    return [-dz / L, dx / L];
  });
  for (let i = 0; i < n - 1; i++) {
    const L = [pts[i][0] + nrm[i][0] * hw, pts[i][1] + nrm[i][1] * hw];
    const R = [pts[i][0] - nrm[i][0] * hw, pts[i][1] - nrm[i][1] * hw];
    const L2 = [pts[i + 1][0] + nrm[i + 1][0] * hw, pts[i + 1][1] + nrm[i + 1][1] * hw];
    const R2 = [pts[i + 1][0] - nrm[i + 1][0] * hw, pts[i + 1][1] - nrm[i + 1][1] * hw];
    pos.push(L[0], y, L[1], R[0], y, R[1], L2[0], y, L2[1]);
    pos.push(R[0], y, R[1], R2[0], y, R2[1], L2[0], y, L2[1]);
  }
  return pos;
}

function piers(pts: XZ[], hw: number) {
  const out: XZ[] = [];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const seg = Math.hypot(bx - ax, bz - az);
    let t = PIER_EVERY - carry;
    while (t <= seg) {
      const f = t / seg;
      const x = ax + (bx - ax) * f;
      const z = az + (bz - az) * f;
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / L;
      const nz = (bx - ax) / L;
      out.push([x + nx * hw, z + nz * hw], [x - nx * hw, z - nz * hw]);
      t += PIER_EVERY;
    }
    carry = seg - (t - PIER_EVERY);
  }
  return out;
}

export function ElevatedRoads() {
  const { decks, pierPts } = useMemo(() => {
    const decks: number[][] = [];
    const pierPts: XZ[] = [];
    for (const r of AD.roads) {
      if (!isElevated(r)) continue;
      const pts = r.p as XZ[];
      decks.push(ribbon(pts, DECK_HALF_W, DECK_Y));
      pierPts.push(...piers(pts, DECK_HALF_W + 0.2));
    }
    return { decks, pierPts };
  }, []);

  const deckGeo = useMemo(() => {
    const all = decks.flat();
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(all, 3));
    g.computeVertexNormals();
    return g;
  }, [decks]);

  return (
    <group>
      <mesh geometry={deckGeo}>
        <meshStandardMaterial color="#2c2e33" roughness={0.9} metalness={0} side={2} />
      </mesh>
      {pierPts.map(([x, z], i) => (
        <mesh key={i} position={[x, PIER_TOP / 2, z]}>
          <boxGeometry args={[PIER_W, PIER_TOP, PIER_W]} />
          <meshStandardMaterial color="#b9b3a7" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}
