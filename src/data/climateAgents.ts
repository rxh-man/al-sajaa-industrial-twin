import { AD } from './abudhabi';
import { CO2_KG_ABSORBED_PER_TREE_YEAR, FACTORY_CO2_T, O2_KG_PER_TREE_YEAR, SHADE_TREE_COUNT, TREE_CO2_ABSORBED_T_PER_YEAR, TREE_O2_T_PER_YEAR } from './airClimate';
import { EXPOSURE_BY_PLACE } from './exposure';

/**
 * Climate agents and the intervention simulator. Every number is either computed from the scene
 * layout, or an ASSUMPTION listed below with a label. Nothing here is a measurement or an
 * official figure. Scene units: 1 = 10 m.
 */

export type Confidence = 'Layout (computed)' | 'Assumption' | 'Model estimate';

export const ASSUMPTIONS = {
  /** share of a roof that can take panels after plant, access and setbacks */
  roofUsableShare: { v: 0.6, label: 'Usable roof share', unit: '', note: 'assumption' },
  /** installed kWp per m² of panel area */
  kwpPerM2: { v: 0.2, label: 'Panel output', unit: 'kWp per m²', note: 'assumption' },
  /** annual yield per kWp for Sharjah, to verify against a solar resource dataset */
  yieldKwhPerKwp: { v: 1600, label: 'Specific yield', unit: 'kWh per kWp per year', note: 'assumption, verify' },
  /** share of solar output used on site (rest exported) */
  selfUse: { v: 0.8, label: 'On-site use of solar', unit: '', note: 'assumption' },
  /** grid emission factor used for the avoided-emissions comparison */
  gridKgPerKwh: { v: 0.45, label: 'Grid emission factor', unit: 'kg CO2 per kWh', note: 'assumed electricity mix, verify with the official source' },
  /** battery sized to this share of an average day's generation */
  batteryDayShare: { v: 0.25, label: 'Battery size', unit: 'share of daily generation', note: 'assumption' },
  /** average panel crown radius of a shade tree, metres */
  crownRadiusM: { v: 4, label: 'Tree crown radius', unit: 'm', note: 'assumption' },
  /** heavy-vehicle CO2 per km, simplified */
  kgCo2PerKm: { v: 0.9, label: 'Truck CO2', unit: 'kg per km', note: 'assumption, simplified' },
  /** truck movements per day on district roads (user can change in the simulator) */
  dailyMovements: { v: 300, label: 'Truck movements', unit: 'per day', note: 'assumption' },
  /** average trip length in km */
  tripKm: { v: 10, label: 'Average trip', unit: 'km', note: 'assumption' },
  /** effect of routing and idle reduction on fuel and CO2, illustrative */
  optimisedRoutingCut: { v: 0.12, label: 'Routing optimisation', unit: 'cut in km', note: 'illustrative' },
  idlingCut: { v: 0.05, label: 'Less idling', unit: 'cut in fuel', note: 'illustrative' },
  /** heat effects are relative, not temperatures */
  greenHeatCut: { v: 0.1, label: 'Green corridor heat effect', unit: 'relative cut', note: 'illustrative' },
  reflectiveHeatCut: { v: 0.08, label: 'Reflective roofing heat effect', unit: 'relative cut', note: 'illustrative' },
} as const;

/** roof area in m² of a set of buildings (footprint boxes, 1 unit = 10 m) */
function roofM2(names: string[]) {
  let a = 0;
  for (const b of AD.buildings) {
    if (!names.includes(b.n)) continue;
    for (const [x0, z0, x1, z1] of b.b) a += (x1 - x0) * 10 * (z1 - z0) * 10;
  }
  return a;
}

/** footprint polygon area in m² (shoelace) */
function polyM2(p: { x: number; z: number }[] | [number, number][]) {
  let s = 0;
  const pts = p as [number, number][];
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    s += x0 * z1 - x1 * z0;
  }
  return (Math.abs(s) / 2) * 100;
}

/** the scene's rectangle in m² */
export const DISTRICT_M2 = ((AD.meta.rect.maxX - AD.meta.rect.minX) * 10) * ((AD.meta.rect.maxZ - AD.meta.rect.minZ) * 10);

