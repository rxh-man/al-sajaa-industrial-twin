import { AD } from '../../data/abudhabi';
import { NETWORKS } from '../../data/networks';
import { FACILITIES } from '../../sustainability/facilities';
import { OTHER_BUILDINGS } from '../../sustainability/model';
import { nearestNode, roadGraph, route, routeEdges, segDist, timeCost, type RoadEdge } from '../graphs';
import { change, inputsKey, num, pick, recommend, round } from '../engine';
import type { InputValues, KpiDef, OptionResult, ScenarioDef, ScenarioResult, XZ } from '../types';

/**
 * Emergency coordination for a simulated incident: response routes from assumed response bases on the road
 * graph, a road closure the dispatcher may or may not know about, and the cascading-risk picture around the
 * incident (residents, utility lines, critical sites within the hazard radius). The bases are ASSUMED locations
 * for the demo; this is not connected to, and does not represent, any official emergency service.
 */

const BASES: { id: string; label: string; p: XZ }[] = [
  { id: 'west', label: 'Response base W (assumed, Rahmaniya)', p: [-100, -10] },
  { id: 'north', label: 'Response base N (assumed, Far Northern zone)', p: [-40, -170] },
  { id: 'east', label: 'Response base E (assumed, Tasheel)', p: [84, 0] },
];

function incidents() {
  const chem = FACILITIES.find((f) => f.category.id === 'chemical')!;
  const camp = AD.buildings.find((b) => b.n === 'Labor accommodation')!;
  const cold = [...FACILITIES].filter((f) => f.category.id === 'cold').sort((a, b) => b.floorM2 - a.floorM2)[0];
  return [
    { id: 'camp-fire', label: 'Fire at a labour accommodation block', p: camp.c as XZ, hazardM: 150 },
    { id: 'chem-spill', label: `Chemical release at facility #${chem.id}`, p: [chem.x, chem.z] as XZ, hazardM: 400 },
    { id: 'cold-fire', label: `Fire at cold store #${cold.id}`, p: [cold.x, cold.z] as XZ, hazardM: 200 },
    { id: 'e611-crash', label: 'Multi-vehicle crash on the E611', p: [-66.9, -20] as XZ, hazardM: 100 },
  ];
}
export const INCIDENT_IDS = () => incidents().map((i) => i.id);
const CLOSABLE = ['none', 'Al Sajaa Road 1', 'Al Sajaa Road 4', 'Al Sajaa Road 10', 'Al Sajaa Western Road', 'Emirates Road E611 southbound'];

export const KPIS: KpiDef[] = [
  { id: 'responseMin', label: 'Response time', unit: 'min', better: 'lower', basis: 'Simulated', how: 'road-graph route at class speeds × emergency speed factor, plus turnout time; blocked-route detours included' },
  { id: 'km', label: 'Route length', unit: 'km', better: 'lower', basis: 'Simulated', how: 'shortest-time route on the road graph' },
  { id: 'within8', label: 'Arrives within 8 minutes', unit: 'yes = 1', better: 'higher', basis: 'Simulated', how: '1 if the response time is 8 minutes or less (illustrative benchmark, not an official standard)' },
];

