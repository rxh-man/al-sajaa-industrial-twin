import { findSites, reserveSites, type Site } from '../sustainability/development';
import { hash01 } from '../sustainability/facilities';

/**
 * Commercial, residential and public infill on vacant, road-accessible land in the mixed districts (the same
 * siting rules as the development simulator: clear of roads, buildings, lots and rail). Each type has its own
 * footprint, height and features. A layout proposal, not survey data; not part of the emissions model.
 */
export type InfillKind = 'office' | 'shops' | 'cafe' | 'fuel' | 'showroom' | 'apartments' | 'townhouses' | 'park';
export interface Infill extends Site {
  kind: InfillKind;
  h: number;
  id: number;
}

const PLAN: { district: string; size: 'small' | 'medium'; count: number; kinds: InfillKind[] }[] = [
  { district: 'central', size: 'small', count: 14, kinds: ['cafe', 'shops', 'fuel', 'office', 'park', 'showroom', 'shops'] },
  { district: 'rahmaniya', size: 'small', count: 12, kinds: ['apartments', 'townhouses', 'park', 'shops', 'cafe', 'apartments'] },
  { district: 'east-res', size: 'small', count: 10, kinds: ['townhouses', 'apartments', 'park', 'cafe', 'fuel'] },
  { district: 'north-mixed', size: 'medium', count: 6, kinds: ['office', 'showroom', 'fuel'] },
];
const HEIGHT: Record<InfillKind, [number, number]> = { office: [2.4, 4.2], shops: [0.45, 0.6], cafe: [0.35, 0.45], fuel: [0.5, 0.5], showroom: [0.7, 0.9], apartments: [1.8, 3], townhouses: [0.8, 1], park: [0, 0] };

export const INFILL: Infill[] = PLAN.flatMap((p, pi) =>
  findSites(p.district, p.size, p.count).map((s, i) => {
    const kind = p.kinds[i % p.kinds.length];
    const id = pi * 100 + i;
    const [h0, h1] = HEIGHT[kind];
    return { ...s, kind, id, h: h0 + (h1 - h0) * hash01(id, 7) };
  }),
);
reserveSites(INFILL);
