import { AD } from './abudhabi';

/**
 * Every named place in the combined world, derived from the same sources the map labels use
 * (AD.places and AD.labels). Names are de-duplicated here, so the locator and the labels agree.
 */
export interface IndexedPlace {
  name: string;
  x: number;
  z: number;
  kind: 'landmark' | 'area';
}

const seen = new Set<string>();
const out: IndexedPlace[] = [];
for (const p of AD.places) {
  if (seen.has(p.n)) continue;
  seen.add(p.n);
  out.push({ name: p.n.replace(' / The Mall', ' Mall'), x: p.x, z: p.z, kind: 'landmark' });
}
for (const l of AD.labels) {
  if (seen.has(l.n)) continue;
  seen.add(l.n);
  out.push({ name: l.n, x: l.x, z: l.z, kind: 'area' });
}

export const PLACES: IndexedPlace[] = out.sort((a, b) => a.name.localeCompare(b.name));

/** centre and radius that frame every place; the radius is the larger span plus a margin */
export function allPlacesFrame() {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of PLACES) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.max(x1 - x0, z1 - z0) * 0.9 + 10 };
}
