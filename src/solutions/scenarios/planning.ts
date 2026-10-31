import { CATEGORIES } from '../../sustainability/facilities';
import { DISTRICTS } from '../../sustainability/districts';
import { DEV_DEFAULTS, findSites, runDevelopment, SIZES, type SizeId } from '../../sustainability/development';
import { change, inputsKey, num, pick, recommend, round } from '../engine';
import type { InputValues, KpiDef, OptionResult, ScenarioDef, ScenarioResult } from '../types';

/**
 * Urban planning: the impact of a proposed set of new facilities (the Command Centre's development model), as
 * proposed, with a mitigation package, and relocated to the district with the most vacant road-accessible land.
 */

const DEV_CATS = CATEGORIES.filter((c) => c.group !== 'storage').map((c) => c.id);
const BUILDABLE = DISTRICTS.filter((d) => d.id !== 'lagoons').map((d) => d.id);

export const KPIS: KpiDef[] = [
  { id: 'addCo2', label: 'Added net CO₂', unit: 't/yr', better: 'lower', basis: 'Estimated', how: 'development state minus the existing city (facility energy, process, trucks, commuting, tree uptake)' },
  { id: 'addMWh', label: 'Added electricity demand', unit: 'MWh/yr', better: 'lower', basis: 'Estimated', how: 'Σ facility electricity (after electrification) before rooftop PV' },
  { id: 'addWater', label: 'Added water demand', unit: 'm³/day', better: 'lower', basis: 'Estimated', how: 'process water (after reuse) + irrigation of new trees' },
  { id: 'shortfall', label: 'Facilities without a site', unit: 'facilities', better: 'lower', basis: 'Layout', how: 'requested − sites found on vacant, road-accessible land' },
  { id: 'conflicts', label: 'Land-use warnings', unit: 'warnings', better: 'lower', basis: 'Layout', how: 'residential-district and siting warnings from the model' },
];

