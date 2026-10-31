import { NETWORKS, type Network } from '../../data/networks';
import { AD } from '../../data/abudhabi';
import { buildingsAlong, cutOff, feedPoints } from '../graphs';
import { change, delta, inputsKey, num, pick, recommend, round } from '../engine';
import type { InputValues, KpiDef, OptionResult, ScenarioDef, ScenarioResult, XZ } from '../types';

/**
 * Energy resilience: a simulated cable fault on a branch of the twin's electricity network. The outage area is
 * traced on the network graph (everything cut off from the source when the faulted segment is isolated); load is
 * estimated from the floor area of the buildings along the cut-off cables. Interventions are compared on unserved
 * energy, customer-hours lost and critical sites without power.
 */

const W_PER_M2: Record<string, number> = { residential: 25, house: 25, office: 40, mall: 60, hotel: 45, school: 30, mosque: 20, hospital: 70, building: 30 };
const CRITICAL = new Set(['hospital', 'school', 'mall', 'mosque']);
const SWITCH_H = 0.5; // remote tie-switch operation (assumption)
const GEN_DEPLOY_H = 1.5; // mobile generator arrival and connection (assumption)
const DIESEL_KG_PER_KWH = 0.8; // diesel generator, kg CO₂ per kWh electric (assumption: ~33 % efficiency)

const ELECTRIC = () => NETWORKS.find((n) => n.layer.id === 'electric') as Network;
/** each separate piece of the cable network is fed from the substation in the layout nearest to it */
let feedCache: string[] | null = null;
const FEEDS = () => (feedCache ??= feedPoints(ELECTRIC(), AD.buildings.filter((b) => b.n === 'Substation').map((b) => b.c as XZ)));

const REACH = 4; // buildings within 40 m of a cut-off cable are served by it (assumption)
let feederCache: { id: string; out: number; sector: string; critical: number }[] | null = null;
/** feeder branches big enough to matter and small enough to be a branch: sampled every 7th segment (deterministic) */
export function feeders() {
  if (feederCache) return feederCache;
  const net = ELECTRIC();
  const found: { id: string; out: number; sector: string; critical: number }[] = [];
  for (let i = 0; i < net.segments.length; i += 5) {
    const s = net.segments[i];
    const outSegs = cutOff(net, new Set([s.id]), FEEDS());
    const out = outSegs.length;
    if (out < 12 || out > 250 || found.some((f) => f.sector === s.sector)) continue;
    const critical = buildingsAlong(outSegs.map((q) => ({ a: q.a as XZ, b: q.b as XZ })), REACH).filter((b) => CRITICAL.has(b.kind)).length;
    found.push({ id: s.id, out, sector: s.sector, critical });
    if (found.length >= 8) break;
  }
  // the most consequential branches first: critical sites, then size
  feederCache = found.sort((a, b) => b.critical - a.critical || b.out - a.out).slice(0, 5);
  return found;
}

export const KPIS: KpiDef[] = [
  { id: 'unservedMWh', label: 'Energy not supplied', unit: 'MWh', better: 'lower', basis: 'Estimated', how: 'load of the cut-off area × hours without supply' },
  { id: 'custHours', label: 'Building-hours without power', unit: 'bldg-h', better: 'lower', basis: 'Simulated', how: 'buildings along cut-off cables × hours off' },
  { id: 'criticalHours', label: 'Critical-site hours without power', unit: 'site-h', better: 'lower', basis: 'Simulated', how: 'hospitals, schools, malls and mosques in the area × hours off' },
  { id: 'dieselCo2', label: 'Backup generator CO₂', unit: 'kg', better: 'lower', basis: 'Estimated', how: 'generator energy × 0.8 kg/kWh' },
  { id: 'restoreH', label: 'Time until everyone is back', unit: 'h', better: 'lower', basis: 'Simulated', how: 'the longest outage any building sees' },
];