export function runEmergency(v: InputValues): ScenarioResult {
  const list = incidents();
  const incId = pick(v, 'incident', list.map((i) => i.id));
  const closed = pick(v, 'closure', CLOSABLE);
  const speed = num(v, 'speedFactor', 1, 1.6);
  const turnout = num(v, 'turnoutMin', 0, 5);
  const hazardScale = num(v, 'hazardScale', 50, 200) / 100;
  const inc = list.find((i) => i.id === incId)!;
  const g = roadGraph();
  const to = nearestNode(g, inc.p);
  const known = (e: RoadEdge) => (e.road === closed ? Infinity : timeCost(e) / speed);
  const blind = (e: RoadEdge) => timeCost(e) / speed;
  const routes = BASES.map((b) => {
    const from = nearestNode(g, b.p);
    const r = route(g, from, to, known);
    const naive = route(g, from, to, blind);
    // a crew unaware of the closure drives the usual route, meets the closure and re-routes from there
    let blindMin = naive ? naive.minutes / speed : Infinity;
    if (naive && closed !== 'none') {
      const edges = routeEdges(g, naive);
      const hit = edges.findIndex((e) => e.road === closed);
      if (hit >= 0) {
        const reached = edges.slice(0, hit).reduce((a, e) => a + timeCost(e), 0) / speed;
        const detour = route(g, naive.nodes[hit], to, known);
        blindMin = detour ? reached + 2 + detour.minutes / speed : Infinity;
      }
    }
    return { base: b, r, naive, blindMin: blindMin + turnout, knownMin: r ? r.minutes / speed + turnout : Infinity };
  });
  const def = routes[0];
  const best = [...routes].sort((a, b) => a.knownMin - b.knownMin)[0];
  const k = (min: number, km: number) => ({ responseMin: min, km, within8: min <= 8 ? 1 : 0 });
  const baseline: OptionResult = {
    id: 'baseline',
    name: 'Default base, usual route',
    summary: `${def.base.label} dispatched on its usual route${closed !== 'none' ? ` without knowing ${closed} is closed` : ''}.`,
    kpis: k(def.blindMin, def.naive?.km ?? 0),
    actions: [def.base.label],
    feasible: Number.isFinite(def.blindMin),
  };
  const aware: OptionResult = {
    id: 'aware',
    name: 'Default base, closure-aware route',
    summary: 'The twin routes around the closure from the start.',
    kpis: k(def.knownMin, def.r?.km ?? 0),
    actions: [def.base.label, ...(def.r?.roads.slice(0, 4) ?? [])],
    feasible: Number.isFinite(def.knownMin),
    infeasibleWhy: Number.isFinite(def.knownMin) ? undefined : 'No route avoids the closure.',
  };
  const nearest: OptionResult = {
    id: 'nearest',
    name: 'Nearest base by travel time',
    summary: `${best.base.label}: fastest of ${routes.length} assumed bases with the closure known.`,
    kpis: k(best.knownMin, best.r?.km ?? 0),
    actions: [best.base.label, ...(best.r?.roads.slice(0, 4) ?? [])],
    feasible: Number.isFinite(best.knownMin),
  };
  const options = [aware, nearest];
  const rec = recommend(baseline, options, KPIS, { responseMin: 0.8, km: 0.2 }, (o) => `Fastest response with the closure known: ${round(o.kpis.responseMin ?? 0, 1)} min vs ${round(baseline.kpis.responseMin ?? 0, 1)} min for the usual dispatch.`);

  // cascading risk inside the hazard radius
  const R = (inc.hazardM * hazardScale) / 10;
  const residents = OTHER_BUILDINGS.filter((b) => Math.hypot(b.x - inc.p[0], b.z - inc.p[1]) <= R).reduce((a, b) => a + b.residents, 0);
  const lines = NETWORKS.flatMap((n) => n.segments.filter((s) => segDist(inc.p, s.a as XZ, s.b as XZ) <= R).map((s) => ({ layer: n.layer.label, s })));
  const byLayer = new Map<string, number>();
  for (const l of lines) byLayer.set(l.layer, (byLayer.get(l.layer) ?? 0) + 1);
  const critical = AD.buildings.filter((b) => ['hospital', 'school', 'mosque', 'mall'].includes(b.k) && Math.hypot(b.c[0] - inc.p[0], b.c[1] - inc.p[1]) <= R);
  const ch = change(baseline.kpis.responseMin, options.find((o) => o.id === rec.optionId)?.kpis.responseMin ?? null);
  return {
    scenarioId: 'emergency',
    inputsKey: inputsKey(v),
    baseline,
    options,
    kpis: KPIS,
    recommendation: rec,
    findings: [
      `${inc.label} (simulated). Hazard radius ${round(R * 10, 0)} m.`,
      `Inside it: about ${round(residents, 0)} residents (estimated), ${critical.length} critical site(s), and utility lines — ${[...byLayer].map(([l, c]) => `${l} ${c}`).join(', ') || 'none'} segment(s) at risk of cascading failure.`,
      ...routes.map((r) => `${r.base.label}: ${Number.isFinite(r.knownMin) ? `${round(r.knownMin, 1)} min, ${round(r.r!.km, 2)} km` : 'no route'}.`),
      ch.pct === null ? '' : `The recommended dispatch changes response time by ${round(ch.pct, 0)} %.`,
    ].filter(Boolean),
    affectedAssets: [...critical.slice(0, 4).map((b) => b.n), ...[...byLayer.keys()]],
    tradeoffs: [
      'Sending the nearest base leaves its own area uncovered until another unit is repositioned.',
      `Utility lines in the hazard zone (${lines.length}) may need isolating, which can cut supply beyond the incident.`,
    ],
    assumptions: [
      'Response bases are assumed locations for the demo, not real stations.',
      `Emergency vehicles travel at ${round(speed * 100, 0)} % of class speeds; turnout ${turnout} min.`,
      'A crew unaware of a closure loses 2 min turning at it before re-routing.',
      'Residents estimated from residential floor area (30 m² per person).',
    ],
    limitations: ['No live traffic, signal pre-emption or vehicle availability.', 'Hazard radius is a fixed planning distance per incident type, not a dispersion or fire model.'],
    unavailable: [
      { metric: 'Official response standards and real station locations', needs: 'data from the emergency services (no integration exists)' },
      { metric: 'Casualty or damage estimates', needs: 'incident-specific hazard modelling' },
    ],
    confidence: { level: 'low', why: 'Routing is computed on the road model; bases, speeds and hazard radii are assumptions.' },
    highlight: {
      points: [{ x: inc.p[0], z: inc.p[1], role: 'problem', label: inc.label }, ...BASES.map((b) => ({ x: b.p[0], z: b.p[1], role: 'facility' as const, label: b.label })), ...critical.slice(0, 5).map((b) => ({ x: b.c[0], z: b.c[1], role: 'affected' as const, label: b.n }))],
      paths: [
        ...(best.r ? [{ pts: best.r.points, role: 'route' as const, label: 'Recommended route' }] : []),
        ...(def.naive && def !== best ? [{ pts: def.naive.points, role: 'alt' as const, label: 'Usual route' }] : []),
        ...lines.slice(0, 120).map((l) => ({ pts: [l.s.a as XZ, l.s.b as XZ], role: 'affected' as const, label: l.s.id })),
        ...(closed !== 'none' ? AD.roads.filter((r) => r.n === closed).map((r) => ({ pts: r.p as XZ[], role: 'problem' as const, label: `${closed} closed` })) : []),
      ],
      focus: { x: inc.p[0], z: inc.p[1], r: 45 },
    },
  };
}

