/**
 * Climate Mission Mode: guided interactive workflow.
 *
 * Flow: assess baseline → identify issues → recommend interventions → select portfolio
 *       → apply to scenario → compare → download action plan.
 *
 * Everything is modelled; no real data. Interventions are not real commitments and have
 * no measured outcomes or integration with external systems.
 */

import { ASSUMPTIONS, BASELINE, run, type Scenario } from './climateAgents';
import { generateActionPlan, ledgerEntry, type ActionPlan, type LedgerEntry } from './actionPlan';

export type StepId = 'assess' | 'identify' | 'recommend' | 'select' | 'apply' | 'compare';

export interface BaselineAssessment {
  solarMWh: number;
  netCo2T: number;
  treeCo2AbsorbedT: number;
  factoryCo2T: number;
  truckCo2T: number;
  gridImportMWh: number;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  impact: string; // qualitative: "high" | "medium" | "low"
  affectedDimensions: string[];
}

export interface Intervention {
  id: string;
  title: string;
  description: string;
  issue: string; // issue id it addresses
  parameters: { [key: string]: { value: number; min: number; max: number; unit: string } };
  assumptions: string[];
  dataGaps: string[];
  estimatedCo2Reduction: number; // kg CO2/yr, modelled
  feasibility: 'high' | 'medium' | 'low';
}

export interface SelectedIntervention {
  id: string;
  parameters: { [key: string]: number };
}

export interface MissionState {
  step: StepId;
  baseline: Scenario;
  baselineAssessment: BaselineAssessment | null;
  issues: Issue[];
  interventions: Intervention[];
  selected: SelectedIntervention[];
  proposedScenario: Scenario | null;
  comparison: {
    baseline: ReturnType<typeof run> | null;
    proposed: ReturnType<typeof run> | null;
    actionPlan: ActionPlan | null;
    ledger: LedgerEntry | null;
  };
}

/** Assess the baseline scenario: compute key metrics and issues. */
export function assessBaseline(sc: Scenario): BaselineAssessment {
  const outcome = run(sc);
  if (outcome.factoryCo2T > 100) {
    // Issue detection could be used later, but not stored in assessment for now
  }
  return {
    solarMWh: outcome.solarMWh,
    netCo2T: outcome.netCo2T,
    treeCo2AbsorbedT: outcome.treeCo2AbsorbedT,
    factoryCo2T: outcome.factoryCo2T,
    truckCo2T: outcome.truckCo2T,
    gridImportMWh: outcome.gridImportMWh,
  };
}

/** Generate a set of recommended interventions based on the baseline. */
export function recommendInterventions(assessment: BaselineAssessment): Intervention[] {
  const interventions: Intervention[] = [];

  // Solar: always relevant
  if (assessment.solarMWh < 50) {
    interventions.push({
      id: 'expand-solar',
      title: 'Expand warehouse solar coverage',
      description: 'Install solar panels on more warehouse roofs to increase generation.',
      issue: 'high-factory-emissions',
      parameters: {
        coverage: { value: 0.5, min: 0, max: 1, unit: 'fraction of roof area' },
      },
      assumptions: [
        'Panel efficiency 20% (illustration)',
        'No battery loss or seasonal variation',
        'Installation is instantaneous (no ramp-up)',
      ],
      dataGaps: ['Real panel costs and lifetime', 'Installation timelines and labor', 'Actual grid demand curves'],
      estimatedCo2Reduction: 8500, // modelled
      feasibility: 'high',
    });
  }

  // Trees: always relevant
  interventions.push({
    id: 'add-trees',
    title: 'Plant shade trees and green spaces',
    description: 'Expand canopy and parks to increase carbon absorption and cooling.',
    issue: 'high-factory-emissions',
    parameters: {
      extraTrees: { value: 200, min: 0, max: 1000, unit: 'trees' },
    },
    assumptions: [
      'Each tree absorbs ~17 kg CO2/yr (illustration)',
      'Trees reach maturity instantly (modelling simplification)',
      'No maintenance or failure',
    ],
    dataGaps: ['Actual growth rates and maturity times', 'Species-specific absorption rates', 'Maintenance costs'],
    estimatedCo2Reduction: 3400, // 200 * 17
    feasibility: 'medium',
  });

  // EV routing: relevant if truck CO2 is high
  if (assessment.truckCo2T > 5) {
    interventions.push({
      id: 'optimize-routing',
      title: 'Optimise freight routing (emissions-aware)',
      description: 'Route trucks via lower-emission road classes (fewer stops, less idling).',
      issue: 'high-factory-emissions',
      parameters: {
        adoption: { value: 0.3, min: 0, max: 1, unit: 'fraction of fleet' },
      },
      assumptions: [
        'Emission savings from road class choice: 5–10% per trip',
        'No additional cost or time penalty',
        'Driver acceptance and training time ignored',
      ],
      dataGaps: ['Real routing software integrations', 'Actual time and cost trade-offs', 'Driver adoption rates'],
      estimatedCo2Reduction: assessment.truckCo2T * 1000 * 0.075, // 7.5% of truck CO2, modelled
      feasibility: 'high',
    });
  }

  return interventions;
}