export function runEnergy(v: InputValues): ScenarioResult {
  const list = feeders();
  if (!list.length) throw new Error('No feeder branch found in the electricity network.');
  const feederId = pick(v, 'feeder', list.map((f) => f.id));
  const repairH = num(v, 'repairH', 1, 48);
  const tieMW = num(v, 'tieMW', 0, 20);
  const batteryMWh = num(v, 'batteryMWh', 0, 20);
  const genMW = num(v, 'genMW', 0, 10);
  const loadFactor = num(v, 'loadFactor', 30, 120) / 100;

  const net = ELECTRIC();
  const out = cutOff(net, new Set([feederId]), FEEDS());
  const blds = buildingsAlong(out.map((s) => ({ a: s.a as XZ, b: s.b as XZ })), REACH);
  const loadMW = (blds.reduce((a, b) => a + b.floorM2 * (W_PER_M2[b.kind] ?? 30), 0) / 1e6) * loadFactor;
  const crit = blds.filter((b) => CRITICAL.has(b.kind));
  const critMW = (crit.reduce((a, b) => a + b.floorM2 * (W_PER_M2[b.kind] ?? 30), 0) / 1e6) * loadFactor;
  const n = blds.length;
  const nc = crit.length;

  const baseline: OptionResult = {
    id: 'baseline',
    name: 'Wait for the cable repair',
    summary: `Everything downstream of ${feederId} stays off for the ${round(repairH)} h repair.`,
    kpis: { unservedMWh: loadMW * repairH, custHours: n * repairH, criticalHours: nc * repairH, dieselCo2: 0, restoreH: repairH },
    actions: [],
    feasible: true,
  };
  // back-feed through a normally-open tie to the neighbouring feeder, up to its spare capacity
  const tieShare = loadMW > 0 ? Math.min(1, tieMW / loadMW) : 1;
  const tie: OptionResult = {
    id: 'tie',
    name: 'Back-feed through a tie switch',
    summary: `A normally-open tie to the neighbouring feeder closes after ${SWITCH_H} h; its ${tieMW} MW spare capacity carries ${round(tieShare * 100, 0)} % of the ${round(loadMW, 2)} MW load.`,
    kpis: {
      unservedMWh: loadMW * SWITCH_H + loadMW * (1 - tieShare) * (repairH - SWITCH_H),
      custHours: n * SWITCH_H + n * (1 - tieShare) * (repairH - SWITCH_H),
      criticalHours: nc * SWITCH_H + (tieMW >= critMW + loadMW * (1 - tieShare) ? 0 : nc * (1 - tieShare) * (repairH - SWITCH_H)),
      dieselCo2: 0,
      restoreH: tieShare >= 1 ? SWITCH_H : repairH,
    },
    actions: [feederId, 'tie switch'],
    feasible: tieMW > 0,
    infeasibleWhy: tieMW > 0 ? undefined : 'No spare capacity on the neighbouring feeder (0 MW).',
  };
  // mobile generators to the critical sites first
  const genCritical = genMW >= critMW;
  const genEnergy = Math.min(genMW, critMW) * (repairH - GEN_DEPLOY_H);
  const gen: OptionResult = {
    id: 'generators',
    name: 'Mobile generators for critical sites',
    summary: `${genMW} MW of generators reach the ${nc} critical site(s) (${round(critMW, 2)} MW) after ${GEN_DEPLOY_H} h; others wait for the repair.`,
    kpis: {
      unservedMWh: loadMW * repairH - Math.max(0, genEnergy),
      custHours: n * repairH - (genCritical ? nc * (repairH - GEN_DEPLOY_H) : 0),
      criticalHours: genCritical ? nc * GEN_DEPLOY_H : nc * repairH,
      dieselCo2: Math.max(0, genEnergy) * 1000 * DIESEL_KG_PER_KWH,
      restoreH: repairH,
    },
    actions: crit.slice(0, 6).map((b) => b.name),
    feasible: genMW > 0 && nc > 0 && repairH > GEN_DEPLOY_H,
    infeasibleWhy: nc === 0 ? 'No critical sites in the outage area.' : genMW <= 0 ? 'No generator capacity set.' : repairH <= GEN_DEPLOY_H ? 'The repair is quicker than the generators can arrive.' : undefined,
  };
  // a battery microgrid islands the critical sites at once, for as long as its energy lasts
  const islandH = critMW > 0 ? Math.min(repairH, batteryMWh / critMW) : 0;
  const micro: OptionResult = {
    id: 'microgrid',
    name: 'Battery microgrid islands critical sites',
    summary: `A ${batteryMWh} MWh battery carries the critical sites (${round(critMW, 2)} MW) for ${round(islandH, 1)} h of the ${round(repairH)} h outage.`,
    kpis: {
      unservedMWh: loadMW * repairH - critMW * islandH,
      custHours: n * repairH - nc * islandH,
      criticalHours: nc * (repairH - islandH),
      dieselCo2: 0,
      restoreH: repairH,
    },
    actions: ['district battery', ...crit.slice(0, 6).map((b) => b.name)],
    feasible: batteryMWh > 0 && nc > 0,
    infeasibleWhy: nc === 0 ? 'No critical sites in the outage area.' : batteryMWh <= 0 ? 'No battery capacity set.' : undefined,
  };
  const options = [tie, gen, micro];
  const weights = { criticalHours: 0.4, custHours: 0.3, unservedMWh: 0.2, dieselCo2: 0.1 };
  const rec = recommend(baseline, options, KPIS, weights, (best) => {
    const k = (id: string) => KPIS.find((q) => q.id === id)!;
    return `Highest weighted score (critical-site hours 40 %, building-hours 30 %, energy not supplied 20 %, generator CO₂ 10 %). ${delta(k('criticalHours'), baseline.kpis.criticalHours, best.kpis.criticalHours)}; ${delta(k('custHours'), baseline.kpis.custHours, best.kpis.custHours, 0)}.`;
  });
  const chosen = options.find((o) => o.id === rec.optionId);
  const c = change(baseline.kpis.unservedMWh, chosen?.kpis.unservedMWh ?? null);
  const mid = out[Math.floor(out.length / 2)];
  return {
    scenarioId: 'energy',
    inputsKey: inputsKey(v),
    baseline,
    options,
    kpis: KPIS,
    recommendation: rec,
    findings: [
      `Fault on ${feederId}: ${out.length} cable segment(s) lose supply (network graph). Simulated.`,
      `${n} building(s) along the cut-off cables, about ${round(loadMW, 2)} MW of load (floor area × W/m², estimated).`,
      nc ? `Critical sites affected: ${crit.slice(0, 5).map((b) => b.name).join(', ')}${nc > 5 ? ' …' : ''} (${round(critMW, 2)} MW).` : 'No hospital, school, mall or mosque in the outage area.',
      c.pct === null ? '' : `The recommended option changes energy not supplied by ${round(c.pct, 0)} %.`,
    ].filter(Boolean),
    affectedAssets: [feederId, ...crit.slice(0, 6).map((b) => b.name)],
    tradeoffs: [
      'Back-feeding loads the neighbouring feeder close to its limit; a second fault there would widen the outage.',
      'Generators restore critical sites but emit CO₂ and local NOx; a battery is clean but runs out on long repairs.',
    ],
    assumptions: [
      `Each separate piece of the cable network is fed from its nearest substation in the layout (${FEEDS().length} feed points).`,
      `Load: ${Object.entries(W_PER_M2).map(([k, w]) => `${k} ${w}`).join(', ')} W/m² of floor × ${round(loadFactor * 100, 0)} % load factor (input).`,
      `Tie switch closes ${SWITCH_H} h after the fault; generators connect after ${GEN_DEPLOY_H} h; diesel ${DIESEL_KG_PER_KWH} kg CO₂/kWh.`,
      'Buildings within 40 m of a cut-off cable are counted as supplied by it.',
    ],
    limitations: ['No load-flow model: voltage and thermal limits are not checked beyond the spare-capacity input.', 'The network and the fault are simulated.'],
    unavailable: [
      { metric: 'Customer numbers and outage cost (AED)', needs: 'the utility customer register and value-of-lost-load figures' },
      { metric: 'Protection and voltage compliance', needs: 'a calibrated load-flow model' },
    ],
    confidence: { level: 'low', why: 'Topology is computed from the model; loads, switching times and capacities are assumptions.' },
    highlight: {
      points: [
        { x: (mid.a[0] + mid.b[0]) / 2, z: (mid.a[1] + mid.b[1]) / 2, role: 'problem', label: `Fault · ${feederId}` },
        ...crit.slice(0, 8).map((b) => ({ x: b.x, z: b.z, role: 'facility' as const, label: b.name })),
      ],
      paths: out.map((s) => ({ pts: [s.a as XZ, s.b as XZ], role: (s.id === feederId ? 'problem' : 'affected') as 'problem' | 'affected', label: s.id })),
      focus: { x: (mid.a[0] + mid.b[0]) / 2, z: (mid.a[1] + mid.b[1]) / 2, r: 40 },
    },
  };
}

