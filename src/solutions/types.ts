/**
 * Solutions Lab and AI Operations Agent: shared types.
 *
 * Every scenario is a pure, deterministic model over the existing city data: the same inputs always give the
 * same result. Results say where every number comes from (basis) and list what the model cannot estimate.
 * Nothing here is measured or connected to live infrastructure.
 */

export type XZ = [number, number];

/** Where a number comes from. 'Unavailable' metrics carry no value and say what data they would need. */
export type Basis = 'Simulated' | 'Estimated' | 'Assumption' | 'Layout' | 'Unavailable';

export type InputSpec =
  | { kind: 'range'; id: string; label: string; min: number; max: number; step: number; unit?: string; help?: string }
  | { kind: 'select'; id: string; label: string; options: { value: string; label: string }[]; help?: string }
  | { kind: 'toggle'; id: string; label: string; help?: string };

export type InputValues = Record<string, number | string | boolean>;

export interface KpiDef {
  id: string;
  label: string;
  unit: string;
  /** which direction is an improvement */
  better: 'lower' | 'higher';
  basis: Basis;
  /** how the number is computed, in one line */
  how: string;
}

/** One intervention (or the baseline) and its KPI values (null = not applicable for this option). */
export interface OptionResult {
  id: string;
  name: string;
  summary: string;
  kpis: Record<string, number | null>;
  /** asset ids, roads or places this option acts on */
  actions: string[];
  /** feasibility under the user's constraints; an infeasible option is shown but never recommended */
  feasible: boolean;
  infeasibleWhy?: string;
}

export type HighlightRole = 'problem' | 'affected' | 'action' | 'route' | 'alt' | 'facility';

export interface Highlight {
  points: { x: number; z: number; role: HighlightRole; label: string }[];
  paths: { pts: XZ[]; role: HighlightRole; label: string }[];
  /** where to point the camera, and how far out */
  focus: { x: number; z: number; r: number };
}

export interface Recommendation {
  optionId: string;
  /** the scoring that picked it: weights per KPI and each option's score, so the choice is traceable */
  weights: Record<string, number>;
  scores: Record<string, number>;
  why: string;
}

export interface ScenarioResult {
  scenarioId: string;
  /** a fingerprint of the inputs, so a result can be matched to the inputs that produced it */
  inputsKey: string;
  baseline: OptionResult;
  options: OptionResult[];
  kpis: KpiDef[];
  recommendation: Recommendation;
  /** the problem as found in the model: what and where */
  findings: string[];
  affectedAssets: string[];
  tradeoffs: string[];
  assumptions: string[];
  limitations: string[];
  unavailable: { metric: string; needs: string }[];
  confidence: { level: 'low' | 'medium' | 'high'; why: string };
  highlight: Highlight;
}

export interface ScenarioDef {
  id: string;
  title: string;
  titleAr: string;
  icon: string;
  problem: string;
  why: string;
  infrastructure: string[];
  inputs: InputSpec[];
  defaults: InputValues;
  run: (inputs: InputValues) => ScenarioResult;
}
