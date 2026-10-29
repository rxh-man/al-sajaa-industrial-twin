import type { InputValues, KpiDef, OptionResult, Recommendation } from './types';

/**
 * Deterministic helpers shared by every scenario: input reading with validation, change arithmetic, and the
 * recommendation scoring (explicit weights over normalised KPI improvements, feasible options only).
 */

export class InputError extends Error {}

/** a numeric input, clamped to [min, max]; a non-numeric value is rejected (no silent defaults) */
export function num(v: InputValues, id: string, min: number, max: number): number {
  const x = v[id];
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
  if (!Number.isFinite(n)) throw new InputError(`Input "${id}" must be a number.`);
  return Math.min(max, Math.max(min, n));
}

export function pick<T extends string>(v: InputValues, id: string, allowed: readonly T[]): T {
  const x = String(v[id]);
  if (!(allowed as readonly string[]).includes(x)) throw new InputError(`Input "${id}" must be one of: ${allowed.join(', ')}.`);
  return x as T;
}

export const flag = (v: InputValues, id: string) => v[id] === true || v[id] === 'true';

/** stable key for a set of inputs (sorted), so results can be tied to the inputs that produced them */
export function inputsKey(v: InputValues) {
  return Object.keys(v)
    .sort()
    .map((k) => `${k}=${v[k]}`)
    .join('&');
}

export const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** absolute and percentage change from a baseline; the percentage is null where it is not meaningful */
export function change(baseline: number | null, value: number | null) {
  if (baseline === null || value === null) return { abs: null as number | null, pct: null as number | null };
  const abs = value - baseline;
  // a percentage of zero, or across a sign change, is not meaningful
  const pct = Math.abs(baseline) < 1e-9 || baseline * value < 0 ? null : (abs / Math.abs(baseline)) * 100;
  return { abs, pct };
}

/**
 * Pick the option with the highest weighted score. For each weighted KPI the improvement over the baseline is
 * normalised by the largest improvement any option achieves (so weights compare like with like); worse than the
 * baseline counts negative. Infeasible options score -Infinity. Ties go to the earlier option.
 */
export function recommend(baseline: OptionResult, options: OptionResult[], kpis: KpiDef[], weights: Record<string, number>, describe: (best: OptionResult) => string): Recommendation {
  const scores: Record<string, number> = {};
  const gain = (o: OptionResult, k: KpiDef) => {
    const b = baseline.kpis[k.id];
    const v = o.kpis[k.id];
    if (b === null || b === undefined || v === null || v === undefined) return 0;
    return k.better === 'lower' ? b - v : v - b;
  };
  const scale: Record<string, number> = {};
  for (const k of kpis) {
    if (!weights[k.id]) continue;
    scale[k.id] = Math.max(1e-9, ...options.map((o) => Math.abs(gain(o, k))));
  }
  let best: OptionResult | null = null;
  for (const o of options) {
    if (!o.feasible) {
      scores[o.id] = -Infinity;
      continue;
    }
    let s = 0;
    for (const k of kpis) if (weights[k.id]) s += (weights[k.id] * gain(o, k)) / scale[k.id];
    scores[o.id] = Math.round(s * 1000) / 1000;
    if (!best || scores[o.id] > scores[best.id]) best = o;
  }
  if (!best) return { optionId: '', weights, scores, why: 'No feasible option under the current inputs; see why each option was ruled out.' };
  return { optionId: best.id, weights, scores, why: describe(best) };
}

/** a short "x → y (−z %)" line for explanations */
export function delta(k: KpiDef, b: number | null, v: number | null, d = 1) {
  if (b === null || v === null) return `${k.label}: n/a`;
  const { pct } = change(b, v);
  return `${k.label} ${round(b, d)} → ${round(v, d)} ${k.unit}${pct === null ? '' : ` (${pct >= 0 ? '+' : ''}${round(pct, 0)} %)`}`;
}

/** a small deterministic generator (for synthetic, labelled inputs only) */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