export function runPlanning(v: InputValues): ScenarioResult {
  const category = pick(v, 'category', DEV_CATS);
  const district = pick(v, 'district', BUILDABLE);
  const size = pick(v, 'size', Object.keys(SIZES) as SizeId[]);
  const count = Math.round(num(v, 'count', 1, 40));
  const inputs = { ...DEV_DEFAULTS, category, district, size, count };
  const kpisOf = (d: ReturnType<typeof runDevelopment>, mitigated: boolean) => {
    const s = d.states[mitigated ? 2 : 1];
    const b = d.states[0];
    const residentialWarn = d.warnings.filter((w) => /residential|fully plotted/.test(w)).length;
    return { addCo2: s.co2T - b.co2T, addMWh: s.elecMWh - b.elecMWh, addWater: s.waterM3Day - b.waterM3Day, shortfall: count - d.sites.length, conflicts: residentialWarn };
  };
  const asProposed = runDevelopment(inputs);
  // the buildable district with the most room for this footprint
  const capacity = BUILDABLE.map((id) => ({ id, n: findSites(id, size, count).length }));
  const roomiest = [...capacity].sort((a, b) => b.n - a.n || BUILDABLE.indexOf(a.id) - BUILDABLE.indexOf(b.id))[0];
  const relocated = runDevelopment({ ...inputs, district: roomiest.id });
  const name = (id: string) => DISTRICTS.find((d) => d.id === id)!.name;
  const baseline: OptionResult = { id: 'baseline', name: 'As proposed', summary: `${count} × ${CATEGORIES.find((c) => c.id === category)!.label.toLowerCase()} (${SIZES[size].label}) in ${name(district)}, no conditions.`, kpis: kpisOf(asProposed, false), actions: asProposed.sites.map((s) => `${s.x},${s.z}`), feasible: true };
  const options: OptionResult[] = [
    { id: 'mitigated', name: 'As proposed + mitigation conditions', summary: 'Rooftop PV, partial electrification, electric trucks, water reuse and trees as planning conditions.', kpis: kpisOf(asProposed, true), actions: ['planning conditions'], feasible: asProposed.sites.length > 0, infeasibleWhy: asProposed.sites.length ? undefined : 'No site found in the proposed district.' },
    { id: 'relocate', name: `Relocate to ${name(roomiest.id)} + mitigation`, summary: `${name(roomiest.id)} has room for ${roomiest.n} of ${count} at this size.`, kpis: kpisOf(relocated, true), actions: relocated.sites.map((s) => `${s.x},${s.z}`), feasible: relocated.sites.length > 0 && roomiest.id !== district, infeasibleWhy: roomiest.id === district ? 'The proposed district already has the most room.' : relocated.sites.length ? undefined : 'No vacant land anywhere at this size.' },
  ];
  const rec = recommend(baseline, options, KPIS, { addCo2: 0.35, shortfall: 0.25, conflicts: 0.25, addWater: 0.15 }, (o) => `Best balance of added CO₂ (35 %), siting shortfall (25 %), land-use conflicts (25 %) and water (15 %): ${o.name}.`);
  const chosenDev = rec.optionId === 'relocate' ? relocated : asProposed;
  const c = change(baseline.kpis.addCo2, options.find((o) => o.id === rec.optionId)?.kpis.addCo2 ?? null);
  return {
    scenarioId: 'planning',
    inputsKey: inputsKey(v),
    baseline,
    options,
    kpis: KPIS,
    recommendation: rec,
    findings: [
      `Vacant, road-accessible sites for ${SIZES[size].label}: ${capacity.map((q) => `${name(q.id)} ${q.n}`).join(', ')} (searching up to ${count}).`,
      ...asProposed.warnings,
      `Per facility: ${round(asProposed.perFacility.elecMWh, 0)} MWh/yr electricity, ${round(asProposed.perFacility.waterM3Day, 1)} m³/day water, ${round(asProposed.perFacility.trucksDay, 1)} trucks/day, ${asProposed.perFacility.parking} parking spaces.`,
      c.pct === null ? '' : `The recommended option changes the added CO₂ by ${round(c.pct, 0)} %.`,
    ].filter(Boolean),
    affectedAssets: [name(district), name(roomiest.id)],
    tradeoffs: ['Mitigation conditions raise build cost (not estimated) and electricity demand (electrification), but cut CO₂ and water.', 'Relocating to the roomiest district can lengthen commutes and truck trips (distances are averages here).'],
    assumptions: asProposed.assumptions,
    limitations: ['No zoning, land ownership, utility capacity or traffic assignment data.', 'District averages for travel distances.'],
    unavailable: [
      { metric: 'Substation and water network capacity headroom', needs: 'utility capacity data' },
      { metric: 'Development cost and economic benefit (AED)', needs: 'investment and employment data' },
    ],
    confidence: { level: 'low', why: 'Siting is computed against the layout; demand and emission intensities are category assumptions.' },
    highlight: {
      points: chosenDev.sites.slice(0, 1).map((s) => ({ x: s.x, z: s.z, role: 'action' as const, label: `Proposed · ${chosenDev.sites.length} sites` })),
      paths: chosenDev.sites.map((s) => ({ pts: [[s.x - s.w / 2, s.z - s.d / 2], [s.x + s.w / 2, s.z - s.d / 2], [s.x + s.w / 2, s.z + s.d / 2], [s.x - s.w / 2, s.z + s.d / 2], [s.x - s.w / 2, s.z - s.d / 2]] as [number, number][], role: 'action' as const, label: 'proposed site' })),
      focus: chosenDev.sites.length ? { x: chosenDev.sites[0].x, z: chosenDev.sites[0].z, r: 50 } : { x: 0, z: -100, r: 120 },
    },
  };
}

export const PLANNING: ScenarioDef = {
  id: 'planning',
  title: 'Urban planning: new facilities',
  titleAr: 'التخطيط العمراني: منشآت جديدة',
  icon: 'building',
  problem: 'Developers propose new facilities in Al Sajaa. Where do they fit, what do they add, and under what conditions should they be approved?',
  why: 'Each new plant adds load to roads, the grid and the water network for decades; siting and conditions are cheapest to get right before it is built.',
  infrastructure: ['Vacant land in the layout', 'Road access', 'Grid and water demand', 'Parking'],
  inputs: [
    { kind: 'select', id: 'category', label: 'Facility type', options: CATEGORIES.filter((c) => c.group !== 'storage').map((c) => ({ value: c.id, label: c.label })) },
    { kind: 'select', id: 'district', label: 'Proposed district', options: DISTRICTS.filter((d) => d.id !== 'lagoons').map((d) => ({ value: d.id, label: d.name })) },
    { kind: 'select', id: 'size', label: 'Building size', options: (Object.keys(SIZES) as SizeId[]).map((s) => ({ value: s, label: `${s} (${SIZES[s].label})` })) },
    { kind: 'range', id: 'count', label: 'Number of facilities', min: 1, max: 30, step: 1, unit: '' },
  ],
  defaults: { category: 'metal', district: 'north-mixed', size: 'medium', count: 15 },
  run: runPlanning,
};
