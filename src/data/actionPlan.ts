/**
 * Deterministic climate action plan and impact ledger.
 *
 * Reuses the shared climate model (`run`, `BASELINE`, `ASSUMPTIONS`) so the plan,
 * the ledger and the on-screen panels all read from one source of truth. Every
 * number here is computed by the model; nothing is fabricated. Costs are NOT
 * modelled anywhere in this application, so they are reported as missing inputs
 * rather than invented.
 *
 * This is projected, modelled output. It is never measured or independently
 * verified, and the ledger records that status explicitly.
 */
import { ASSUMPTIONS, BASELINE, run, type Outcome, type Scenario } from './climateAgents';

/** Bump when the calculation logic changes, so old ledger entries stay interpretable. */
export const CALC_VERSION = '1.0.0';
export const BASELINE_VERSION = '1.0.0';

export type ProvenanceKind = 'measured' | 'sourced' | 'calculated' | 'assumption' | 'illustrative';
export type ValidationStatus = 'projected' | 'verified';

export interface InterventionLine {
  id: string;
  label: string;
  /** what the user set, in plain words */
  setting: string;
  /** assumptions this intervention leans on, with their provenance note */
  assumptions: string[];
  provenance: ProvenanceKind;
}

export interface ImpactLine {
  id: string;
  label: string;
  unit: string;
  baseline: number;
  proposed: number;
  /** proposed - baseline; negative means a reduction */
  delta: number;
}

export interface ActionPlan {
  calcVersion: string;
  baselineVersion: string;
  problem: string;
  scenario: Scenario;
  interventions: InterventionLine[];
  impacts: ImpactLine[];
  /** the headline modelled net-CO2 change in tonnes per year (negative = reduction) */
  netCo2DeltaT: number;
  assumptions: { label: string; value: number; unit: string; note: string }[];
  dataGaps: string[];
  validation: ValidationStatus;
}

export interface LedgerEntry {
  scenarioId: string;
  baselineVersion: string;
  calcVersion: string;
  timestamp: string;
  assumptions: Scenario;
  projectedImpact: { netCo2DeltaT: number; solarMWh: number; gridAvoidedMWh: number; heatIndexDelta: number };
  provenance: string;
  validation: ValidationStatus;
}

const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Stable id for a scenario, from its settings. Same scenario -> same id, order-independent. */
export function scenarioId(s: Scenario): string {
  const parts = [
    `sc${round(s.solarCoverage, 3)}`,
    `tr${s.extraTrees}`,
    `rr${s.reflectiveRoofs ? 1 : 0}`,
    `or${s.optimisedRouting ? 1 : 0}`,
    `ev${round(s.evShare, 3)}`,
    `hw${round(s.hotWeather, 3)}`,
    `gk${round(s.gridKg, 3)}`,
    `bt${s.battery ? 1 : 0}`,
    `xr${(s.excludedRoofs ?? []).slice().sort().join('.')}`,
  ];
  return parts.join('_');
}

/** Interventions implied by how the scenario differs from the baseline. */
export function interventionsOf(s: Scenario): InterventionLine[] {
  const out: InterventionLine[] = [];
  if (s.solarCoverage > 0) {
    out.push({
      id: 'solar',
      label: 'Rooftop solar',
      setting: `${round(s.solarCoverage * 100, 0)}% of usable warehouse roof area`,
      assumptions: [
        `${ASSUMPTIONS.roofUsableShare.label}: ${ASSUMPTIONS.roofUsableShare.v} (${ASSUMPTIONS.roofUsableShare.note})`,
        `${ASSUMPTIONS.kwpPerM2.label}: ${ASSUMPTIONS.kwpPerM2.v} ${ASSUMPTIONS.kwpPerM2.unit} (${ASSUMPTIONS.kwpPerM2.note})`,
        `${ASSUMPTIONS.yieldKwhPerKwp.label}: ${ASSUMPTIONS.yieldKwhPerKwp.v} ${ASSUMPTIONS.yieldKwhPerKwp.unit} (${ASSUMPTIONS.yieldKwhPerKwp.note})`,
      ],
      provenance: 'assumption',
    });
  }
  if (s.battery) {
    out.push({
      id: 'battery',
      label: 'Battery storage',
      setting: `sized at ${round(ASSUMPTIONS.batteryDayShare.v * 100, 0)}% of average daily generation`,
      assumptions: [
        `${ASSUMPTIONS.batteryDayShare.label}: ${ASSUMPTIONS.batteryDayShare.v} (${ASSUMPTIONS.batteryDayShare.note})`,
        `${ASSUMPTIONS.batteryRoundTrip.label}: ${ASSUMPTIONS.batteryRoundTrip.v} (${ASSUMPTIONS.batteryRoundTrip.note})`,
      ],
      provenance: 'assumption',
    });
  }
  if (s.extraTrees > 0) {
    out.push({
      id: 'trees',
      label: 'Additional trees and shade',
      setting: `${s.extraTrees} proposed trees`,
      assumptions: [`${ASSUMPTIONS.crownRadiusM.label}: ${ASSUMPTIONS.crownRadiusM.v} ${ASSUMPTIONS.crownRadiusM.unit} (${ASSUMPTIONS.crownRadiusM.note})`, `${ASSUMPTIONS.greenHeatCut.label}: ${ASSUMPTIONS.greenHeatCut.v} (${ASSUMPTIONS.greenHeatCut.note})`],
      provenance: 'illustrative',
    });
  }
  if (s.reflectiveRoofs) {
    out.push({
      id: 'reflective',
      label: 'Reflective roofing',
      setting: 'applied to warehouse roofs',
      assumptions: [`${ASSUMPTIONS.reflectiveHeatCut.label}: ${ASSUMPTIONS.reflectiveHeatCut.v} (${ASSUMPTIONS.reflectiveHeatCut.note})`],
      provenance: 'illustrative',
    });
  }
  if (s.optimisedRouting) {
    out.push({
      id: 'routing',
      label: 'Optimised freight routing',
      setting: 'shortest-path routing with less idling',
      assumptions: [`${ASSUMPTIONS.routingCut.label}: ${ASSUMPTIONS.routingCut.v} (${ASSUMPTIONS.routingCut.note})`, `${ASSUMPTIONS.idlingCut.label}: ${ASSUMPTIONS.idlingCut.v} (${ASSUMPTIONS.idlingCut.note})`],
      provenance: 'illustrative',
    });
  }
  if (s.evShare > 0) {
    out.push({
      id: 'ev',
      label: 'Fleet electrification',
      setting: `${round(s.evShare * 100, 0)}% of truck movements electric`,
      assumptions: [`${ASSUMPTIONS.kgCo2PerKm.label}: ${ASSUMPTIONS.kgCo2PerKm.v} ${ASSUMPTIONS.kgCo2PerKm.unit} (${ASSUMPTIONS.kgCo2PerKm.note})`],
      provenance: 'assumption',
    });
  }
  return out;
}

