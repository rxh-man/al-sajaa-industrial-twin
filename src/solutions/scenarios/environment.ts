import { AD } from '../../data/abudhabi';
import { airQualityBaseline, airQualityMitigated, type Wind } from '../../data/airDispersion';
import { STREETSCAPE } from '../../data/streetscapeData';
import { DISTRICTS } from '../../sustainability/districts';
import { BASE_LEVERS, snapshot } from '../../sustainability/model';
import { change, inputsKey, num, recommend, round } from '../engine';
import type { InputValues, KpiDef, OptionResult, ScenarioDef, ScenarioResult, XZ } from '../types';

/* ================= Air quality (Environmental Risk) ================= */

/** receptors: where people gather or sleep (schools, mosques, malls, labour accommodation) */
const receptors = () =>
  AD.buildings.filter((b) => ['school', 'mosque', 'mall', 'hospital'].includes(b.k) || b.n === 'Labor accommodation').map((b) => ({ name: b.n, p: b.c as XZ }));

export const AIR_KPIS: KpiDef[] = [
  { id: 'worst', label: 'Worst receptor index', unit: 'index 0–1', better: 'lower', basis: 'Simulated', how: 'highest modelled concentration index at a school, mosque, mall or labour camp' },
  { id: 'mean', label: 'Mean receptor index', unit: 'index 0–1', better: 'lower', basis: 'Simulated', how: 'average over all receptors' },
  { id: 'over', label: 'Receptors above threshold', unit: 'receptors', better: 'lower', basis: 'Simulated', how: 'receptors whose index exceeds the threshold input' },
];