/** candidate roofs for solar: logistics warehouses and factory halls */
export const ROOF_M2 = roofM2(['Logistics warehouse', 'Factory hall']);
export const WAREHOUSE_ROOF_M2 = roofM2(['Logistics warehouse']);
export const PARK_M2 = AD.parks.reduce((a, p) => a + polyM2(p.p), 0);
export const PARK_COUNT = AD.parks.length;

/** total length of trunk, primary and motorway roads in km (1 unit = 10 m) */
export const MAJOR_ROAD_KM = (() => {
  let units = 0;
  for (const r of AD.roads) {
    if (!['motorway', 'trunk', 'primary'].includes(r.c)) continue;
    for (let i = 1; i < r.p.length; i++) units += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
  }
  return (units * 10) / 1000;
})();

/** the district's heat index across named places, averaged (simulated) */
export const HEAT_INDEX = EXPOSURE_BY_PLACE.length ? EXPOSURE_BY_PLACE.reduce((a, e) => a + e.heatC, 0) / EXPOSURE_BY_PLACE.length : 0;

export interface Scenario {
  /** share of usable roof area with solar, 0–1 */
  solarCoverage: number;
  /** additional trees planted along green corridors */
  extraTrees: number;
  reflectiveRoofs: boolean;
  optimisedRouting: boolean;
  /** share of truck km done by electric vehicles, 0–1 */
  evShare: number;
}

export const BASELINE: Scenario = { solarCoverage: 0, extraTrees: 0, reflectiveRoofs: false, optimisedRouting: false, evShare: 0 };

export interface Outcome {
  solarMWh: number;
  gridAvoidedMWh: number;
  batteryKwh: number;
  solarCo2AvoidedT: number;
  treeO2T: number;
  treeCo2AbsorbedT: number;
  canopyPct: number;
  truckCo2T: number;
  heatIndex: number;
  /** annual net CO2 across the modelled sources, t per year (negative is a net sink) */
  netCo2T: number;
}

export function run(s: Scenario): Outcome {
  // solar
  const usableM2 = ROOF_M2 * ASSUMPTIONS.roofUsableShare.v * s.solarCoverage;
  const genKwh = usableM2 * ASSUMPTIONS.kwpPerM2.v * ASSUMPTIONS.yieldKwhPerKwp.v;
  const solarMWh = genKwh / 1000;
  const gridAvoidedMWh = (genKwh * ASSUMPTIONS.selfUse.v) / 1000;
  const solarCo2AvoidedT = (gridAvoidedMWh * 1000 * ASSUMPTIONS.gridKgPerKwh.v) / 1000;
  const batteryKwh = (genKwh / 365) * ASSUMPTIONS.batteryDayShare.v;

  // trees
  const trees = SHADE_TREE_COUNT + s.extraTrees;
  const treeO2T = (trees * O2_KG_PER_TREE_YEAR) / 1000;
  const treeCo2AbsorbedT = (trees * CO2_KG_ABSORBED_PER_TREE_YEAR) / 1000;
  const crownM2 = Math.PI * ASSUMPTIONS.crownRadiusM.v ** 2;
  const canopyPct = (trees * crownM2 / DISTRICT_M2) * 100;

  // trucks
  let km = ASSUMPTIONS.dailyMovements.v * ASSUMPTIONS.tripKm.v * 365;
  if (s.optimisedRouting) km *= 1 - ASSUMPTIONS.optimisedRoutingCut.v;
  if (s.optimisedRouting) km *= 1 - ASSUMPTIONS.idlingCut.v;
  km *= 1 - s.evShare;
  const truckCo2T = (km * ASSUMPTIONS.kgCo2PerKm.v) / 1000;

  // heat (relative index, baseline 100)
  let heat = HEAT_INDEX;
  if (s.extraTrees > 0) heat *= 1 - ASSUMPTIONS.greenHeatCut.v * Math.min(1, s.extraTrees / 200);
  if (s.reflectiveRoofs) heat *= 1 - ASSUMPTIONS.reflectiveHeatCut.v;

  const netCo2T = FACTORY_CO2_T + truckCo2T - treeCo2AbsorbedT - solarCo2AvoidedT;
  return { solarMWh, gridAvoidedMWh, batteryKwh, solarCo2AvoidedT, treeO2T, treeCo2AbsorbedT, canopyPct, truckCo2T, heatIndex: heat, netCo2T };
}

export const BASE_OUTCOME = run(BASELINE);
export { TREE_O2_T_PER_YEAR, TREE_CO2_ABSORBED_T_PER_YEAR };
