import { AD } from '../data/abudhabi';
import { districtAt } from './districts';

/**
 * Facility-level energy, emissions, water and traffic model for every industrial building in the twin.
 *
 * Each industrial building is given a category (deterministically, from its name in the city data and a stable
 * hash of its id), a capacity utilisation, operating hours and mitigation equipment. Its annual electricity and
 * fuel use follow from its floor area and the category's energy intensity; CO₂ follows from documented emission
 * factors. All intensities and factors are ILLUSTRATIVE planning assumptions (order-of-magnitude values of the
 * kind found in published benchmark tables), not measurements or a real emissions register.
 */

export type FuelId = 'gas' | 'diesel' | 'lpg';

/** kg CO₂ per kWh of fuel burned (assumption, typical published factors; verify against the official inventory) */
export const FUEL_KG_PER_KWH: Record<FuelId, number> = { gas: 0.184, diesel: 0.267, lpg: 0.214 };
export const FUEL_LABEL: Record<FuelId, string> = { gas: 'natural gas', diesel: 'diesel', lpg: 'LPG' };
/** kg CO₂ per kWh of grid electricity (assumption; the same default as the climate panel) */
export const GRID_KG_PER_KWH = 0.45;

export interface Category {
  id: string;
  label: string;
  labelAr: string;
  group: 'factory' | 'workshop' | 'logistics' | 'storage';
  /** electricity, kWh per m² of floor per year at full utilisation */
  elecKwhM2: number;
  /** fuel burned on site, kWh per m² per year at full utilisation */
  fuelKwhM2: number;
  fuel: FuelId;
  /** process CO₂ (not from energy), kg per m² per year at full utilisation */
  processKgM2: number;
  hoursPerDay: number;
  daysPerWeek: number;
  /** water, litres per m² per day */
  waterLM2Day: number;
  /** truck movements per day per 1000 m² */
  trucksPer1000M2: number;
  /** workers per 1000 m² */
  workersPer1000M2: number;
  /** relative local-pollutant indices 0–1 before mitigation */
  pm: number;
  nox: number;
}

