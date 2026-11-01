import { STREETSCAPE } from './streetscapeData';

/**
 * Parking-lot furniture derived from the lot geometry (same bay grid the streetscape parks cars on):
 *  - a wheel stop at the back of every bay (cars park nose-in toward the aisle; even rows face +, odd rows −);
 *  - accessible bays: in every odd-numbered lot, bays 0 and 2 of the first row, with bay 1 kept empty as the
 *    hatched access aisle (the streetscape leaves it clear);
 *  - one parking sign per lot at its first corner.
 */
export interface BayMark {
  x: number;
  z: number;
  alongX: boolean;
}

const bayCentres = (l: (typeof STREETSCAPE.lots)[number]) => {
  const from = (l.alongX ? l.x0 : l.z0) + 0.25;
  const to = (l.alongX ? l.x1 : l.z1) - 0.25;
  const out: number[] = [];
  for (let q = from; q + l.pitch <= to + 1e-9; q += l.pitch) out.push(q + l.pitch / 2);
  return out;
};

export const WHEEL_STOPS: BayMark[] = STREETSCAPE.lots.flatMap((l) =>
  l.rows.flatMap(([r0, r1], ri) => {
    const back = ri % 2 === 0 ? r0 + 0.08 : r1 - 0.08;
    return bayCentres(l).map((c) => (l.alongX ? { x: c, z: back, alongX: true } : { x: back, z: c, alongX: false }));
  }),
);

export const ACCESSIBLE: (BayMark & { aisle: boolean })[] = STREETSCAPE.lots.flatMap((l, li) => {
  if (li % 2 !== 1 || !l.rows.length) return [];
  const [r0, r1] = l.rows[0];
  const mid = (r0 + r1) / 2;
  return bayCentres(l)
    .slice(0, 3)
    .map((c, i) => ({ ...(l.alongX ? { x: c, z: mid, alongX: true } : { x: mid, z: c, alongX: false }), aisle: i === 1 }));
});

export const PARKING_SIGNS: { x: number; z: number }[] = STREETSCAPE.lots.map((l) => ({ x: l.x0 + 0.08, z: l.z0 + 0.08 }));