export const EMERGENCY: ScenarioDef = {
  id: 'emergency',
  title: 'Emergency coordination',
  titleAr: 'تنسيق الطوارئ',
  icon: 'siren',
  problem: 'A simulated incident needs a response. Which assumed base should go, by which route, and what else is at risk nearby?',
  why: 'Minutes matter; a closure the crew does not know about costs more. Utility lines and critical sites near an incident can turn one emergency into several.',
  infrastructure: ['Road network', 'Assumed response bases', 'Utility lines in the hazard zone', 'Critical sites'],
  get inputs() {
    return [
      { kind: 'select' as const, id: 'incident', label: 'Incident', options: incidents().map((i) => ({ value: i.id, label: i.label })) },
      { kind: 'select' as const, id: 'closure', label: 'Road closed at the time', options: CLOSABLE.map((c) => ({ value: c, label: c === 'none' ? 'No closure' : c })) },
      { kind: 'range' as const, id: 'speedFactor', label: 'Emergency speed vs normal', min: 1, max: 1.5, step: 0.05, unit: '×' },
      { kind: 'range' as const, id: 'turnoutMin', label: 'Turnout time', min: 0, max: 4, step: 0.5, unit: 'min' },
      { kind: 'range' as const, id: 'hazardScale', label: 'Hazard radius scale', min: 50, max: 200, step: 10, unit: '%' },
    ];
  },
  defaults: { incident: 'chem-spill', closure: 'Al Sajaa Road 1', speedFactor: 1.3, turnoutMin: 1, hazardScale: 100 },
  run: runEmergency,
};
