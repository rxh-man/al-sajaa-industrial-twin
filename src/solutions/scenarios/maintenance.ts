import { NETWORKS, type PipeSegment } from '../../data/networks';
import { buildingsAlong } from '../graphs';
import { change, inputsKey, mulberry, num, recommend, round } from '../engine';
import type { InputValues, KpiDef, OptionResult, ScenarioDef, ScenarioResult, XZ } from '../types';

/**
 * Predictive maintenance across the water, electricity and district-cooling networks. Each segment's simulated
 * health and install year (from the network model), its size and the buildings it serves give a yearly failure
 * probability and a consequence. A fixed crew budget is spent by four strategies and compared on the expected
 * failures and consequence-weighted risk they remove. Inspection anomalies are SYNTHETIC (seeded, labelled).
 */

const YEAR = 2026;
const LAYERS = ['water', 'electric', 'cooling'] as const;

interface Asset {
  seg: PipeSegment;
  layer: string;
  age: number;
  p: number;
  consequence: number;
  hours: number;
  anomaly: boolean;
}

let base: Omit<Asset, 'p' | 'anomaly'>[] | null = null;
function assets() {
  if (base) return base;
  const out: Omit<Asset, 'p' | 'anomaly'>[] = [];
  for (const n of NETWORKS) {
    if (!(LAYERS as readonly string[]).includes(n.layer.id) || n.variant === 'return') continue;
    for (const s of n.segments) {
      const served = buildingsAlong([{ a: s.a as XZ, b: s.b as XZ }], 3).length;
      // consequence: buildings served, doubled for trunk mains/cables (they feed others)
      const consequence = (1 + served) * (s.trunk ? 2 : 1) * (s.meta.diameterMm >= 600 ? 1.5 : 1);
      // crew-hours to renew: 4 h set-up plus 1 h per 10 m (assumption)
      out.push({ seg: s, layer: n.layer.label, age: YEAR - s.meta.installYear, consequence, hours: 4 + s.length * 10 / 10 });
    }
  }
  base = out;
  return out;
}

/** yearly failure probability: rises with poor health and age (illustrative curve, not a calibrated model) */
export const failureP = (health: number, age: number, anomaly: boolean) => Math.min(0.9, (0.004 + 0.25 * ((100 - health) / 30) ** 2 * Math.max(0.2, age / 40)) * (anomaly ? 3 : 1));

export const KPIS: KpiDef[] = [
  { id: 'failsAvoided', label: 'Expected failures avoided per year', unit: 'failures/yr', better: 'higher', basis: 'Estimated', how: 'Σ failure probability of the renewed segments' },
  { id: 'riskPct', label: 'Network risk removed', unit: '%', better: 'higher', basis: 'Estimated', how: 'Σ (probability × consequence) renewed ÷ network total' },
  { id: 'renewed', label: 'Segments renewed', unit: 'segments', better: 'higher', basis: 'Simulated', how: 'segments that fit the crew budget' },
  { id: 'servedProtected', label: 'Building-connections protected', unit: 'buildings', better: 'higher', basis: 'Estimated', how: 'buildings served by the renewed segments' },
];

