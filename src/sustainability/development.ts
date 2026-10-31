import { AD, LAGOONS } from '../data/abudhabi';
import { inRailEnvelope } from '../data/railLayout';
import { inBuilding, kerbDistance } from '../data/spatial';
import { STREETSCAPE } from '../data/streetscapeData';
import { DISTRICTS } from './districts';
import { CATEGORY_BY_ID, FUEL_KG_PER_KWH, type Category } from './facilities';
import { FLEET, snapshot, BASE_LEVERS, type Snapshot } from './model';
import { ASSUMPTIONS } from '../data/climateAgents';
import { PLANT_TYPES } from './green';

/**
 * "What happens if N new facilities are built in Al Sajaa?" — a forward-looking planning model.
 *
 * Proposed facilities are sited on genuinely vacant land in the chosen district: every candidate footprint is
 * tested against the city's carriageways, building footprints, parking lots and the rail corridor, and must have
 * road access. Their demand follows the same category model as the existing facilities; the result compares the
 * existing city, the city with the development, and the city with the development plus mitigation.
 */

export const SIZES = { small: { w: 4, d: 3, label: '40 × 30 m' }, medium: { w: 6, d: 4, label: '60 × 40 m' }, large: { w: 9, d: 6, label: '90 × 60 m' } } as const;
export type SizeId = keyof typeof SIZES;

export interface DevInputs {
  category: string;
  count: number;
  size: SizeId;
  district: string;
  /** operating intensity, share of the category's typical utilisation, 0.3–1.2 */
  intensity: number;
  /** operating hours per day */
  hours: number;
  /** multipliers on the category's energy and water intensity (1 = typical) */
  energyFactor: number;
  waterFactor: number;
  /** truck movements per day per facility; null = category default */
  trucksPerDay: number | null;
}

export const DEV_DEFAULTS: DevInputs = { category: 'metal', count: 15, size: 'medium', district: 'far-north', intensity: 0.85, hours: 16, energyFactor: 1, waterFactor: 1, trucksPerDay: null };

export interface Site {
  x: number;
  z: number;
  w: number;
  d: number;
}

const siteCache = new Map<string, Site[]>();

/** candidate sites in a district, scanned on a 1-unit grid in a fixed order (deterministic; cached) */
export function findSites(districtId: string, size: SizeId, count: number): Site[] {
  const k = `${districtId}|${size}|${count}`;
  const hit = siteCache.get(k);
  if (hit) return hit;
  const r = searchSites(districtId, size, count);
  siteCache.set(k, r);
  return r;
}

function searchSites(districtId: string, size: SizeId, count: number): Site[] {
  const d = DISTRICTS.find((q) => q.id === districtId);
  if (!d) throw new Error(`Unknown district "${districtId}".`);
  // the lagoon community is fully plotted (villas, water, lawns): no vacant land is modelled there
  if (districtId === 'lagoons') return [];
  const { w, d: dd } = SIZES[size];
  const lots = STREETSCAPE.lots;
  const taken: Site[] = [];
  // search inside the district, clipped to the modelled ground (the city rectangle, or the lagoon community)
  const R = districtId === 'lagoons' ? LAGOONS.meta.rect : AD.meta.rect;
  const x0 = Math.max(d.box[0], R.minX + 2);
  const x1 = Math.min(d.box[1], R.maxX - 2);
  const z0 = Math.max(d.box[2], R.minZ + 2);
  const z1 = Math.min(d.box[3], R.maxZ - 2);
  const clearOf = (x: number, z: number) => {
    // sample the footprint (corners, edges, centre) with a margin for a fence line
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 4; j++) {
        const px = x - w / 2 - 0.4 + ((w + 0.8) * i) / 4;
        const pz = z - dd / 2 - 0.4 + ((dd + 0.8) * j) / 4;
        if (kerbDistance(px, pz, 2) < 0.3) return false;
        if (inBuilding(px, pz, 0.2)) return false;
        if (inRailEnvelope(px, pz, 1.5)) return false;
      }
    for (const v of STREETSCAPE.villas) if (x + w / 2 > v.b[0] - 0.5 && x - w / 2 < v.b[2] + 0.5 && z + dd / 2 > v.b[1] - 0.5 && z - dd / 2 < v.b[3] + 0.5) return false;
    for (const l of lots) if (x + w / 2 > l.x0 - 0.3 && x - w / 2 < l.x1 + 0.3 && z + dd / 2 > l.z0 - 0.3 && z - dd / 2 < l.z1 + 0.3) return false;
    for (const t of taken) if (Math.abs(t.x - x) < (t.w + w) / 2 + 1 && Math.abs(t.z - z) < (t.d + dd) / 2 + 1) return false;
    return true;
  };
  for (let z = z0 + dd / 2 + 1; z <= z1 - dd / 2 - 1 && taken.length < count; z += 1)
    for (let x = x0 + w / 2 + 1; x <= x1 - w / 2 - 1 && taken.length < count; x += 1) {
      // road access: a carriageway within 2.5 units (25 m) of the plot edge
      if (kerbDistance(x, z, w / 2 + 3) > Math.max(w, dd) / 2 + 2.5) continue;
      if (clearOf(x, z)) taken.push({ x, z, w, d: dd });
    }
  return taken;
}