export const CATEGORIES: Category[] = [
  { id: 'heavy', label: 'Heavy manufacturing', labelAr: 'تصنيع ثقيل', group: 'factory', elecKwhM2: 250, fuelKwhM2: 400, fuel: 'gas', processKgM2: 20, hoursPerDay: 24, daysPerWeek: 6, waterLM2Day: 6, trucksPer1000M2: 3, workersPer1000M2: 12, pm: 0.8, nox: 0.9 },
  { id: 'metal', label: 'Metal fabrication', labelAr: 'تشكيل المعادن', group: 'factory', elecKwhM2: 180, fuelKwhM2: 150, fuel: 'gas', processKgM2: 0, hoursPerDay: 16, daysPerWeek: 6, waterLM2Day: 2, trucksPer1000M2: 2, workersPer1000M2: 15, pm: 0.7, nox: 0.5 },
  { id: 'food', label: 'Food processing', labelAr: 'تصنيع الأغذية', group: 'factory', elecKwhM2: 220, fuelKwhM2: 250, fuel: 'gas', processKgM2: 0, hoursPerDay: 20, daysPerWeek: 7, waterLM2Day: 25, trucksPer1000M2: 3.5, workersPer1000M2: 18, pm: 0.2, nox: 0.4 },
  { id: 'packaging', label: 'Packaging', labelAr: 'التغليف', group: 'factory', elecKwhM2: 160, fuelKwhM2: 60, fuel: 'gas', processKgM2: 0, hoursPerDay: 16, daysPerWeek: 6, waterLM2Day: 3, trucksPer1000M2: 2.5, workersPer1000M2: 14, pm: 0.3, nox: 0.2 },
  { id: 'chemical', label: 'Chemical processing', labelAr: 'معالجة كيميائية', group: 'factory', elecKwhM2: 300, fuelKwhM2: 500, fuel: 'gas', processKgM2: 40, hoursPerDay: 24, daysPerWeek: 7, waterLM2Day: 15, trucksPer1000M2: 2, workersPer1000M2: 8, pm: 0.5, nox: 0.9 },
  { id: 'materials', label: 'Building materials', labelAr: 'مواد البناء', group: 'factory', elecKwhM2: 150, fuelKwhM2: 300, fuel: 'diesel', processKgM2: 80, hoursPerDay: 12, daysPerWeek: 6, waterLM2Day: 8, trucksPer1000M2: 5, workersPer1000M2: 10, pm: 1, nox: 0.7 },
  { id: 'plastics', label: 'Plastics and polymers', labelAr: 'البلاستيك والبوليمرات', group: 'factory', elecKwhM2: 280, fuelKwhM2: 80, fuel: 'gas', processKgM2: 0, hoursPerDay: 24, daysPerWeek: 6, waterLM2Day: 5, trucksPer1000M2: 2, workersPer1000M2: 10, pm: 0.3, nox: 0.3 },
  { id: 'automotive', label: 'Automotive assembly', labelAr: 'تجميع السيارات', group: 'factory', elecKwhM2: 140, fuelKwhM2: 60, fuel: 'gas', processKgM2: 0, hoursPerDay: 12, daysPerWeek: 6, waterLM2Day: 3, trucksPer1000M2: 1.5, workersPer1000M2: 20, pm: 0.3, nox: 0.3 },
  { id: 'recycling', label: 'Recycling and waste processing', labelAr: 'إعادة التدوير', group: 'factory', elecKwhM2: 120, fuelKwhM2: 120, fuel: 'diesel', processKgM2: 0, hoursPerDay: 12, daysPerWeek: 6, waterLM2Day: 4, trucksPer1000M2: 4, workersPer1000M2: 10, pm: 0.8, nox: 0.5 },
  { id: 'workshop', label: 'Workshop (repair, welding, carpentry)', labelAr: 'ورشة', group: 'workshop', elecKwhM2: 90, fuelKwhM2: 20, fuel: 'diesel', processKgM2: 0, hoursPerDay: 10, daysPerWeek: 6, waterLM2Day: 1, trucksPer1000M2: 0.8, workersPer1000M2: 15, pm: 0.3, nox: 0.2 },
  { id: 'logistics', label: 'Logistics and distribution', labelAr: 'لوجستيات وتوزيع', group: 'logistics', elecKwhM2: 70, fuelKwhM2: 40, fuel: 'diesel', processKgM2: 0, hoursPerDay: 18, daysPerWeek: 7, waterLM2Day: 0.5, trucksPer1000M2: 6, workersPer1000M2: 6, pm: 0.1, nox: 0.4 },
  { id: 'cold', label: 'Cold storage', labelAr: 'تخزين مبرد', group: 'logistics', elecKwhM2: 350, fuelKwhM2: 20, fuel: 'diesel', processKgM2: 0, hoursPerDay: 24, daysPerWeek: 7, waterLM2Day: 1, trucksPer1000M2: 4, workersPer1000M2: 5, pm: 0.05, nox: 0.3 },
  { id: 'depot', label: 'Truck depot and yard', labelAr: 'مستودع شاحنات', group: 'logistics', elecKwhM2: 30, fuelKwhM2: 200, fuel: 'diesel', processKgM2: 0, hoursPerDay: 18, daysPerWeek: 7, waterLM2Day: 0.3, trucksPer1000M2: 10, workersPer1000M2: 3, pm: 0.4, nox: 0.8 },
  { id: 'fuel-storage', label: 'Fuel and tank storage', labelAr: 'تخزين الوقود', group: 'storage', elecKwhM2: 20, fuelKwhM2: 10, fuel: 'diesel', processKgM2: 5, hoursPerDay: 24, daysPerWeek: 7, waterLM2Day: 0.2, trucksPer1000M2: 3, workersPer1000M2: 2, pm: 0.1, nox: 0.1 },
];
export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/** factory halls take one of the factory categories, weighted (share of the district's halls, assumption) */
const FACTORY_MIX: [string, number][] = [
  ['metal', 0.18],
  ['heavy', 0.12],
  ['food', 0.12],
  ['packaging', 0.12],
  ['materials', 0.12],
  ['plastics', 0.12],
  ['automotive', 0.08],
  ['recycling', 0.08],
  ['chemical', 0.06],
];
const WORKSHOP_TRADES = ['Auto repair', 'Welding', 'Carpentry', 'Electrical', 'Spare parts', 'Equipment rental', 'Small manufacturing', 'Service centre'];

export type Mitigation = 'none' | 'dust filters' | 'low-NOx burners' | 'filters + low-NOx';
const MITIGATION_CUT: Record<Mitigation, { pm: number; nox: number }> = {
  none: { pm: 0, nox: 0 },
  'dust filters': { pm: 0.6, nox: 0 },
  'low-NOx burners': { pm: 0, nox: 0.4 },
  'filters + low-NOx': { pm: 0.6, nox: 0.4 },
};

export function hash01(n: number, k: number) {
  let s = (Math.imul(n + 1, 2654435761) ^ Math.imul(k + 7, 40503)) >>> 0;
  s ^= s >>> 13;
  s = Math.imul(s, 1274126177) >>> 0;
  s ^= s >>> 16;
  return (s >>> 0) / 4294967296;
}

