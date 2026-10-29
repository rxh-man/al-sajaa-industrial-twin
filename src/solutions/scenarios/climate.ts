import { AD } from '../../data/abudhabi';
import { ASSUMPTIONS, DEMAND_MWH, WAREHOUSE_ROOF_RECORDS } from '../../data/climateAgents';
import { heatAt } from '../../data/heatGrid';
import { change, delta, inputsKey, num, recommend, round } from '../engine';
import type { InputValues, KpiDef, OptionResult, ScenarioDef, ScenarioResult, XZ } from '../types';

/**
 * Climate action for the district: rooftop solar (with or without a battery) on the twin's warehouse roofs, and
 * cooling of the hottest streets and roofs (street trees, reflective roofing). Electricity demand, yields and the
 * cooling effects are the climate panel's documented assumptions (climateAgents.ts); the heat index is the twin's
 * relative 0–1 grid (heatGrid.ts), not a temperature.
 */

const A = ASSUMPTIONS;
const TREE_SPACING_M = 8; // one tree per 8 m of street (assumption)
const HOT_SHARE = 0.1; // the hottest 10 % of street length is the target (assumption)

export const KPIS: KpiDef[] = [
  { id: 'co2T', label: 'Grid electricity CO₂', unit: 't/yr', better: 'lower', basis: 'Estimated', how: '(demand − solar used on site) × grid emission factor' },
  { id: 'gridMWh', label: 'Electricity bought from the grid', unit: 'MWh/yr', better: 'lower', basis: 'Estimated', how: 'demand − solar used on site (24 h dispatch with battery)' },
  { id: 'solarShare', label: 'Demand met by on-site solar', unit: '%', better: 'higher', basis: 'Estimated', how: 'solar used on site ÷ demand' },
  { id: 'heatHot', label: 'Heat index at hotspots', unit: 'index 0–1', better: 'lower', basis: 'Simulated', how: 'mean of the relative heat grid on the hottest streets and target roofs, after cooling' },
  { id: 'waterM3', label: 'Added irrigation water', unit: 'm³/yr', better: 'lower', basis: 'Assumption', how: 'trees × litres per tree per day × 365' },
];

/** street samples (1 scene unit apart) with their heat; cached since the grid is static */
let streetCache: { p: XZ; d: XZ; heat: number; road: string }[] | null = null;
function streetSamples() {
  if (streetCache) return streetCache;
  const out: { p: XZ; d: XZ; heat: number; road: string }[] = [];
  for (const r of AD.roads) {
    if (!['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified'].includes(r.c) || r.t || r.y) continue;
    for (let i = 1; i < r.p.length; i++) {
      const [x0, z0] = r.p[i - 1];
      const [x1, z1] = r.p[i];
      const L = Math.hypot(x1 - x0, z1 - z0) || 1;
      const d: XZ = [(x1 - x0) / L, (z1 - z0) / L];
      const n = Math.max(1, Math.round(L));
      for (let s = 0; s < n; s++) {
        const p: XZ = [x0 + ((x1 - x0) * (s + 0.5)) / n, z0 + ((z1 - z0) * (s + 0.5)) / n];
        out.push({ p, d, heat: heatAt(p[0], p[1]), road: r.n });
      }
    }
  }
  streetCache = out;
  return out;
}

/** one representative day: solar bell 06–18 h, flat demand; battery charges from surplus, discharges into deficit */
export function dispatchDay(genMWhDay: number, demandMWhDay: number, batteryMWh: number) {
  const shape = Array.from({ length: 24 }, (_, h) => (h >= 6 && h < 18 ? Math.sin(((h + 0.5 - 6) / 12) * Math.PI) : 0));
  const sum = shape.reduce((a, b) => a + b, 0);
  let soc = 0;
  let used = 0;
  for (let h = 0; h < 24; h++) {
    const gen = (genMWhDay * shape[h]) / sum;
    const load = demandMWhDay / 24;
    const direct = Math.min(gen, load);
    used += direct;
    const surplus = gen - direct;
    soc = Math.min(batteryMWh, soc + surplus * Math.sqrt(A.batteryRoundTrip.v));
    const deficit = load - direct;
    const out = Math.min(deficit, soc * Math.sqrt(A.batteryRoundTrip.v));
    soc -= out / Math.sqrt(A.batteryRoundTrip.v);
    used += out;
  }
  // a second pass from the end-of-day state would add overnight carry-over; one day from empty is conservative
  return used;
}

