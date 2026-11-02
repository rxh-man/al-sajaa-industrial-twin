import { BASE_OPS, facilityKpis, FACILITIES, PROFILE, demandShare, tenantRelease, type OpsState } from '../../parknex/model';
import { change, inputsKey, num, pick, recommend, round } from '../engine';
import type { InputValues, KpiDef, OptionResult, ScenarioDef, ScenarioResult } from '../types';

/**
 * PARKNEX parking intelligence: pricing and capacity strategies for one facility over a day, on the PARKNEX
 * model (demand profiles, price response, tenant release). Revenue is simulated AED, not transactions.
 */
const IDS = () => FACILITIES.map((f) => f.id);

export const KPIS: KpiDef[] = [
  { id: 'revenueDay', label: 'Revenue per day', unit: 'AED', better: 'higher', basis: 'Simulated', how: 'Σ half-hours of paid occupancy × tariff (PARKNEX model)' },
  { id: 'peakOcc', label: 'Peak occupancy', unit: '%', better: 'lower', basis: 'Simulated', how: 'highest half-hourly occupancy; above ~90 % drivers circle and queue' },
  { id: 'turnedAway', label: 'Drivers turned away per day', unit: 'vehicles', better: 'lower', basis: 'Estimated', how: 'demand above capacity in each half-hour ÷ average stay' },
  { id: 'waitMin', label: 'Peak entry wait', unit: 'min', better: 'lower', basis: 'Estimated', how: 'barrier queue model at the peak occupancy' },
];