export function runMaintenance(v: InputValues): ScenarioResult {
  const budget = num(v, 'crewHours', 50, 5000);
  const anomalyShare = num(v, 'anomalyPct', 0, 20) / 100;
  const seed = Math.round(num(v, 'seed', 1, 999));
  const rnd = mulberry(seed);
  const list: Asset[] = assets().map((a) => {
    const anomaly = rnd() < anomalyShare;
    return { ...a, anomaly, p: failureP(a.seg.meta.health, a.age, anomaly) };
  });
  const totalRisk = list.reduce((s, a) => s + a.p * a.consequence, 0);
  const spend = (order: Asset[]) => {
    let used = 0;
    const picked: Asset[] = [];
    for (const a of order) {
      if (used + a.hours > budget) continue;
      used += a.hours;
      picked.push(a);
    }
    return picked;
  };
  const kp = (picked: Asset[]) => ({
    failsAvoided: picked.reduce((s, a) => s + a.p, 0),
    riskPct: (picked.reduce((s, a) => s + a.p * a.consequence, 0) / totalRisk) * 100,
    renewed: picked.length,
    servedProtected: picked.reduce((s, a) => s + Math.round(a.consequence / ((a.seg.trunk ? 2 : 1) * (a.seg.meta.diameterMm >= 600 ? 1.5 : 1))) - 1, 0),
  });
  const byId = (a: Asset, b: Asset) => a.seg.id.localeCompare(b.seg.id);
  const strategies: [string, string, string, Asset[]][] = [
    ['oldest', 'Oldest first (age-based)', 'Renew the oldest assets until the budget runs out.', [...list].sort((a, b) => b.age - a.age || byId(a, b))],
    ['health', 'Worst condition first', 'Renew the lowest-health assets first.', [...list].sort((a, b) => a.seg.meta.health - b.seg.meta.health || byId(a, b))],
    ['risk', 'Risk-based (probability × consequence)', 'Renew the assets with the highest expected consequence first.', [...list].sort((a, b) => b.p * b.consequence - a.p * a.consequence || byId(a, b))],
    ['value', 'Risk per crew-hour', 'Renew the assets that remove the most risk per hour of crew time first.', [...list].sort((a, b) => (b.p * b.consequence) / b.hours - (a.p * a.consequence) / a.hours || byId(a, b))],
  ];
  const results = strategies.map(([id, name, summary, order]) => {
    const picked = spend(order);
    return { o: { id, name, summary, kpis: kp(picked), actions: picked.slice(0, 12).map((a) => a.seg.id), feasible: picked.length > 0, infeasibleWhy: picked.length ? undefined : 'The budget does not cover a single renewal.' } as OptionResult, picked };
  });
  const baseline = { ...results[0].o, id: 'baseline' };
  const options = results.slice(1).map((r) => r.o);
  const rec = recommend(baseline, options, KPIS, { riskPct: 0.6, failsAvoided: 0.3, servedProtected: 0.1 }, (o) => `Removes the most consequence-weighted risk for the same ${budget} crew-hours: ${round(o.kpis.riskPct ?? 0, 1)} % vs ${round(baseline.kpis.riskPct ?? 0, 1)} % for age-based renewal.`);
  const chosen = results.find((r) => r.o.id === rec.optionId) ?? results[0];
  const anomalies = list.filter((a) => a.anomaly);
  const c = change(baseline.kpis.riskPct, chosen.o.kpis.riskPct);
  const top = [...list].sort((a, b) => b.p * b.consequence - a.p * a.consequence).slice(0, 5);
  return {
    scenarioId: 'maintenance',
    inputsKey: inputsKey(v),
    baseline,
    options,
    kpis: KPIS,
    recommendation: rec,
    findings: [
      `${list.length} segments across water, electricity and district cooling; network risk ${round(totalRisk, 1)} (probability × consequence units).`,
      `Highest-risk assets: ${top.map((a) => `${a.seg.id} (${a.layer}, health ${a.seg.meta.health} %, ${a.age} yrs)`).join('; ')}.`,
      `${anomalies.length} synthetic inspection anomalies (seed ${seed}) triple the failure probability of their segments.`,
      c.pct === null ? '' : `The recommended strategy removes ${round(c.pct, 0)} % more risk than age-based renewal.`,
    ].filter(Boolean),
    affectedAssets: chosen.picked.slice(0, 10).map((a) => a.seg.id),
    tradeoffs: ['Risk-based renewal leaves some very old but lightly loaded assets in service longer.', 'Renewals need excavation and short supply interruptions of their own (not modelled).'],
    assumptions: [
      'Failure probability rises with (100 − health)² and age (illustrative curve, not calibrated).',
      'Consequence = buildings served within 30 m + 1, ×2 for trunk lines, ×1.5 for mains ≥ 600 mm.',
      'Renewal takes 4 crew-hours set-up plus 1 crew-hour per 10 m.',
      `Synthetic anomalies: ${round(anomalyShare * 100, 0)} % of segments, seeded (${seed}), clearly not real inspection data.`,
    ],
    limitations: ['Asset health and install years are simulated by the network model.', 'No failure history, so the probability curve cannot be validated.'],
    unavailable: [
      { metric: 'Renewal cost (AED) and avoided repair cost', needs: 'utility unit costs and failure-cost records' },
      { metric: 'Calibrated failure rates', needs: 'the asset register and historical failure data' },
    ],
    confidence: { level: 'low', why: 'The ranking logic is sound, but every input is simulated or assumed.' },
    highlight: {
      points: anomalies.slice(0, 10).map((a) => ({ x: (a.seg.a[0] + a.seg.b[0]) / 2, z: (a.seg.a[1] + a.seg.b[1]) / 2, role: 'affected' as const, label: `${a.seg.id} · synthetic anomaly` })),
      paths: [
        ...chosen.picked.map((a) => ({ pts: [a.seg.a as XZ, a.seg.b as XZ], role: 'action' as const, label: a.seg.id })),
        ...top.map((a) => ({ pts: [a.seg.a as XZ, a.seg.b as XZ], role: 'problem' as const, label: a.seg.id })),
      ],
      focus: { x: (top[0].seg.a[0] + top[0].seg.b[0]) / 2, z: (top[0].seg.a[1] + top[0].seg.b[1]) / 2, r: 70 },
    },
  };
}

export const MAINTENANCE: ScenarioDef = {
  id: 'maintenance',
  title: 'Predictive maintenance',
  titleAr: 'الصيانة التنبؤية',
  icon: 'wrench',
  problem: 'With a fixed crew budget, which pipes and cables should be renewed this year?',
  why: 'Renewing by age alone spends crews on assets that rarely fail or matter little; a risk-based plan prevents more outages for the same effort.',
  infrastructure: ['Water mains', 'Electricity feeders', 'District cooling supply', 'Maintenance crews'],
  inputs: [
    { kind: 'range', id: 'crewHours', label: 'Crew budget this year', min: 200, max: 3000, step: 100, unit: 'crew-h' },
    { kind: 'range', id: 'anomalyPct', label: 'Synthetic inspection anomalies', min: 0, max: 10, step: 1, unit: '% of segments' },
    { kind: 'range', id: 'seed', label: 'Anomaly seed (synthetic data)', min: 1, max: 50, step: 1, unit: '' },
  ],
  defaults: { crewHours: 800, anomalyPct: 3, seed: 7 },
  run: runMaintenance,
};
