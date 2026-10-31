import { AD } from '../data/abudhabi';
import { ASSUMPTIONS, WAREHOUSE_ROOF_RECORDS } from '../data/climateAgents';
import { DISTRICTS, districtAt } from './districts';
import { CATEGORIES, facilitiesWithGrid, FUEL_KG_PER_KWH, GRID_KG_PER_KWH, type Facility } from './facilities';
import { greenSummary, PLANT_TYPES, PLANTS } from './green';

/**
 * City-wide sustainability model: the modelled carbon balance (industry, buildings, road traffic, tree uptake),
 * water and energy, broken down by district, under a set of scenario levers. Deterministic; every quantity is an
 * estimate from the layout and documented assumptions, not a measurement.
 */

/* ---------- non-industrial buildings ---------- */

/** electricity, kWh per m² of floor per year (assumption: cooling-dominated Gulf buildings) */
const BUILDING_KWH_M2: Record<string, number> = { residential: 250, house: 250, office: 220, mall: 350, hotel: 300, school: 150, mosque: 120, building: 180 };
/** people per m² of residential floor (assumption: 30 m² per resident) and litres per person per day (assumption) */
const M2_PER_RESIDENT = 30;
const LITRES_PER_RESIDENT = 300;
const NON_INDUSTRIAL = new Set(['residential', 'house', 'office', 'mall', 'hotel', 'school', 'mosque']);

export const OTHER_BUILDINGS = AD.buildings
  .filter((b) => NON_INDUSTRIAL.has(b.k) && b.b.length)
  .map((b) => {
    const footprint = b.b.reduce((a, [x0, z0, x1, z1]) => a + Math.abs(x1 - x0) * Math.abs(z1 - z0) * 100, 0);
    const floors = Math.max(1, Math.round((b.h * 10) / 3.5));
    const floorM2 = footprint * floors;
    const residential = b.k === 'residential' || b.k === 'house';
    return { id: b.id, kind: b.k, x: b.c[0], z: b.c[1], floorM2, elecMWh: (floorM2 * (BUILDING_KWH_M2[b.k] ?? 180)) / 1000, residents: residential ? floorM2 / M2_PER_RESIDENT : 0, district: districtAt(b.c[0], b.c[1]).id };
  });

/* ---------- road traffic ---------- */

/** assumed average daily traffic per road class (vehicles/day, both directions; a divided carriageway carries half) */
export const AADT: Record<string, number> = { motorway: 60000, trunk: 25000, primary: 15000, secondary: 6000, tertiary: 3000, unclassified: 1500, residential: 800, living_street: 200, service: 300 };
/** fleet mix and CO₂ per vehicle-km (assumption, typical published factors) */
export const FLEET = [
  { id: 'car', label: 'Cars and SUVs', share: 0.7, kgKm: 0.18 },
  { id: 'van', label: 'Vans and pickups', share: 0.15, kgKm: 0.25 },
  { id: 'hgv', label: 'Heavy trucks', share: 0.15, kgKm: 0.85 },
];
const FLEET_KG_KM = FLEET.reduce((a, f) => a + f.share * f.kgKm, 0);

export const ROAD_TRAFFIC = AD.roads
  .filter((r) => AADT[r.c] !== undefined && !r.t)
  .map((r) => {
    let len = 0;
    for (let i = 1; i < r.p.length; i++) len += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
    const km = (len * 10) / 1000;
    const daily = AADT[r.c] * (r.x === 1 ? 0.5 : 1);
    const mid = r.p[Math.floor(r.p.length / 2)];
    return { name: r.n, cls: r.c, km, vehKmDay: km * daily, district: districtAt(mid[0], mid[1]).id, pts: r.p as [number, number][] };
  });

/* ---------- scenario levers ---------- */

export interface Levers {
  /** grid emission factor, kg/kWh */
  gridKg: number;
  /** share of eligible warehouse roof covered with PV, 0–1 */
  rooftopSolar: number;
  /** extra shade trees planted */
  newTrees: number;
  /** share of factories without abatement that get filters and low-NOx burners, 0–1 */
  abatement: number;
  /** share of on-site fuel switched to electricity, 0–1 */
  electrifyFuel: number;
  /** share of heavy trucks replaced by electric trucks, 0–1 */
  eTrucks: number;
  /** water reuse (treated greywater for irrigation and process), share of eligible demand, 0–1 */
  reuse: number;
}