export function runParking(v: InputValues): ScenarioResult {
  const id = pick(v, 'facility', IDS());
  const uplift = num(v, 'demandUplift', 0, 60) / 100;
  const priceUp = num(v, 'priceUp', 0, 100) / 100;
  const f = FACILITIES.find((x) => x.id === id)!;
  const cap = f.bays.length * f.floors;
  const day = (o: OpsState, extraCap = 0) => {
    let rev = 0;
    let peak = 0;
    let away = 0;
    for (let h = 0; h < 24; h += 0.5) {
      const want = demandShare(f, o, h) * (1 + uplift) * cap;
      const served = Math.min(want, cap + extraCap);
      away += Math.max(0, want - cap - extraCap) * 0.5 / f.stayH;
      peak = Math.max(peak, served / (cap + extraCap));
      rev += served * 0.85 * f.tariffHour * (o.tariffMul[f.id] ?? 1) * 0.5;
    }
    const k = facilityKpis(f, { ...o, hour: 12 });
    return { revenueDay: rev, peakOcc: peak * 100, turnedAway: away, waitMin: peak > 0.97 ? 3 : k.waitMin };
  };
  const base = { ...BASE_OPS, maintenance: new Set<string>() };
  const peakH = PROFILE[f.type].indexOf(Math.max(...PROFILE[f.type]));
  const baseline: OptionResult = { id: 'baseline', name: 'Current tariff', summary: `${f.name}: AED ${f.tariffHour}/h, ${cap} bays.`, kpis: day(base), actions: [], feasible: true };
  const t = tenantRelease(f, { protectPct: 10, maxRelease: 80, visitorDemand: 80, hours: 8, tariff: f.tariffHour });
  const options: OptionResult[] = [
    { id: 'raise', name: `Raise the tariff ${round(priceUp * 100, 0)} %`, summary: 'Flat increase all day; demand responds (elasticity −0.35).', kpis: day({ ...base, tariffMul: { [f.id]: 1 + priceUp } }), actions: [`${f.id}: tariff × ${round(1 + priceUp, 2)}`], feasible: priceUp > 0 },
    { id: 'dynamic', name: 'Peak-hour dynamic pricing', summary: `+${round(priceUp * 100, 0)} % only around the peak (${peakH}:00 ± 2 h), −15 % off-peak.`, kpis: (() => {
      let rev = 0, peak = 0, away = 0;
      for (let h = 0; h < 24; h += 0.5) {
        const mul = Math.abs(h - peakH) <= 2 ? 1 + priceUp : 0.85;
        const o = { ...base, tariffMul: { [f.id]: mul } };
        const want = demandShare(f, o, h) * (1 + uplift) * cap;
        const served = Math.min(want, cap);
        away += Math.max(0, want - cap) * 0.5 / f.stayH;
        peak = Math.max(peak, served / cap);
        rev += served * 0.85 * f.tariffHour * mul * 0.5;
      }
      return { revenueDay: rev, peakOcc: peak * 100, turnedAway: away, waitMin: peak > 0.97 ? 3 : 0.5 };
    })(), actions: [`${f.id}: time-of-day tariff`], feasible: priceUp > 0 },
    { id: 'release', name: `Release ${t.release} tenant bays to visitors (09–17)`, summary: `${t.unused} tenant bays expected unused; ${t.protectedBays} kept as protection buffer.`, kpis: { ...day(base, t.release * 0.5), revenueDay: day(base, t.release * 0.5).revenueDay + t.extraRevenueDay }, actions: [`${f.id}: release ${t.release} tenant bays`], feasible: t.release > 0, infeasibleWhy: t.release > 0 ? undefined : 'No tenant bays at this facility.' },
  ];
  const rec = recommend(baseline, options, KPIS, { revenueDay: 0.45, turnedAway: 0.35, peakOcc: 0.2 }, (o) => `Best balance of revenue (45 %), drivers turned away (35 %) and peak crowding (20 %): ${o.name}.`);
  const c = change(baseline.kpis.revenueDay, options.find((o) => o.id === rec.optionId)?.kpis.revenueDay ?? null);
  return {
    scenarioId: 'parking',
    inputsKey: inputsKey(v),
    baseline,
    options,
    kpis: KPIS,
    recommendation: rec,
    findings: [
      `${f.name}: ${cap} bays, peak demand around ${peakH}:00, average stay ${f.stayH} h (simulated).`,
      `Demand uplift ${round(uplift * 100, 0)} % applied to the daily profile.`,
      c.pct === null ? '' : `The recommended strategy changes daily revenue by ${round(c.pct, 0)} %.`,
    ].filter(Boolean),
    affectedAssets: [f.name],
    tradeoffs: ['Higher tariffs cut crowding but push some drivers to street parking or other facilities.', 'Releasing tenant bays earns revenue but must keep a protection buffer for tenants returning early.'],
    assumptions: ['Price elasticity −0.35 (short-run parking studies range about −0.1 to −0.6).', '85 % of occupied bays are paying sessions.', 'Tenant release only within configured hours with a 10 % protection buffer.'],
    limitations: ['Simulated demand profiles; no payment or sensor data connected.'],
    unavailable: [{ metric: 'Actual revenue and price response', needs: 'payment-system transactions and an A/B tariff trial' }],
    confidence: { level: 'low', why: 'Profiles and elasticity are assumptions.' },
    highlight: { points: [{ x: f.site.x, z: f.site.z, role: 'facility', label: f.name }], paths: [{ pts: [[f.site.x - f.site.w / 2, f.site.z - f.site.d / 2], [f.site.x + f.site.w / 2, f.site.z - f.site.d / 2], [f.site.x + f.site.w / 2, f.site.z + f.site.d / 2], [f.site.x - f.site.w / 2, f.site.z + f.site.d / 2], [f.site.x - f.site.w / 2, f.site.z - f.site.d / 2]], role: 'action', label: f.name }], focus: { x: f.site.x, z: f.site.z, r: 25 } },
  };
}

export const PARKING: ScenarioDef = {
  id: 'parking',
  title: 'PARKNEX parking strategy',
  titleAr: 'استراتيجية مواقف PARKNEX',
  icon: 'square-parking',
  problem: 'Which pricing or capacity strategy should a PARKNEX facility use to earn more while turning fewer drivers away?',
  why: 'Full car parks lose drivers and revenue; empty ones waste capital. Price and allocation move demand.',
  infrastructure: ['PARKNEX facilities', 'Tariffs', 'Tenant allocation', 'Guidance signs'],
  get inputs() {
    return [
      { kind: 'select' as const, id: 'facility', label: 'Facility', options: FACILITIES.map((f) => ({ value: f.id, label: f.name })) },
      { kind: 'range' as const, id: 'demandUplift', label: 'Demand uplift (growth / events)', min: 0, max: 50, step: 5, unit: '%' },
      { kind: 'range' as const, id: 'priceUp', label: 'Tariff increase tested', min: 0, max: 60, step: 5, unit: '%' },
    ];
  },
  get defaults() {
    return { facility: FACILITIES[0]?.id ?? 'central', demandUplift: 15, priceUp: 20 };
  },
  run: runParking,
};