export function runAir(v: InputValues): ScenarioResult {
  const wind: Wind = { directionDeg: num(v, 'windDeg', 0, 359), speedUnitsPerSec: num(v, 'windMs', 0.5, 15) / 10 };
  const threshold = num(v, 'threshold', 0.0005, 1);
  const cut = num(v, 'cutPct', 10, 90) / 100;
  const R = receptors();
  const base = R.map((r) => airQualityBaseline(r.p, wind));
  // the factories that contribute most across all receptors
  const contrib = new Map<number, number>();
  for (const b of base) for (const s of b.sources) contrib.set(s.factoryId, (contrib.get(s.factoryId) ?? 0) + s.contribution);
  const ranked = [...contrib].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
  const kpis = (vals: number[]) => ({ worst: Math.max(0, ...vals), mean: vals.reduce((a, x) => a + x, 0) / Math.max(1, vals.length), over: vals.filter((x) => x > threshold).length });
  const mitigate = (ids: number[], factor: number) => R.map((r) => airQualityMitigated(r.p, wind, new Map(ids.map((id) => [id, factor]))).totalConcentration);
  const baseVals = base.map((b) => b.totalConcentration);
  const top3 = ranked.slice(0, 3);
  const top10 = ranked.slice(0, 10);
  const baseline: OptionResult = { id: 'baseline', name: 'No action', summary: `Wind from ${round(wind.directionDeg, 0)}° at ${round(wind.speedUnitsPerSec * 10, 1)} m/s; all factories at their modelled levels.`, kpis: kpis(baseVals), actions: [], feasible: true };
  const options: OptionResult[] = [
    { id: 'curtail', name: 'Curtail the top 3 contributors today', summary: `Factories ${top3.map((i) => `#${i}`).join(', ')} cut output by ${round(cut * 100, 0)} % while this wind lasts.`, kpis: kpis(mitigate(top3, 1 - cut)), actions: top3.map((i) => `#${i}`), feasible: top3.length > 0 },
    { id: 'filters', name: 'Abatement at the top 10 contributors', summary: `Filters and low-NOx burners at the ten largest contributors (−60 % emissions, permanent).`, kpis: kpis(mitigate(top10, 0.4)), actions: top10.map((i) => `#${i}`), feasible: top10.length > 0 },
  ];
  const rec = recommend(baseline, options, AIR_KPIS, { worst: 0.4, over: 0.4, mean: 0.2 }, (o) => `Largest cut in exposure at sensitive sites: worst receptor ${round(baseline.kpis.worst ?? 0, 3)} → ${round(o.kpis.worst ?? 0, 3)}, ${baseline.kpis.over} → ${o.kpis.over} above the threshold.`);
  const worstIdx = baseVals.indexOf(Math.max(...baseVals));
  const c = change(baseline.kpis.worst, options.find((o) => o.id === rec.optionId)?.kpis.worst ?? null);
  const fac = (id: number) => AD.buildings.find((b) => b.id === id);
  return {
    scenarioId: 'air',
    inputsKey: inputsKey(v),
    baseline,
    options,
    kpis: AIR_KPIS,
    recommendation: rec,
    findings: [
      `${R.length} sensitive receptors; worst is ${R[worstIdx]?.name ?? 'n/a'} (index ${round(baseVals[worstIdx] ?? 0, 3)}).`,
      `Largest contributors under this wind: ${top3.map((i) => `#${i}`).join(', ')}.`,
      c.pct === null ? '' : `The recommended action changes the worst-receptor index by ${round(c.pct, 0)} %.`,
    ].filter(Boolean),
    affectedAssets: R.filter((_, i) => baseVals[i] > threshold).map((r) => r.name).slice(0, 8),
    tradeoffs: ['Curtailment works today but costs production; abatement is permanent but takes months to install.'],
    assumptions: ['Simplified Gaussian plume per factory (the twin\'s existing air model), receptor at stack height, no terrain or stability classes.', 'Emission levels per factory are the model\'s simulated levels.'],
    limitations: ['The index is relative, not µg/m³; no validation against monitors.'],
    unavailable: [{ metric: 'Concentrations in µg/m³ and health impact', needs: 'stack emission rates, meteorology and monitoring data' }],
    confidence: { level: 'low', why: 'Plume shape is a textbook simplification and emissions are simulated.' },
    highlight: {
      points: [
        ...top10.map((id) => ({ x: fac(id)?.c[0] ?? 0, z: fac(id)?.c[1] ?? 0, role: (top3.includes(id) ? 'problem' : 'affected') as 'problem' | 'affected', label: `Factory #${id}` })),
        ...R.map((r, i) => ({ x: r.p[0], z: r.p[1], role: (baseVals[i] > threshold ? 'facility' : 'alt') as 'facility' | 'alt', label: `${r.name} · ${round(baseVals[i], 3)}` })).filter((_, i) => baseVals[i] > threshold).slice(0, 6),
      ],
      paths: [],
      focus: { x: fac(top3[0])?.c[0] ?? 0, z: fac(top3[0])?.c[1] ?? -100, r: 80 },
    },
  };
}

export const AIR: ScenarioDef = {
  id: 'air',
  title: 'Air quality at sensitive sites',
  titleAr: 'جودة الهواء في المواقع الحساسة',
  icon: 'wind',
  problem: 'Under today\'s wind, which factories drive pollution at schools, mosques, malls and labour camps, and what is the most effective response?',
  why: 'Short-term curtailment and long-term abatement protect different people at different cost; the wind decides who is exposed.',
  infrastructure: ['Factory stacks', 'Schools, mosques, malls, labour camps', 'Wind'],
  inputs: [
    { kind: 'range', id: 'windDeg', label: 'Wind direction', min: 0, max: 355, step: 5, unit: '°' },
    { kind: 'range', id: 'windMs', label: 'Wind speed', min: 1, max: 12, step: 0.5, unit: 'm/s' },
    { kind: 'range', id: 'cutPct', label: 'Curtailment of top contributors', min: 10, max: 90, step: 10, unit: '%' },
    { kind: 'range', id: 'threshold', label: 'Alert threshold (relative index)', min: 0.001, max: 0.02, step: 0.001, unit: '' },
  ],
  defaults: { windDeg: 270, windMs: 3, cutPct: 50, threshold: 0.004 },
  run: runAir,
};

/* ================= Hypothetical flood / drainage (Environmental Risk) ================= */

const C_IMPERVIOUS = 0.9;
const C_PERVIOUS = 0.2; // sandy ground (assumption)

function districtSurfaces() {
  return DISTRICTS.filter((d) => d.id !== 'lagoons').map((d) => {
    const [x0, x1, z0, z1] = d.box;
    const area = (x1 - x0) * (z1 - z0) * 100;
    const inside = (x: number, z: number) => x >= x0 && x < x1 && z >= z0 && z < z1;
    const roofs = AD.buildings.filter((b) => inside(b.c[0], b.c[1])).reduce((a, b) => a + b.b.reduce((s, [bx0, bz0, bx1, bz1]) => s + Math.abs(bx1 - bx0) * Math.abs(bz1 - bz0) * 100, 0), 0);
    let roads = 0;
    for (const r of AD.roads) {
      if (r.c === 'rail' || r.c === 'footway') continue;
      for (let i = 1; i < r.p.length; i++) {
        const [ax, az] = r.p[i - 1];
        const [bx, bz] = r.p[i];
        if (inside((ax + bx) / 2, (az + bz) / 2)) roads += Math.hypot(bx - ax, bz - az) * r.w * 100;
      }
    }
    const lots = STREETSCAPE.lots.filter((l) => inside((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2)).reduce((a, l) => a + (l.x1 - l.x0) * (l.z1 - l.z0) * 100, 0);
    const impervious = Math.min(area, roofs + roads + lots);
    return { d, area, roofs, paved: roads + lots, impervious };
  });
}

export const FLOOD_KPIS: KpiDef[] = [
  { id: 'excessM3', label: 'Water the drains cannot take', unit: 'm³', better: 'lower', basis: 'Simulated', how: 'Σ max(0, runoff − drainage − storage) per district' },
  { id: 'districts', label: 'Districts over capacity', unit: 'districts', better: 'lower', basis: 'Simulated', how: 'districts with any excess runoff' },
  { id: 'worstM3', label: 'Worst district excess', unit: 'm³', better: 'lower', basis: 'Simulated', how: 'largest district excess' },
];

export function runFlood(v: InputValues): ScenarioResult {
  const rain = num(v, 'rainMmH', 5, 120);
  const hours = num(v, 'hours', 0.5, 12);
  const drain = num(v, 'drainMmH', 5, 80);
  const permeable = num(v, 'permeablePct', 0, 60) / 100;
  const storageM3 = num(v, 'storageM3', 0, 100000);
  const greenRoof = num(v, 'greenRoofPct', 0, 50) / 100;
  const S = districtSurfaces();
  const run = (perm: number, store: number, green: number) => {
    const per = S.map((s) => {
      const pavedImp = s.paved * (1 - perm);
      const roofImp = s.roofs * (1 - green);
      const cArea = (pavedImp + roofImp) * C_IMPERVIOUS + (s.paved * perm + s.roofs * green) * 0.5 + (s.area - s.impervious) * C_PERVIOUS;
      const runoff = (cArea * rain * hours) / 1000;
      const capacity = (s.impervious * drain * hours) / 1000;
      return { s, runoff, capacity };
    });
    const totalImp = S.reduce((a, s) => a + s.impervious, 0);
    const excess = per.map((p) => Math.max(0, p.runoff - p.capacity - store * (p.s.impervious / totalImp)));
    return { per, excess, kpis: { excessM3: excess.reduce((a, x) => a + x, 0), districts: excess.filter((x) => x > 1).length, worstM3: Math.max(0, ...excess) } };
  };
  const b = run(0, 0, 0);
  const baseline: OptionResult = { id: 'baseline', name: 'Existing drainage', summary: `${rain} mm/h for ${hours} h against ${drain} mm/h drainage.`, kpis: b.kpis, actions: [], feasible: true };
  const options: OptionResult[] = [
    { id: 'permeable', name: `Permeable paving on ${round(permeable * 100, 0)} % of roads and lots`, summary: 'Paving that lets water soak in (runoff coefficient 0.5 instead of 0.9).', kpis: run(permeable, 0, 0).kpis, actions: ['roads', 'parking lots'], feasible: permeable > 0, infeasibleWhy: permeable > 0 ? undefined : 'Permeable share is 0 %.' },
    { id: 'storage', name: `Retention ponds (${round(storageM3, 0)} m³)`, summary: 'Ponds and tanks that hold the peak, shared by impervious area.', kpis: run(0, storageM3, 0).kpis, actions: ['retention ponds'], feasible: storageM3 > 0, infeasibleWhy: storageM3 > 0 ? undefined : 'No storage volume set.' },
    { id: 'green', name: `Green roofs on ${round(greenRoof * 100, 0)} % of roof area`, summary: 'Planted roofs retain part of the rain (coefficient 0.5).', kpis: run(0, 0, greenRoof).kpis, actions: ['roofs'], feasible: greenRoof > 0, infeasibleWhy: greenRoof > 0 ? undefined : 'Green roof share is 0 %.' },
    { id: 'combined', name: 'All three combined', summary: 'Permeable paving, retention and green roofs together.', kpis: run(permeable, storageM3, greenRoof).kpis, actions: ['roads', 'parking lots', 'retention ponds', 'roofs'], feasible: permeable > 0 || storageM3 > 0 || greenRoof > 0 },
  ];
  const rec = recommend(baseline, options, FLOOD_KPIS, { excessM3: 0.6, districts: 0.25, worstM3: 0.15 }, (o) => `Removes the most excess runoff: ${round(baseline.kpis.excessM3 ?? 0, 0)} → ${round(o.kpis.excessM3 ?? 0, 0)} m³.`);
  const worst = b.per[b.excess.indexOf(Math.max(...b.excess))];
  return {
    scenarioId: 'flood',
    inputsKey: inputsKey(v),
    baseline,
    options,
    kpis: FLOOD_KPIS,
    recommendation: rec,
    findings: [
      'HYPOTHETICAL storm, not a forecast; the twin has no terrain model, so low points and flood depths are not known.',
      ...b.per.map((p, i) => `${p.s.d.name}: ${round((p.s.impervious / p.s.area) * 100, 0)} % impervious, runoff ${round(p.runoff, 0)} m³, drains ${round(p.capacity, 0)} m³, excess ${round(b.excess[i], 0)} m³.`),
    ],
    affectedAssets: b.per.filter((_, i) => b.excess[i] > 1).map((p) => p.s.d.name),
    tradeoffs: ['Permeable paving needs maintenance against sand clogging; ponds take land; green roofs need irrigation in the dry season.'],
    assumptions: [`Runoff coefficients: impervious ${C_IMPERVIOUS}, permeable/green ${0.5}, open sand ${C_PERVIOUS}.`, 'Impervious area = roofs + roads + parking lots in the layout; drains serve impervious area at the input rate.', 'Storage is shared across districts by impervious area.'],
    limitations: ['No terrain, no pipe network hydraulics, no ponding locations — district totals only.'],
    unavailable: [{ metric: 'Flood depth and extent maps', needs: 'a terrain model and a drainage network model' }, { metric: 'Validated storm return periods', needs: 'local rainfall statistics' }],
    confidence: { level: 'low', why: 'Hypothetical storm on district-level surfaces with assumed coefficients.' },
    highlight: {
      points: b.per.map((p, i) => ({ x: (p.s.d.box[0] + p.s.d.box[1]) / 2, z: (p.s.d.box[2] + p.s.d.box[3]) / 2, role: (b.excess[i] > 1 ? 'problem' : 'alt') as 'problem' | 'alt', label: `${p.s.d.name} · excess ${round(b.excess[i], 0)} m³` })),
      paths: b.per.filter((_, i) => b.excess[i] > 1).map((p) => {
        const [x0, x1, z0, z1] = p.s.d.box;
        return { pts: [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]] as XZ[], role: 'problem' as const, label: p.s.d.name };
      }),
      focus: worst ? { x: (worst.s.d.box[0] + worst.s.d.box[1]) / 2, z: (worst.s.d.box[2] + worst.s.d.box[3]) / 2, r: 110 } : { x: 0, z: -80, r: 150 },
    },
  };
}

export const FLOOD: ScenarioDef = {
  id: 'flood',
  title: 'Hypothetical storm and drainage',
  titleAr: 'عاصفة افتراضية وتصريف المياه',
  icon: 'cloud-rain',
  problem: 'A rare cloudburst hits Al Sajaa (hypothetical). Which districts overwhelm their drains, and what helps most?',
  why: 'Paved industrial land sheds almost all its rain; short intense storms flood roads and yards and can reach electrical equipment.',
  infrastructure: ['Roofs, roads and parking lots', 'Storm drains', 'Retention ponds (proposed)'],
  inputs: [
    { kind: 'range', id: 'rainMmH', label: 'Rain intensity (hypothetical)', min: 10, max: 100, step: 5, unit: 'mm/h' },
    { kind: 'range', id: 'hours', label: 'Duration', min: 0.5, max: 6, step: 0.5, unit: 'h' },
    { kind: 'range', id: 'drainMmH', label: 'Drainage capacity', min: 5, max: 60, step: 5, unit: 'mm/h' },
    { kind: 'range', id: 'permeablePct', label: 'Permeable paving', min: 0, max: 60, step: 5, unit: '%' },
    { kind: 'range', id: 'storageM3', label: 'Retention storage', min: 0, max: 100000, step: 5000, unit: 'm³' },
    { kind: 'range', id: 'greenRoofPct', label: 'Green roofs', min: 0, max: 50, step: 5, unit: '%' },
  ],
  defaults: { rainMmH: 45, hours: 2, drainMmH: 20, permeablePct: 30, storageM3: 40000, greenRoofPct: 20 },
  run: runFlood,
};

/* ================= City-wide sustainability strategy ================= */

export const SUS_KPIS: KpiDef[] = [
  { id: 'netT', label: 'Net modelled CO₂', unit: 't/yr', better: 'lower', basis: 'Estimated', how: 'industry + buildings + road traffic − solar − tree uptake (Command Centre model)' },
  { id: 'pm', label: 'Industrial dust index', unit: 'index', better: 'lower', basis: 'Estimated', how: 'Σ facility PM index after abatement' },
  { id: 'gridMWh', label: 'Grid electricity', unit: 'MWh/yr', better: 'lower', basis: 'Estimated', how: 'demand − on-site solar' },
  { id: 'waterM3', label: 'Water use', unit: 'm³/day', better: 'lower', basis: 'Estimated', how: 'homes + industry + irrigation − reuse' },
];

export function runSustainability(v: InputValues): ScenarioResult {
  const gridKg = num(v, 'gridKg', 0.1, 1);
  const wCo2 = num(v, 'weightCo2', 0, 100) / 100;
  const L = { ...BASE_LEVERS, gridKg };
  const k = (lv: typeof L) => {
    const s = snapshot(lv);
    return { netT: s.carbon.netT, pm: s.facilities.reduce((a, f) => a + f.pmIdx, 0), gridMWh: s.energy.gridMWh, waterM3: s.water.totalM3Day };
  };
  const baseline: OptionResult = { id: 'baseline', name: 'Current district', summary: 'Today\'s modelled city.', kpis: k(L), actions: [], feasible: true };
  const options: OptionResult[] = [
    { id: 'solar', name: 'Rooftop solar on 70 % of warehouse roofs', summary: 'PV on the eligible warehouse roofs.', kpis: k({ ...L, rooftopSolar: 0.7 }), actions: ['warehouse roofs'], feasible: true },
    { id: 'abate', name: 'Abatement at every unabated factory', summary: 'Dust filters and low-NOx burners.', kpis: k({ ...L, abatement: 1 }), actions: ['unabated factories'], feasible: true },
    { id: 'electrify', name: 'Electrify 40 % of factory fuel + 30 % e-trucks', summary: 'Heat pumps/electric processes and electric heavy trucks.', kpis: k({ ...L, electrifyFuel: 0.4, eTrucks: 0.3 }), actions: ['factories', 'truck fleet'], feasible: true },
    { id: 'green', name: '10,000 trees + 50 % water reuse', summary: 'Shade trees in the industrial districts, irrigated with treated water.', kpis: k({ ...L, newTrees: 10000, reuse: 0.5 }), actions: ['industrial streets'], feasible: true },
    { id: 'all', name: 'Combined programme', summary: 'All four together.', kpis: k({ ...L, rooftopSolar: 0.7, abatement: 1, electrifyFuel: 0.4, eTrucks: 0.3, newTrees: 10000, reuse: 0.5 }), actions: ['all'], feasible: true },
  ];
  const rec = recommend(baseline, options.filter((o) => o.id !== 'all').concat(options.filter((o) => o.id === 'all')), SUS_KPIS, { netT: wCo2, pm: (1 - wCo2) * 0.7, waterM3: (1 - wCo2) * 0.3 }, (o) => `Highest weighted score (CO₂ ${round(wCo2 * 100, 0)} %, dust and water ${round((1 - wCo2) * 100, 0)} %): ${o.name}.`);
  const singles = options.filter((o) => o.id !== 'all');
  const bestSingle = [...singles].sort((a, b) => (a.kpis.netT ?? 0) - (b.kpis.netT ?? 0))[0];
  return {
    scenarioId: 'sustainability',
    inputsKey: inputsKey(v),
    baseline,
    options,
    kpis: SUS_KPIS,
    recommendation: rec,
    findings: [
      `Net modelled CO₂ today: ${round((baseline.kpis.netT ?? 0) / 1000, 1)} kt/yr at a grid factor of ${gridKg} kg/kWh.`,
      `Largest single CO₂ lever: ${bestSingle.name} (${round(((bestSingle.kpis.netT ?? 0) - (baseline.kpis.netT ?? 0)) / 1000, 1)} kt/yr).`,
      'Trees matter for heat and shade far more than for carbon: 10,000 trees fix about 0.2 kt/yr.',
    ],
    affectedAssets: ['industrial facilities', 'warehouse roofs', 'truck fleet', 'street trees'],
    tradeoffs: ['Electrification raises grid demand: it only cuts CO₂ while the grid factor stays below the fuel factor ÷ 1.5.', 'Trees add irrigation demand unless reuse is in place.'],
    assumptions: ['The Command Centre model and its documented assumptions (Method tab).'],
    limitations: ['Static annual model; no costs, phasing or grid decarbonisation path.'],
    unavailable: [{ metric: 'Programme cost and abatement cost per tonne (AED/t)', needs: 'capital and operating cost data' }],
    confidence: { level: 'low', why: 'All intensities and factors are planning assumptions.' },
    highlight: (() => {
      // the ten highest modelled emitters, where each programme would act first
      const top = [...snapshot(L).facilities].sort((a, b) => b.co2T - a.co2T).slice(0, 10);
      return {
        points: top.map((f, i) => ({ x: f.x, z: f.z, role: (i < 3 ? 'problem' : 'affected') as 'problem' | 'affected', label: `#${f.id} ${f.category.label} · ${round(f.co2T, 0)} t` })),
        paths: top.flatMap((f) => f.boxes.map(([x0, z0, x1, z1]) => ({ pts: [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]] as XZ[], role: 'problem' as const, label: `#${f.id}` }))),
        focus: { x: top[0].x, z: top[0].z, r: 90 },
      };
    })(),
  };
}

export const SUSTAINABILITY: ScenarioDef = {
  id: 'sustainability',
  title: 'City-wide sustainability strategy',
  titleAr: 'استراتيجية الاستدامة للمدينة',
  icon: 'leaf',
  problem: 'Which programme cuts the district\'s modelled CO₂ and dust the most: solar, abatement, electrification or greening?',
  why: 'Budgets go to one programme at a time; a like-for-like comparison on the same model shows where each tonne comes from.',
  infrastructure: ['Industrial facilities', 'Warehouse roofs', 'Truck fleet', 'Street trees and water reuse'],
  inputs: [
    { kind: 'range', id: 'gridKg', label: 'Grid emission factor', min: 0.2, max: 0.7, step: 0.01, unit: 'kg/kWh' },
    { kind: 'range', id: 'weightCo2', label: 'Priority: CO₂ vs dust and water', min: 0, max: 100, step: 10, unit: '% CO₂' },
  ],
  defaults: { gridKg: 0.45, weightCo2: 70 },
  run: runSustainability,
};