export interface DevState {
  label: string;
  co2T: number;
  elecMWh: number;
  waterM3Day: number;
  vehKmDay: number;
  trucksDay: number;
  parking: number;
  trees: number;
}

export function runDevelopment(inp: DevInputs) {
  const cat: Category | undefined = CATEGORY_BY_ID.get(inp.category);
  if (!cat || cat.group === 'storage') throw new Error(`Category "${inp.category}" is not available for new development.`);
  if (!SIZES[inp.size]) throw new Error(`Unknown size "${inp.size}".`);
  const count = Math.round(Math.min(40, Math.max(1, inp.count)));
  const intensity = Math.min(1.2, Math.max(0.3, inp.intensity));
  const hours = Math.min(24, Math.max(4, inp.hours));
  const sites = findSites(inp.district, inp.size, count);
  const { w, d } = SIZES[inp.size];
  const floorM2 = w * d * 100;
  const load = intensity * (hours / cat.hoursPerDay);
  const per = {
    elecMWh: (floorM2 * cat.elecKwhM2 * inp.energyFactor * load) / 1000,
    fuelMWh: (floorM2 * cat.fuelKwhM2 * inp.energyFactor * load) / 1000,
    processT: (floorM2 * cat.processKgM2 * intensity) / 1000,
    waterM3Day: (floorM2 * cat.waterLM2Day * inp.waterFactor * intensity) / 1000,
    trucksDay: inp.trucksPerDay ?? (floorM2 / 1000) * cat.trucksPer1000M2 * intensity,
    workers: (floorM2 / 1000) * cat.workersPer1000M2,
  };
  const n = sites.length;
  const base: Snapshot = snapshot(BASE_LEVERS);
  const grid = BASE_LEVERS.gridKg;
  // each worker commutes 2 trips × 20 km at 80 % car share; each truck movement 15 km (assumptions)
  const carKmDay = per.workers * 0.8 * 2 * 20;
  const truckKmDay = per.trucksDay * 15;
  const car = FLEET.find((f) => f.id === 'car')!;
  const hgv = FLEET.find((f) => f.id === 'hgv')!;
  const parking = Math.ceil(per.workers * 0.8 * 1.1) + Math.ceil(per.trucksDay / 4);

  const develop = (mitigated: boolean) => {
    // mitigation package (assumption): rooftop PV on 60 % of the roof, 30 % of fuel electrified, 30 % electric
    // trucks, 30 % process water reused, trees for a 15 % canopy over the plot and its frontage
    const pvMWh = mitigated ? (floorM2 * 0.6 * ASSUMPTIONS.kwpPerM2.v * ASSUMPTIONS.yieldKwhPerKwp.v) / 1000 : 0;
    const fuel = per.fuelMWh * (mitigated ? 0.7 : 1);
    const elec = per.elecMWh + (mitigated ? (per.fuelMWh * 0.3) / 1.5 : 0);
    const gridElec = Math.max(0, elec - pvMWh);
    const eTruck = mitigated ? 0.3 : 0;
    const trucksCo2 = (truckKmDay * 365 * ((1 - eTruck) * hgv.kgKm + eTruck * 1.3 * grid)) / 1000;
    const carsCo2 = (carKmDay * 365 * car.kgKm) / 1000;
    const trees = mitigated ? Math.ceil((floorM2 * 2 * 0.15) / (Math.PI * PLANT_TYPES.shade.crownM ** 2)) : 0;
    const co2 = gridElec * grid + fuel * FUEL_KG_PER_KWH[cat.fuel] + per.processT + trucksCo2 + carsCo2 - (trees * PLANT_TYPES.shade.co2Kg) / 1000;
    const water = per.waterM3Day * (mitigated ? 0.7 : 1) + (trees * PLANT_TYPES.shade.litresDay) / 1000;
    return { co2, elec, water, trees, pvMWh };
  };
  const plain = develop(false);
  const mit = develop(true);
  const states: DevState[] = [
    { label: 'Existing city', co2T: base.carbon.netT, elecMWh: base.energy.demandMWh, waterM3Day: base.water.totalM3Day, vehKmDay: base.traffic.vehKmYear / 365, trucksDay: base.facilities.reduce((a, f) => a + f.trucksDay, 0), parking: 0, trees: base.green.total },
    { label: `+ ${n} new ${cat.label.toLowerCase()} facilities`, co2T: base.carbon.netT + n * plain.co2, elecMWh: base.energy.demandMWh + n * plain.elec, waterM3Day: base.water.totalM3Day + n * plain.water, vehKmDay: base.traffic.vehKmYear / 365 + n * (carKmDay + truckKmDay), trucksDay: base.facilities.reduce((a, f) => a + f.trucksDay, 0) + n * per.trucksDay, parking: n * parking, trees: base.green.total },
    { label: '+ development with mitigation', co2T: base.carbon.netT + n * mit.co2, elecMWh: base.energy.demandMWh + n * mit.elec, waterM3Day: base.water.totalM3Day + n * mit.water, vehKmDay: base.traffic.vehKmYear / 365 + n * (carKmDay + truckKmDay), trucksDay: base.facilities.reduce((a, f) => a + f.trucksDay, 0) + n * per.trucksDay, parking: n * parking, trees: base.green.total + n * mit.trees },
  ];
  const districtName = DISTRICTS.find((q) => q.id === inp.district)!.name;
  const warnings: string[] = [];
  if (inp.district === 'lagoons') warnings.push('Al Sajaa Lagoons is a fully plotted residential community: no vacant land is modelled there.');
  else if (n < count) warnings.push(`Only ${n} of ${count} sites of ${SIZES[inp.size].label} fit on vacant, road-accessible land in ${districtName}.`);
  if (cat.group === 'factory' && ['lagoons', 'east-res', 'rahmaniya'].includes(inp.district)) warnings.push(`${districtName} is residential: a ${cat.label.toLowerCase()} use there is likely unsuitable (noise, trucks, emissions near homes).`);
  if (cat.pm >= 0.7) warnings.push(`${cat.label} is a high-dust category: dust filters should be a planning condition.`);
  return {
    inputs: { ...inp, count, intensity, hours },
    category: cat,
    sites,
    perFacility: { ...per, floorM2, parking, carKmDay, truckKmDay, co2T: plain.co2, co2MitT: mit.co2, treesMit: mit.trees, pvMWh: mit.pvMWh },
    states,
    warnings,
    assumptions: [
      `Each facility: ${SIZES[inp.size].label} single-storey (${floorM2.toLocaleString('en-US')} m²), ${cat.label.toLowerCase()} energy, water and truck intensities, ${Math.round(intensity * 100)} % utilisation, ${hours} h/day.`,
      'Commuting: 80 % of workers drive, 2 trips × 20 km a day; trucks 15 km per movement. Parking: one space per driving worker + 10 %, plus truck bays.',
      'Mitigation package: rooftop PV on 60 % of the roof, 30 % of fuel use electrified, 30 % electric trucks, 30 % process water reused, trees for 15 % canopy over the plot and frontage.',
      'Sites must clear carriageways, buildings, parking lots and the rail corridor and lie within 25 m of a road; no zoning, ownership or utility capacity data is used.',
    ],
  };
}

export type DevResult = ReturnType<typeof runDevelopment>;