export interface Facility {
  id: number;
  name: string;
  category: Category;
  /** workshop trade or a sub-label where useful */
  trade?: string;
  district: string;
  x: number;
  z: number;
  /** footprint boxes (scene units) for highlighting */
  boxes: [number, number, number, number][];
  top: number;
  floorM2: number;
  utilisation: number;
  hoursPerDay: number;
  mitigation: Mitigation;
  elecMWh: number;
  fuelMWh: number;
  co2T: number;
  co2Parts: { electricity: number; fuel: number; process: number };
  /** relative local-pollutant indices after mitigation (0–1 per unit floor, scaled by size) */
  pmIdx: number;
  noxIdx: number;
  waterM3Day: number;
  trucksDay: number;
  workers: number;
}

const BY_NAME: Record<string, string | ((id: number) => string)> = {
  'Factory hall': (id) => {
    const r = hash01(id, 1);
    let acc = 0;
    for (const [c, w] of FACTORY_MIX) {
      acc += w;
      if (r < acc) return c;
    }
    return 'metal';
  },
  Workshop: 'workshop',
  'Workshop block': 'workshop',
  'Logistics warehouse': (id) => (hash01(id, 2) < 0.15 ? 'cold' : 'logistics'),
  Warehouse: 'logistics',
  'Truck depot': 'depot',
  'Container yard': 'depot',
  Plant: 'materials',
  'Tank farm': 'fuel-storage',
};

export const INDUSTRIAL_NAMES = Object.keys(BY_NAME);

function buildFacilities(gridKg = GRID_KG_PER_KWH): Facility[] {
  const out: Facility[] = [];
  for (const b of AD.buildings) {
    const rule = BY_NAME[b.n];
    if (!rule || !b.b.length) continue;
    const cat = CATEGORY_BY_ID.get(typeof rule === 'string' ? rule : rule(b.id))!;
    const footprint = b.b.reduce((a, [x0, z0, x1, z1]) => a + Math.abs(x1 - x0) * Math.abs(z1 - z0) * 100, 0);
    // industrial halls are high single-storey; anything taller than ~15 m gets a mezzanine level
    const floorM2 = footprint * (b.h > 1.5 ? 2 : 1);
    const utilisation = 0.55 + 0.45 * hash01(b.id, 3);
    const hoursPerDay = Math.max(6, Math.min(24, Math.round(cat.hoursPerDay * (0.8 + 0.4 * hash01(b.id, 4)))));
    const hoursFactor = hoursPerDay / cat.hoursPerDay;
    const m = hash01(b.id, 5);
    const mitigation: Mitigation = cat.group !== 'factory' ? 'none' : m < 0.45 ? 'none' : m < 0.7 ? 'dust filters' : m < 0.85 ? 'low-NOx burners' : 'filters + low-NOx';
    const load = utilisation * hoursFactor;
    const elecMWh = (floorM2 * cat.elecKwhM2 * load) / 1000;
    const fuelMWh = (floorM2 * cat.fuelKwhM2 * load) / 1000;
    const parts = {
      electricity: elecMWh * gridKg,
      fuel: fuelMWh * FUEL_KG_PER_KWH[cat.fuel],
      process: (floorM2 * cat.processKgM2 * utilisation) / 1000,
    };
    const cut = MITIGATION_CUT[mitigation];
    const size = floorM2 / 1000;
    const [cx, cz] = b.c;
    out.push({
      id: b.id,
      name: b.n,
      category: cat,
      trade: cat.id === 'workshop' ? WORKSHOP_TRADES[Math.floor(hash01(b.id, 6) * WORKSHOP_TRADES.length)] : undefined,
      district: districtAt(cx, cz).id,
      x: cx,
      z: cz,
      boxes: b.b as [number, number, number, number][],
      top: (b.y ?? 0) + b.h,
      floorM2,
      utilisation,
      hoursPerDay,
      mitigation,
      elecMWh,
      fuelMWh,
      co2T: parts.electricity + parts.fuel + parts.process,
      co2Parts: parts,
      pmIdx: cat.pm * (1 - cut.pm) * size * load,
      noxIdx: cat.nox * (1 - cut.nox) * size * load,
      waterM3Day: (floorM2 * cat.waterLM2Day * utilisation) / 1000,
      trucksDay: size * cat.trucksPer1000M2 * utilisation,
      workers: size * cat.workersPer1000M2,
    });
  }
  return out;
}

export const FACILITIES: Facility[] = buildFacilities();
/** recompute with a different grid factor (the dashboard's input) */
export const facilitiesWithGrid = (gridKg: number) => (gridKg === GRID_KG_PER_KWH ? FACILITIES : buildFacilities(gridKg));