export function runClimate(v: InputValues): ScenarioResult {
  const minRoof = num(v, 'minRoof', 0, 20000);
  const coverage = num(v, 'coverage', 0, 100) / 100;
  const batteryShare = num(v, 'battery', 0, 100) / 100;
  const trees = Math.round(num(v, 'trees', 0, 5000));
  const reflective = num(v, 'reflective', 0, 100) / 100;
  const grid = num(v, 'gridFactor', 0.1, 1);
  const litres = num(v, 'litresPerTree', 0, 300);

  const roofs = WAREHOUSE_ROOF_RECORDS.filter((r) => r.areaM2 >= minRoof);
  const roofM2 = roofs.reduce((a, r) => a + r.areaM2, 0);
  const kWp = roofM2 * A.roofUsableShare.v * coverage * A.kwpPerM2.v;
  const genMWh = (kWp * A.yieldKwhPerKwp.v) / 1000;
  const demand = DEMAND_MWH;
  const dGen = genMWh / 365;
  const dDem = demand / 365;
  const battery = dGen * batteryShare;
  const usedNoBatt = dispatchDay(dGen, dDem, 0) * 365;
  const usedBatt = dispatchDay(dGen, dDem, battery) * 365;

  // hotspots: the hottest 10 % of street samples; target roofs: the selected warehouse roofs
  const samples = streetSamples();
  const sorted = [...samples].sort((a, b) => b.heat - a.heat);
  const hot = sorted.slice(0, Math.max(1, Math.round(sorted.length * HOT_SHARE)));
  const hotLenM = hot.length * 10;
  const shaded = Math.min(1, (trees * TREE_SPACING_M) / hotLenM);
  const roofHeat = roofs.map((r) => heatAt(r.centre[0], r.centre[1]));
  const meanStreet = hot.reduce((a, s) => a + s.heat, 0) / hot.length;
  const meanRoof = roofHeat.length ? roofHeat.reduce((a, b) => a + b, 0) / roofHeat.length : 0;
  const n = hot.length + roofHeat.length;
  const heatIndex = (treesOn: boolean, roofOn: boolean) =>
    (hot.length * meanStreet * (1 - (treesOn ? A.greenHeatCut.v * shaded : 0)) + roofHeat.length * meanRoof * (1 - (roofOn ? A.reflectiveHeatCut.v * reflective : 0))) / n;
  const water = trees * litres * 0.365;

  const kpis = (used: number, treesOn: boolean, roofOn: boolean) => ({
    co2T: ((demand - used) * grid),
    gridMWh: demand - used,
    solarShare: (used / demand) * 100,
    heatHot: heatIndex(treesOn, roofOn),
    waterM3: treesOn ? water : 0,
  });

  const baseline: OptionResult = { id: 'baseline', name: 'Current district (grid only, no cooling)', summary: 'All electricity from the grid; no added trees or reflective roofs.', kpis: kpis(0, false, false), actions: [], feasible: true };
  const solar: OptionResult = {
    id: 'solar',
    name: 'Rooftop solar',
    summary: `${roofs.length} warehouse roofs ≥ ${round(minRoof, 0)} m², ${round(kWp / 1000, 2)} MWp, ${round(genMWh, 0)} MWh/yr generated.`,
    kpis: kpis(usedNoBatt, false, false),
    actions: roofs.map((r) => r.id),
    feasible: kWp > 0,
    infeasibleWhy: kWp > 0 ? undefined : 'No roof meets the minimum size, or coverage is 0 %.',
  };
  const solarBatt: OptionResult = {
    id: 'solar-battery',
    name: 'Rooftop solar + battery',
    summary: `As above with a ${round(battery, 1)} MWh battery (${round(batteryShare * 100, 0)} % of a day's generation) shifting surplus into the evening.`,
    kpis: kpis(usedBatt, false, false),
    actions: [...roofs.map((r) => r.id), 'district battery'],
    feasible: kWp > 0 && battery > 0,
    infeasibleWhy: kWp <= 0 ? 'No solar to store.' : battery > 0 ? undefined : 'Battery size is set to 0 %.',
  };
  const cool: OptionResult = {
    id: 'cooling',
    name: 'Street trees + reflective roofs',
    summary: `${trees} trees on the hottest ${round(hotLenM / 1000, 2)} km of street (${round(shaded * 100, 0)} % shaded) and reflective coating on ${round(reflective * 100, 0)} % of the target roofs.`,
    kpis: kpis(0, true, true),
    actions: ['hottest streets', ...roofs.map((r) => r.id)],
    feasible: trees > 0 || reflective > 0,
    infeasibleWhy: trees > 0 || reflective > 0 ? undefined : 'No trees and no reflective roofing selected.',
  };
  const all: OptionResult = {
    id: 'package',
    name: 'Combined package',
    summary: 'Solar + battery on the roofs, trees on the hottest streets, reflective coating where the roofs are not covered by panels.',
    // reflective coating only on the roof share the panels leave free
    kpis: { ...kpis(usedBatt, true, false), heatHot: (() => {
      const free = Math.max(0, 1 - coverage * A.roofUsableShare.v);
      return (hot.length * meanStreet * (1 - A.greenHeatCut.v * shaded) + roofHeat.length * meanRoof * (1 - A.reflectiveHeatCut.v * reflective * free)) / n;
    })() },
    actions: [...roofs.map((r) => r.id), 'district battery', 'hottest streets'],
    feasible: kWp > 0 && (trees > 0 || reflective > 0),
    infeasibleWhy: kWp > 0 && (trees > 0 || reflective > 0) ? undefined : 'Needs both solar and a cooling measure.',
  };
  const options = [solar, solarBatt, cool, all];
  const wCo2 = num(v, 'weightCo2', 0, 100) / 100;
  const weights = { co2T: wCo2, heatHot: 1 - wCo2, waterM3: 0.15 };
  const rec = recommend(baseline, options, KPIS, weights, (best) => {
    const k = (id: string) => KPIS.find((q) => q.id === id)!;
    return `Highest weighted score (CO₂ ${round(wCo2 * 100, 0)} %, hotspot heat ${round((1 - wCo2) * 100, 0)} %, irrigation water 15 % penalty). ${delta(k('co2T'), baseline.kpis.co2T, best.kpis.co2T, 0)}; ${delta(k('heatHot'), baseline.kpis.heatHot, best.kpis.heatHot, 3)}.`;
  });
  const chosen = options.find((o) => o.id === rec.optionId);
  const c = change(baseline.kpis.co2T, chosen?.kpis.co2T ?? null);

  const hotRoads = [...new Set(hot.map((h) => h.road))].filter(Boolean);
  return {
    scenarioId: 'climate',
    inputsKey: inputsKey(v),
    baseline,
    options,
    kpis: KPIS,
    recommendation: rec,
    findings: [
      `${roofs.length} of ${WAREHOUSE_ROOF_RECORDS.length} warehouse roofs meet the size threshold: ${round(roofM2 / 1000, 1)} thousand m² (layout).`,
      `Modelled district electricity demand ${round(demand, 0)} MWh/yr (roof area × ${A.demandKwhPerM2.v} kWh/m², assumption).`,
      `Without a battery ${round(genMWh > 0 ? (usedNoBatt / genMWh) * 100 : 0, 0)} % of the solar is used on site; with the battery ${round(genMWh > 0 ? (usedBatt / genMWh) * 100 : 0, 0)} %.${genMWh > 0 && usedNoBatt >= genMWh * 0.999 ? ' Midday solar never exceeds demand at this size, so a battery adds nothing here.' : ''}`,
      `Hottest streets: ${hotRoads.slice(0, 4).join(', ')}${hotRoads.length > 4 ? ' …' : ''} (mean heat index ${round(meanStreet, 2)}).`,
      c.pct === null ? '' : `The recommended option changes grid CO₂ by ${round(c.pct, 0)} %.`,
    ].filter(Boolean),
    affectedAssets: [...roofs.slice(0, 8).map((r) => r.id), ...hotRoads.slice(0, 4)],
    tradeoffs: [
      'Street trees cool the hottest streets but need irrigation water every day in this climate (shown as a cost in water).',
      'Panels and reflective coating compete for the same roof: in the package, coating only goes where panels are not.',
      'Solar exported beyond on-site use is not counted as CO₂ saved (conservative; depends on export rules).',
    ],
    assumptions: [
      `Usable roof ${A.roofUsableShare.v * 100} %, ${A.kwpPerM2.v} kWp/m², ${A.yieldKwhPerKwp.v} kWh/kWp/yr (climate panel assumptions).`,
      `Grid factor ${grid} kg CO₂/kWh (input; verify against the official grid factor).`,
      `Battery round-trip ${A.batteryRoundTrip.v * 100} %; one representative day, flat demand, solar 06:00–18:00 (this hourly dispatch replaces the climate panel's flat ${A.selfUse.v * 100} % on-site use).`,
      `Trees every ${TREE_SPACING_M} m reduce the street heat index by up to ${A.greenHeatCut.v * 100} %; reflective roofs by up to ${A.reflectiveHeatCut.v * 100} % (illustrative factors).`,
      `Irrigation ${litres} L per tree per day (input).`,
    ],
    limitations: [
      'Heat is the twin\'s relative index, not air or surface temperature; no microclimate model.',
      'No seasonal variation, soiling, shading of panels or roof structural checks.',
    ],
    unavailable: [
      { metric: 'Temperature reduction (°C)', needs: 'a calibrated microclimate model or field measurements' },
      { metric: 'Capital cost and payback (AED)', needs: 'quotes for panels, batteries, trees and coating, and the tariff' },
    ],
    confidence: { level: 'low', why: 'Roof areas come from the layout; yields, demand and cooling factors are assumptions.' },
    highlight: {
      points: roofs.slice(0, 40).map((r) => ({ x: r.centre[0], z: r.centre[1], role: 'action' as const, label: `${r.id} · ${round(r.areaM2, 0)} m²` })),
      paths: (() => {
        // group hot samples into short dashes along the street for display
        return hot.slice(0, 600).map((h) => ({ pts: [[h.p[0] - h.d[0] * 0.5, h.p[1] - h.d[1] * 0.5] as XZ, [h.p[0] + h.d[0] * 0.5, h.p[1] + h.d[1] * 0.5] as XZ], role: 'problem' as const, label: h.road }));
      })(),
      focus: { x: hot[0].p[0], z: hot[0].p[1], r: 60 },
    },
  };
}

