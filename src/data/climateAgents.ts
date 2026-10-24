import { AD } from './abudhabi';
import { CO2_KG_ABSORBED_PER_TREE_YEAR, FACTORY_CO2_T, O2_KG_PER_TREE_YEAR, SHADE_TREE_COUNT, FACTORIES, MONTHS } from './airClimate';
import { EXPOSURE_BY_PLACE } from './exposure';
import { heatAt } from './heatGrid';

/**
 * Climate model, shared by the panel, the 3D overlays and the agents. Every number is either
 * computed from the scene layout or an ASSUMPTION below (labelled). Nothing is measured.
 * Scene units: 1 = 10 m.
 */

export type Basis = 'Layout (computed)' | 'Assumption' | 'Model estimate' | 'Illustrative' | 'No source';

export const ASSUMPTIONS = {
  roofUsableShare: { v: 0.6, label: 'Usable roof share', unit: '', note: 'assumption' },
  kwpPerM2: { v: 0.2, label: 'Panel output', unit: 'kWp per m²', note: 'assumption' },
  yieldKwhPerKwp: { v: 1600, label: 'Specific yield', unit: 'kWh per kWp per year', note: 'assumption, verify against a solar resource dataset' },
  selfUse: { v: 0.8, label: 'On-site use of solar', unit: '', note: 'assumption' },
  gridKgPerKwh: { v: 0.45, label: 'Grid emission factor (default)', unit: 'kg CO2 per kWh', note: 'assumed electricity mix, verify with the official source' },
  demandKwhPerM2: { v: 150, label: 'Electricity demand', unit: 'kWh per m² of roof per year', note: 'assumption, replace with metered data' },
  batteryDayShare: { v: 0.25, label: 'Battery size', unit: 'share of average daily generation', note: 'assumption' },
  batteryRoundTrip: { v: 0.9, label: 'Battery round-trip efficiency', unit: '', note: 'assumption' },
  crownRadiusM: { v: 4, label: 'Tree crown radius', unit: 'm', note: 'assumption' },
  kgCo2PerKm: { v: 0.9, label: 'Truck CO2', unit: 'kg per km', note: 'assumption, simplified' },
  dailyMovements: { v: 300, label: 'Truck movements', unit: 'per day', note: 'assumption' },
  tripKm: { v: 10, label: 'Average trip', unit: 'km', note: 'assumption' },
  routingCut: { v: 0.12, label: 'Routing optimisation', unit: 'cut in km', note: 'illustrative' },
  idlingCut: { v: 0.05, label: 'Less idling', unit: 'cut in fuel', note: 'illustrative' },
  greenHeatCut: { v: 0.1, label: 'Green corridor heat effect', unit: 'relative cut', note: 'illustrative' },
  reflectiveHeatCut: { v: 0.08, label: 'Reflective roofing heat effect', unit: 'relative cut', note: 'illustrative' },
  hotWeatherUplift: { v: 0.25, label: 'Hot-weather uplift at full intensity', unit: 'relative', note: 'illustrative, not a forecast' },
} as const;

function roofM2(names: string[]) {
  let a = 0;
  for (const b of AD.buildings) {
    if (!names.includes(b.n)) continue;
    for (const [x0, z0, x1, z1] of b.b) a += (x1 - x0) * 10 * (z1 - z0) * 10;
  }
  return a;
}

function polyM2(p: [number, number][]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i];
    const [x1, z1] = p[(i + 1) % p.length];
    s += x0 * z1 - x1 * z0;
  }
  return (Math.abs(s) / 2) * 100;
}

export const DISTRICT_M2 = (AD.meta.rect.maxX - AD.meta.rect.minX) * 10 * ((AD.meta.rect.maxZ - AD.meta.rect.minZ) * 10);
export const ROOF_M2 = roofM2(['Logistics warehouse', 'Factory hall']);
export const WAREHOUSE_ROOF_M2 = roofM2(['Logistics warehouse']);
export const PARK_M2 = AD.parks.reduce((a, p) => a + polyM2(p.p as [number, number][]), 0);
export const PARK_COUNT = AD.parks.length;
export const DEMAND_MWH = (ROOF_M2 * ASSUMPTIONS.demandKwhPerM2.v) / 1000;

export const WAREHOUSE_ROOFS = AD.buildings
  .filter((b) => b.n === 'Logistics warehouse')
  .map((b, i) => ({ name: `Warehouse ${i + 1}`, m2: b.b.reduce((a, [x0, z0, x1, z1]) => a + (x1 - x0) * 10 * (z1 - z0) * 10, 0) }))
  .sort((a, b) => b.m2 - a.m2);

export const MAJOR_ROAD_KM = (() => {
  let units = 0;
  for (const r of AD.roads) {
    if (!['motorway', 'trunk', 'primary'].includes(r.c)) continue;
    for (let i = 1; i < r.p.length; i++) units += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
  }
  return (units * 10) / 1000;
})();

export const HEAT_INDEX = EXPOSURE_BY_PLACE.length ? EXPOSURE_BY_PLACE.reduce((a, e) => a + e.heatC, 0) / EXPOSURE_BY_PLACE.length : 0;

export interface Scenario {
  solarCoverage: number;
  extraTrees: number;
  reflectiveRoofs: boolean;
  optimisedRouting: boolean;
  evShare: number;
  /** hypothetical hot-weather intensity, 0–1 */
  hotWeather: number;
  /** grid emission factor used for avoided emissions, kg CO2 per kWh */
  gridKg: number;
  /** battery on or off */
  battery: boolean;
}

export const BASELINE: Scenario = {
  solarCoverage: 0,
  extraTrees: 0,
  reflectiveRoofs: false,
  optimisedRouting: false,
  evShare: 0,
  hotWeather: 0,
  gridKg: ASSUMPTIONS.gridKgPerKwh.v,
  battery: false,
};