export const BASE_LEVERS: Levers = { gridKg: GRID_KG_PER_KWH, rooftopSolar: 0, newTrees: 0, abatement: 0, electrifyFuel: 0, eTrucks: 0, reuse: 0 };

/** existing ground-mounted solar fields in the layout */
const SOLAR_FIELD_M2 = AD.buildings.filter((b) => b.n === 'Solar panel field').reduce((a, b) => a + b.b.reduce((s, [x0, z0, x1, z1]) => s + Math.abs(x1 - x0) * Math.abs(z1 - z0) * 100, 0), 0);
/** ground-mounted fields: panel area ~ 45 % of the land (assumption) */
const FIELD_KWP_PER_M2 = 0.45 * ASSUMPTIONS.kwpPerM2.v;

export function snapshot(lv: Levers = BASE_LEVERS) {
  const facilities: Facility[] = facilitiesWithGrid(lv.gridKg);
  // electrification: fuel energy moved to electricity at a heat-pump/electric-process efficiency of 1.5× (assumption)
  const ind = facilities.map((f) => {
    const fuelLeft = f.fuelMWh * (1 - lv.electrifyFuel);
    const elec = f.elecMWh + (f.fuelMWh * lv.electrifyFuel) / 1.5;
    const unabated = f.mitigation === 'none' && f.category.group === 'factory';
    return {
      f,
      elec,
      co2: elec * lv.gridKg + fuelLeft * FUEL_KG_PER_KWH[f.category.fuel] + f.co2Parts.process,
      pm: f.pmIdx * (unabated ? 1 - 0.6 * lv.abatement : 1),
      nox: f.noxIdx * (unabated ? 1 - 0.4 * lv.abatement : 1),
    };
  });
  const industryElec = ind.reduce((a, i) => a + i.elec, 0);
  const industryCo2 = ind.reduce((a, i) => a + i.co2, 0);
  const buildingsElec = OTHER_BUILDINGS.reduce((a, b) => a + b.elecMWh, 0);

  // solar: existing fields plus rooftop PV on warehouse roofs, all used on site (district demand far exceeds it)
  const fieldMWh = (SOLAR_FIELD_M2 * FIELD_KWP_PER_M2 * ASSUMPTIONS.yieldKwhPerKwp.v) / 1000;
  const roofM2 = WAREHOUSE_ROOF_RECORDS.reduce((a, r) => a + r.areaM2, 0);
  const rooftopMWh = (roofM2 * ASSUMPTIONS.roofUsableShare.v * lv.rooftopSolar * ASSUMPTIONS.kwpPerM2.v * ASSUMPTIONS.yieldKwhPerKwp.v) / 1000;
  const demandMWh = industryElec + buildingsElec;
  const solarMWh = Math.min(demandMWh, fieldMWh + rooftopMWh);
  const gridMWh = demandMWh - solarMWh;
  // the grid CO₂ already counted per facility/building is reduced by the solar share, pro rata
  const solarCo2Cut = solarMWh * lv.gridKg;
  const buildingsCo2 = buildingsElec * lv.gridKg;

  const vehKmYear = ROAD_TRAFFIC.reduce((a, r) => a + r.vehKmDay, 0) * 365;
  const hgv = FLEET.find((f) => f.id === 'hgv')!;
  // electric trucks: their electricity at ~1.3 kWh/km is counted on the grid (assumption)
  const eTruckKm = vehKmYear * hgv.share * lv.eTrucks;
  const vehicleCo2 = (vehKmYear * FLEET_KG_KM - eTruckKm * hgv.kgKm + eTruckKm * 1.3 * lv.gridKg) / 1000;

  const green = greenSummary(lv.newTrees);
  const emissions = industryCo2 + buildingsCo2 + vehicleCo2 - solarCo2Cut;
  const residents = OTHER_BUILDINGS.reduce((a, b) => a + b.residents, 0);
  const waterIndustry = ind.reduce((a, i) => a + i.f.waterM3Day, 0);
  const waterHomes = (residents * LITRES_PER_RESIDENT) / 1000;
  const waterIrrigation = green.irrigationM3Day;
  // reuse offsets irrigation and up to 30 % of industrial process water (assumption)
  const reused = lv.reuse * (waterIrrigation + 0.3 * waterIndustry);

  const byDistrict = DISTRICTS.map((d) => {
    const fi = ind.filter((i) => i.f.district === d.id);
    const trees = PLANTS.filter((p) => p.district === d.id);
    const traffic = ROAD_TRAFFIC.filter((r) => r.district === d.id);
    const box = d.box;
    const areaM2 = (box[1] - box[0]) * (box[3] - box[2]) * 100;
    const canopy = trees.reduce((a, p) => a + Math.PI * PLANT_TYPES[p.type].crownM ** 2, 0);
    return {
      id: d.id,
      name: d.name,
      nameAr: d.nameAr,
      facilities: fi.length,
      industryCo2: fi.reduce((a, i) => a + i.co2, 0),
      vehicleCo2: (traffic.reduce((a, r) => a + r.vehKmDay, 0) * 365 * FLEET_KG_KM) / 1000,
      trees: trees.length,
      treeCo2: trees.reduce((a, p) => a + PLANT_TYPES[p.type].co2Kg, 0) / 1000,
      canopyPct: (canopy / areaM2) * 100,
    };
  });

  return {
    levers: lv,
    facilities: ind.map((i) => ({ ...i.f, co2T: i.co2, pmIdx: i.pm, noxIdx: i.nox, elecMWh: i.elec })),
    carbon: {
      industryT: industryCo2 * 1,
      buildingsT: buildingsCo2,
      vehiclesT: vehicleCo2,
      solarCutT: solarCo2Cut,
      emissionsT: emissions,
      treeUptakeT: green.co2T,
      netT: emissions - green.co2T,
      // tonnes per tonne: industry figures are in kg/1000 = t already
    },
    o2T: green.o2T,
    green,
    energy: { demandMWh, industryMWh: industryElec, buildingsMWh: buildingsElec, solarFieldMWh: fieldMWh, rooftopMWh, solarMWh, gridMWh, fuelMWh: ind.reduce((a, i) => a + i.f.fuelMWh * (1 - lv.electrifyFuel), 0) },
    water: { industryM3Day: waterIndustry, homesM3Day: waterHomes, irrigationM3Day: waterIrrigation, reusedM3Day: reused, totalM3Day: waterIndustry + waterHomes + waterIrrigation - reused, residents },
    traffic: { vehKmYear, eTruckKm },
    byDistrict,
    byCategory: CATEGORIES.map((c) => {
      const fi = ind.filter((i) => i.f.category.id === c.id);
      return { id: c.id, label: c.label, labelAr: c.labelAr, count: fi.length, co2T: fi.reduce((a, i) => a + i.co2, 0), floorM2: fi.reduce((a, i) => a + i.f.floorM2, 0) };
    }).filter((c) => c.count > 0),
  };
}