export const ENERGY: ScenarioDef = {
  id: 'energy',
  title: 'Energy resilience: feeder outage',
  titleAr: 'مرونة الطاقة: انقطاع مغذٍ',
  icon: 'zap',
  problem: 'A simulated cable fault cuts power to part of the district. Back-feed, generators or a battery microgrid — which restores the most, fastest, and protects critical sites?',
  why: 'Outages stop production, spoil cold-chain goods and put hospitals and schools at risk; backup choices trade speed, coverage and emissions.',
  get infrastructure() {
    return ['Electricity feeder branch', 'Tie switch to the neighbouring feeder', 'Mobile generators', 'District battery (proposed)'];
  },
  inputs: [
    { kind: 'select', id: 'feeder', label: 'Faulted feeder segment', get options() { return feeders().map((f) => ({ value: f.id, label: `${f.id} (${f.out} segments downstream, ${f.critical} critical sites)` })); } } as never,
    { kind: 'range', id: 'repairH', label: 'Cable repair time', min: 2, max: 24, step: 1, unit: 'h' },
    { kind: 'range', id: 'tieMW', label: 'Spare capacity on the neighbouring feeder', min: 0, max: 10, step: 0.5, unit: 'MW' },
    { kind: 'range', id: 'genMW', label: 'Mobile generator capacity', min: 0, max: 5, step: 0.25, unit: 'MW' },
    { kind: 'range', id: 'batteryMWh', label: 'Battery energy', min: 0, max: 10, step: 0.5, unit: 'MWh' },
    { kind: 'range', id: 'loadFactor', label: 'Load at the time of the fault', min: 40, max: 110, step: 10, unit: '% of peak' },
  ],
  get defaults() {
    return { feeder: feeders()[0]?.id ?? '', repairH: 8, tieMW: 2, genMW: 1, batteryMWh: 4, loadFactor: 80 };
  },
  run: runEnergy,
};