/** 24-hour typical day: solar bell curve, flat demand, battery shifts surplus to the evening */
export function dayProfile(s: Scenario) {
  const annualGen = ROOF_M2 * s.solarCoverage * ASSUMPTIONS.roofUsableShare.v * ASSUMPTIONS.kwpPerM2.v * ASSUMPTIONS.yieldKwhPerKwp.v; // kWh per year
  const dailyGen = annualGen / 365;
  const shape = Array.from({ length: 24 }, (_, h) => (h >= 6 && h <= 18 ? Math.sin((Math.PI * (h - 6)) / 12) ** 1.2 : 0));
  const sum = shape.reduce((a, b) => a + b, 0) || 1;
  const gen = shape.map((v) => (dailyGen * v) / sum);
  const demandDay = (DEMAND_MWH * 1000) / 365;
  const demand = Array.from({ length: 24 }, () => demandDay / 24);
  const capacity = s.battery ? dailyGen * ASSUMPTIONS.batteryDayShare.v : 0;
  const eff = Math.sqrt(ASSUMPTIONS.batteryRoundTrip.v);
  let soc = 0;
  const batt: number[] = [];
  const used: number[] = [];
  const grid: number[] = [];
  for (let h = 0; h < 24; h++) {
    let direct = Math.min(gen[h], demand[h]);
    let surplus = gen[h] - direct;
    let charged = 0;
    if (surplus > 0 && capacity > 0) {
      charged = Math.min(surplus, (capacity - soc) / eff);
      soc += charged * eff;
    }
    let deficit = demand[h] - direct;
    let discharged = 0;
    if (deficit > 0 && capacity > 0) {
      discharged = Math.min(deficit, soc);
      soc -= discharged;
    }
    batt.push(discharged);
    used.push(direct + discharged);
    grid.push(demand[h] - direct - discharged);
  }
  return { gen, demand, batt, grid, used, dailyGen, capacity };
}

export interface Outcome {
  solarMWh: number;
  demandMWh: number;
  solarShare: number;
  gridAvoidedMWh: number;
  gridImportMWh: number;
  batteryKwh: number;
  batteryMWh: number;
  solarCo2AvoidedT: number;
  factoryCo2T: number;
  factoryCo2TDay: number;
  treeO2T: number;
  treeCo2AbsorbedT: number;
  canopyPct: number;
  truckCo2T: number;
  heatIndex: number;
  netCo2T: number;
}

export function run(s: Scenario): Outcome {
  const d = dayProfile(s);
  const solarMWh = (d.dailyGen * 365) / 1000;
  const avoidedDay = d.used.reduce((a, b) => a + b, 0);
  const gridAvoidedMWh = (avoidedDay * 365) / 1000;
  const demandMWh = DEMAND_MWH;
  const gridImportMWh = demandMWh - gridAvoidedMWh;
  const solarCo2AvoidedT = (gridAvoidedMWh * 1000 * s.gridKg) / 1000;

  const trees = SHADE_TREE_COUNT + s.extraTrees;
  const treeO2T = (trees * O2_KG_PER_TREE_YEAR) / 1000;
  const treeCo2AbsorbedT = (trees * CO2_KG_ABSORBED_PER_TREE_YEAR) / 1000;
  const canopyPct = ((trees * Math.PI * ASSUMPTIONS.crownRadiusM.v ** 2) / DISTRICT_M2) * 100;

  let km = ASSUMPTIONS.dailyMovements.v * ASSUMPTIONS.tripKm.v * 365;
  if (s.optimisedRouting) km *= (1 - ASSUMPTIONS.routingCut.v) * (1 - ASSUMPTIONS.idlingCut.v);
  km *= 1 - s.evShare;
  const truckCo2T = (km * ASSUMPTIONS.kgCo2PerKm.v) / 1000;

  let heat = HEAT_INDEX * (1 + ASSUMPTIONS.hotWeatherUplift.v * s.hotWeather);
  if (s.extraTrees > 0) heat *= 1 - ASSUMPTIONS.greenHeatCut.v * Math.min(1, s.extraTrees / 200);
  if (s.reflectiveRoofs) heat *= 1 - ASSUMPTIONS.reflectiveHeatCut.v;

  const netCo2T = FACTORY_CO2_T + truckCo2T - treeCo2AbsorbedT - solarCo2AvoidedT;
  return {
    solarMWh,
    demandMWh,
    solarShare: demandMWh > 0 ? gridAvoidedMWh / demandMWh : 0,
    gridAvoidedMWh,
    gridImportMWh,
    batteryKwh: d.capacity,
    batteryMWh: (d.batt.reduce((a, b) => a + b, 0) * 365) / 1000,
    solarCo2AvoidedT,
    factoryCo2T: FACTORY_CO2_T,
    factoryCo2TDay: FACTORY_CO2_T / 365,
    treeO2T,
    treeCo2AbsorbedT,
    canopyPct,
    truckCo2T,
    heatIndex: heat,
    netCo2T,
  };
}

export const BASE_OUTCOME = run(BASELINE);

/** the factories with the largest modelled CO2, highest first */
export const TOP_FACTORIES = [...FACTORIES].sort((a, b) => b.co2T - a.co2T || a.id - b.id).slice(0, 6);

/** the hottest factory locations under the current heat field */
export const HEAT_EXPOSED_FACTORIES = [...FACTORIES]
  .map((f) => ({ f, h: heatAt(f.x, f.z) }))
  .sort((a, b) => b.h - a.h || a.f.id - b.f.id)
  .slice(0, 5);

export { MONTHS };