export type Snapshot = ReturnType<typeof snapshot>;

/** documented assumptions, shown on the dashboard */
export const MODEL_ASSUMPTIONS = [
  `Facility energy: floor area × category energy intensity × utilisation (55–100 %, per facility) × operating hours relative to the category norm. Intensities are illustrative benchmarks.`,
  `Fuel CO₂: natural gas ${FUEL_KG_PER_KWH.gas}, diesel ${FUEL_KG_PER_KWH.diesel}, LPG ${FUEL_KG_PER_KWH.lpg} kg/kWh; grid ${GRID_KG_PER_KWH} kg/kWh by default (adjustable).`,
  'Process CO₂ (non-energy) only for heavy manufacturing, chemical processing, building materials and fuel storage.',
  `Other buildings: ${Object.entries(BUILDING_KWH_M2).map(([k, v]) => `${k} ${v}`).join(', ')} kWh/m²/yr; floors from height ÷ 3.5 m.`,
  `Road traffic: assumed daily traffic by road class (e.g. trunk ${AADT.trunk.toLocaleString('en-US')}, secondary ${AADT.secondary.toLocaleString('en-US')}); fleet ${FLEET.map((f) => `${Math.round(f.share * 100)} % ${f.label.toLowerCase()} at ${f.kgKm} kg/km`).join(', ')}.`,
  `Trees: ${PLANT_TYPES.shade.co2Kg} kg CO₂/yr per shade tree, ${PLANT_TYPES.palm.co2Kg} kg per palm; O₂ = CO₂ × 32/44; irrigation ${PLANT_TYPES.shade.litresDay} and ${PLANT_TYPES.palm.litresDay} L/day.`,
  `Water: ${M2_PER_RESIDENT} m² of residential floor per resident, ${LITRES_PER_RESIDENT} L per resident per day.`,
  'Solar: existing ground fields (panels on ~45 % of the land) plus rooftop PV on warehouse roofs, climate-panel yields; all used on site.',
];
