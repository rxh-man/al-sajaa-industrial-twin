import { STREETSCAPE } from './streetscapeData';

/**
 * EV charging bays: the first three bays of the first row in every other parking lot of the streetscape (lots
 * serve offices, shops and plots in the core). Positions come from the lot geometry, so chargers stand at the
 * back of real bays. A layout proposal for the demo, not an inventory of real chargers.
 */
export interface EvBay {
  /** bay centre */
  x: number;
  z: number;
  /** charger post at the back of the bay */
  px: number;
  pz: number;
  alongX: boolean;
}

export const EV_BAYS: EvBay[] = STREETSCAPE.lots.flatMap((l, li) => {
  if (li % 2 !== 0 || !l.rows.length) return [];
  const [a, b] = l.rows[0];
  const out: EvBay[] = [];
  for (let i = 0; i < 3; i++) {
    const along = (l.alongX ? l.x0 : l.z0) + 0.2 + i * l.pitch;
    if (along > (l.alongX ? l.x1 : l.z1) - 0.2) break;
    const mid = (a + b) / 2;
    if (l.alongX) out.push({ x: along, z: mid, px: along, pz: a + 0.05, alongX: true });
    else out.push({ x: mid, z: along, px: a + 0.05, pz: along, alongX: false });
  }
  return out;
});