function impactsOf(base: Outcome, prop: Outcome): ImpactLine[] {
  const line = (id: string, label: string, unit: string, b: number, p: number): ImpactLine => ({ id, label, unit, baseline: round(b), proposed: round(p), delta: round(p - b) });
  return [
    line('netCo2', 'Net modelled CO2', 't/yr', base.netCo2T, prop.netCo2T),
    line('solar', 'Solar generation', 'MWh/yr', base.solarMWh, prop.solarMWh),
    line('gridAvoided', 'Grid electricity avoided', 'MWh/yr', base.gridAvoidedMWh, prop.gridAvoidedMWh),
    line('solarCo2', 'Emissions avoided by solar', 't/yr', base.solarCo2AvoidedT, prop.solarCo2AvoidedT),
    line('truckCo2', 'Freight CO2', 't/yr', base.truckCo2T, prop.truckCo2T),
    line('treeCo2', 'CO2 absorbed by trees', 't/yr', base.treeCo2AbsorbedT, prop.treeCo2AbsorbedT),
    line('heat', 'Heat index', '', base.heatIndex, prop.heatIndex),
  ];
}

/**
 * Build a structured, auditable action plan comparing a proposed scenario against the baseline.
 * All figures come from `run()`; costs are not modelled and are listed as data gaps.
 */
export function generateActionPlan(scenario: Scenario, baseline: Scenario = BASELINE): ActionPlan {
  const base = run(baseline);
  const prop = run(scenario);
  const interventions = interventionsOf(scenario);
  const impacts = impactsOf(base, prop);
  const assumptions = (Object.keys(ASSUMPTIONS) as (keyof typeof ASSUMPTIONS)[]).map((k) => {
    const a = ASSUMPTIONS[k];
    return { label: a.label, value: a.v, unit: a.unit, note: a.note };
  });
  const dataGaps = [
    'Capital and operating costs are not modelled; payback cannot be computed without cost inputs.',
    'Electricity demand uses an assumed intensity, not metered consumption.',
    'Solar yield and the grid emission factor are assumptions, not site measurements.',
    'Heat effects of trees and reflective roofs are illustrative relative cuts, not a validated thermal model.',
  ];
  return {
    calcVersion: CALC_VERSION,
    baselineVersion: BASELINE_VERSION,
    problem: interventions.length ? 'Reduce modelled annual emissions and heat exposure in Al Sajaa using the selected interventions.' : 'No interventions selected; the proposed scenario equals the baseline.',
    scenario,
    interventions,
    impacts,
    netCo2DeltaT: round(prop.netCo2T - base.netCo2T),
    assumptions,
    dataGaps,
    validation: 'projected',
  };
}

/** A ledger entry recording the projected impact of a scenario, with provenance and status. */
export function ledgerEntry(scenario: Scenario, timestamp: string, baseline: Scenario = BASELINE): LedgerEntry {
  const base = run(baseline);
  const prop = run(scenario);
  return {
    scenarioId: scenarioId(scenario),
    baselineVersion: BASELINE_VERSION,
    calcVersion: CALC_VERSION,
    timestamp,
    assumptions: scenario,
    projectedImpact: {
      netCo2DeltaT: round(prop.netCo2T - base.netCo2T),
      solarMWh: round(prop.solarMWh),
      gridAvoidedMWh: round(prop.gridAvoidedMWh),
      heatIndexDelta: round(prop.heatIndex - base.heatIndex),
    },
    provenance: `Model calc v${CALC_VERSION}; inputs are assumptions and illustrative factors, not measured data.`,
    validation: 'projected',
  };
}

/** Serialise a plan to a stable, pretty JSON string for export. */
export function actionPlanJson(plan: ActionPlan): string {
  return JSON.stringify(plan, null, 2);
}