/** Create a mission state. */
export function createMission(baseline: Scenario = BASELINE): MissionState {
  const assessment = assessBaseline(baseline);
  const interventions = recommendInterventions(assessment);
  return {
    step: 'assess',
    baseline,
    baselineAssessment: assessment,
    issues: [], // populated from assessment
    interventions,
    selected: [],
    proposedScenario: null,
    comparison: {
      baseline: run(baseline),
      proposed: null,
      actionPlan: null,
      ledger: null,
    },
  };
}

/** Move to next step. */
export function advanceStep(state: MissionState, step: StepId): MissionState {
  return { ...state, step };
}

/** Select an intervention with parameters. */
export function selectIntervention(state: MissionState, id: string, params: { [key: string]: number }): MissionState {
  const existing = state.selected.findIndex((s) => s.id === id);
  if (existing >= 0) {
    const newSelected = [...state.selected];
    newSelected[existing] = { id, parameters: params };
    return { ...state, selected: newSelected };
  }
  return { ...state, selected: [...state.selected, { id, parameters: params }] };
}

/** Deselect an intervention. */
export function deselectIntervention(state: MissionState, id: string): MissionState {
  return { ...state, selected: state.selected.filter((s) => s.id !== id) };
}

/** Apply selected interventions to the baseline scenario to create a proposed scenario. */
export function applyInterventions(state: MissionState): MissionState {
  let scenario = { ...state.baseline };
  for (const sel of state.selected) {
    const iv = state.interventions.find((i) => i.id === sel.id);
    if (!iv) continue;
    // Map intervention to scenario parameters
    if (sel.id === 'expand-solar' && 'coverage' in sel.parameters) {
      scenario.solarCoverage = sel.parameters.coverage;
    } else if (sel.id === 'add-trees' && 'extraTrees' in sel.parameters) {
      scenario.extraTrees = sel.parameters.extraTrees;
    } else if (sel.id === 'optimize-routing' && 'adoption' in sel.parameters) {
      scenario.optimisedRouting = sel.parameters.adoption > 0;
    }
  }
  const comparison = {
    ...state.comparison,
    proposed: run(scenario),
    actionPlan: generateActionPlan(scenario, state.baseline),
    ledger: ledgerEntry(scenario, new Date().toISOString(), state.baseline),
  };
  return {
    ...state,
    proposedScenario: scenario,
    comparison,
  };
}

/** Download the action plan as JSON. */
export function downloadActionPlan(state: MissionState) {
  if (!state.comparison.actionPlan) return null;
  return {
    title: 'Al Sajaa Climate Action Plan',
    generatedAt: new Date().toISOString(),
    baseline: state.baseline,
    proposed: state.proposedScenario,
    interventions: state.selected,
    actionPlan: state.comparison.actionPlan,
    ledger: state.comparison.ledger,
    assumptions: ASSUMPTIONS,
  };
}