export const CLIMATE: ScenarioDef = {
  id: 'climate',
  title: 'Climate action: solar and cooling',
  titleAr: 'العمل المناخي: الطاقة الشمسية والتبريد',
  icon: 'sun',
  problem: 'Cut the district\'s electricity CO₂ and cool its hottest streets: where should panels, batteries, trees and reflective roofs go?',
  why: 'Industrial roofs are large, flat and unused; the hottest streets are where workers walk and wait. Measures compete for roof space and water.',
  infrastructure: ['Warehouse roofs', 'District battery (proposed)', 'Hottest street segments', 'Irrigation supply'],
  inputs: [
    { kind: 'range', id: 'minRoof', label: 'Minimum roof size for panels', min: 0, max: 6000, step: 250, unit: 'm²' },
    { kind: 'range', id: 'coverage', label: 'Panel coverage of usable roof', min: 0, max: 100, step: 5, unit: '%' },
    { kind: 'range', id: 'battery', label: 'Battery size (share of daily generation)', min: 0, max: 60, step: 5, unit: '%' },
    { kind: 'range', id: 'trees', label: 'Street trees planted', min: 0, max: 3000, step: 50, unit: 'trees' },
    { kind: 'range', id: 'reflective', label: 'Reflective coating on target roofs', min: 0, max: 100, step: 10, unit: '%' },
    { kind: 'range', id: 'gridFactor', label: 'Grid emission factor', min: 0.2, max: 0.7, step: 0.01, unit: 'kg/kWh' },
    { kind: 'range', id: 'litresPerTree', label: 'Irrigation per tree', min: 0, max: 200, step: 10, unit: 'L/day' },
    { kind: 'range', id: 'weightCo2', label: 'Priority: CO₂ vs heat', min: 0, max: 100, step: 10, unit: '% CO₂' },
  ],
  defaults: { minRoof: 1000, coverage: 70, battery: 25, trees: 600, reflective: 50, gridFactor: 0.45, litresPerTree: 60, weightCo2: 60 },
  run: runClimate,
};
