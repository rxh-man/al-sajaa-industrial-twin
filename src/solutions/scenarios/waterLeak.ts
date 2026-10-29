import { INCIDENT_SEGMENT, WATER_NETWORK } from '../../data/networks';
import { LEAK_SURFACE, POI, VALVES } from '../../data/incident';
import { buildingsAlong, cutOff, nearestNode, roadGraph, route } from '../graphs';
import { change, delta, inputsKey, num, recommend, round } from '../engine';
import type { InputValues, KpiDef, OptionResult, ScenarioDef, ScenarioResult, XZ } from '../types';

/**
 * Water leak response on the existing simulated water network (networks.ts) and incident (incident.ts).
 * Affected pipes are traced on the network graph: whatever loses its connection to the source when the chosen
 * valves are closed. The crew drives from the utility depot to the leak on the road graph.
 */

const VALVE_OP_H = 0.5; // a crew closes field valves on arrival (assumption)
const REMOTE_OP_H = 0.25; // telemetry-actuated sector valves close from the control room (assumption)
const RECHARGE_H = 0.5; // flushing and refilling after the repair (assumption)
const M2_PER_PERSON = 30; // residential floor area per resident (assumption)
const RESIDENTIAL = new Set(['residential', 'house', 'building', 'hotel', 'tower']);

export const KPIS: KpiDef[] = [
  { id: 'lossM3', label: 'Water lost', unit: 'm³', better: 'lower', basis: 'Simulated', how: 'leak rate × hours the leak runs (reduced by pressure management where applied)' },
  { id: 'isolateH', label: 'Time to stop the leak', unit: 'h', better: 'lower', basis: 'Simulated', how: 'detection + crew travel (road graph) + valve operation' },
  { id: 'restoreH', label: 'Time to full restoration', unit: 'h', better: 'lower', basis: 'Simulated', how: 'detection + crew travel + repair + recharge' },
  { id: 'pipesOut', label: 'Pipe segments out of supply', unit: 'segments', better: 'lower', basis: 'Simulated', how: 'segments cut off from the source by the closed valves (network graph)' },
  { id: 'personHours', label: 'Resident-hours without water', unit: 'person-h', better: 'lower', basis: 'Estimated', how: 'residents along cut-off pipes × hours without supply' },
];

export function runWaterLeak(v: InputValues): ScenarioResult {
  const leakLps = num(v, 'leakLps', 1, 200);
  const reportH = num(v, 'reportH', 0.5, 48);
  const sensorH = num(v, 'sensorH', 0.05, 6);
  const repairH = num(v, 'repairH', 1, 24);
  const pressureCut = num(v, 'pressureCut', 0, 60) / 100;

  // the crew's route from the depot to the leak, on the connected road network
  const g = roadGraph();
  const r = route(g, nearestNode(g, [POI.depot.x, POI.depot.z]), nearestNode(g, [LEAK_SURFACE.x, LEAK_SURFACE.z]));
  if (!r) throw new Error('No road route from the utility depot to the leak.');
  const travelH = r.minutes / 60;

  // isolation sets: the leaking main alone, or the whole sector behind the remote sector valves
  const tight = new Set([INCIDENT_SEGMENT.id]);
  const sector = new Set(WATER_NETWORK.segments.filter((s) => s.sector === INCIDENT_SEGMENT.sector).map((s) => s.id));
  const outTight = cutOff(WATER_NETWORK, tight);
  const outSector = cutOff(WATER_NETWORK, sector);
  const residents = (segs: typeof outTight) =>
    buildingsAlong(segs.map((s) => ({ a: s.a as XZ, b: s.b as XZ })), 2.5)
      .filter((b) => RESIDENTIAL.has(b.kind))
      .reduce((a, b) => a + b.floorM2 / M2_PER_PERSON, 0);
  const resTight = residents(outTight);
  const resSector = residents(outSector);

  const m3 = (lps: number, hours: number) => (lps * hours * 3600) / 1000;
  const restoreBase = reportH + travelH + repairH + RECHARGE_H;
  const restoreSensor = sensorH + travelH + repairH + RECHARGE_H;

  const baseline: OptionResult = {
    id: 'baseline',
    name: 'Reactive response (no twin)',
    summary: `Leak found by a public report after ${round(reportH)} h; the crew isolates the main on arrival.`,
    kpis: {
      lossM3: m3(leakLps, reportH + travelH + VALVE_OP_H),
      isolateH: reportH + travelH + VALVE_OP_H,
      restoreH: restoreBase,
      pipesOut: outTight.length,
      personHours: resTight * (restoreBase - (reportH + travelH + VALVE_OP_H)),
    },
    actions: [INCIDENT_SEGMENT.id],
    feasible: true,
  };
  const isoA = sensorH + travelH + VALVE_OP_H;
  const mainValves = VALVES.filter((q) => q.isolation).map((q) => q.id);
  const field: OptionResult = {
    id: 'field',
    name: 'Sensor alert + field isolation of the main',
    summary: `Pressure sensors flag the leak after ${round(sensorH, 2)} h; the crew closes ${mainValves.join(' and ')} either side of ${INCIDENT_SEGMENT.id}.`,
    kpis: { lossM3: m3(leakLps, isoA), isolateH: isoA, restoreH: restoreSensor, pipesOut: outTight.length, personHours: resTight * (restoreSensor - isoA) },
    actions: [INCIDENT_SEGMENT.id, ...mainValves],
    feasible: true,
  };
  const isoB = sensorH + REMOTE_OP_H;
  const remote: OptionResult = {
    id: 'sector',
    name: 'Sensor alert + remote sector isolation',
    summary: `Telemetry-actuated valves on the boundary of grid sector ${INCIDENT_SEGMENT.sector} close from the control room; the sector goes without water until the repair is done.`,
    kpis: { lossM3: m3(leakLps, isoB), isolateH: isoB, restoreH: restoreSensor, pipesOut: outSector.length, personHours: resSector * (restoreSensor - isoB) },
    actions: [`sector ${INCIDENT_SEGMENT.sector} boundary`],
    feasible: true,
  };
  // leak flow scales with the square root of pressure (orifice equation)
  const reduced = leakLps * Math.sqrt(1 - pressureCut);
  const pressure: OptionResult = {
    id: 'pressure',
    name: 'Sensor alert + pressure reduction, then field isolation',
    summary: `Upstream pressure is cut by ${round(pressureCut * 100, 0)} % on detection (leak flow falls to ${round(reduced)} L/s) until the crew isolates the main.`,
    kpis: { lossM3: m3(leakLps, sensorH) + m3(reduced, isoA - sensorH), isolateH: isoA, restoreH: restoreSensor, pipesOut: outTight.length, personHours: resTight * (restoreSensor - isoA) },
    actions: [INCIDENT_SEGMENT.id, 'upstream pressure-reducing valve'],
    feasible: pressureCut > 0,
    infeasibleWhy: pressureCut > 0 ? undefined : 'Pressure reduction is set to 0 %.',
  };
  const options = [field, remote, pressure];
  const weights = { lossM3: 0.5, personHours: 0.3, restoreH: 0.2 };
  const rec = recommend(baseline, options, KPIS, weights, (best) => {
    const k = (id: string) => KPIS.find((q) => q.id === id)!;
    return `Highest weighted score (water lost 50 %, resident-hours without water 30 %, restoration time 20 %). ${delta(k('lossM3'), baseline.kpis.lossM3, best.kpis.lossM3, 0)}; ${delta(k('personHours'), baseline.kpis.personHours, best.kpis.personHours, 0)}.`;
  });

  const lossCut = change(baseline.kpis.lossM3, options.find((o) => o.id === rec.optionId)?.kpis.lossM3 ?? null);
  return {
    scenarioId: 'water-leak',
    inputsKey: inputsKey(v),
    baseline,
    options,
    kpis: KPIS,
    recommendation: rec,
    findings: [
      `Leak on ${INCIDENT_SEGMENT.id} (${INCIDENT_SEGMENT.meta.material}, DN${INCIDENT_SEGMENT.meta.diameterMm}, installed ${INCIDENT_SEGMENT.meta.installYear}, health ${INCIDENT_SEGMENT.meta.health} %), sector ${INCIDENT_SEGMENT.sector}. Simulated.`,
      `Closing the main alone cuts off ${outTight.length} segment(s); closing the sector cuts off ${outSector.length}.`,
      `Crew route from the depot: ${round(r.km, 2)} km, about ${round(r.minutes, 0)} min at class speeds (${r.roads.slice(0, 3).join(' → ')}${r.roads.length > 3 ? ' …' : ''}).`,
      lossCut.pct === null ? '' : `The recommended response changes water lost by ${round(lossCut.pct, 0)} % against the reactive baseline.`,
    ].filter(Boolean),
    affectedAssets: [...new Set([...outSector.map((s) => s.id)])].slice(0, 12),
    tradeoffs: [
      'Remote sector isolation stops the leak fastest but leaves the whole sector without water until the repair is done; field isolation keeps more customers supplied but lets the leak run while the crew drives.',
      'Pressure reduction cuts the loss before isolation but lowers pressure for every customer upstream (not modelled here).',
    ],
    assumptions: [
      `Leak rate ${leakLps} L/s held constant until isolation (input).`,
      `Field valve operation ${VALVE_OP_H} h after arrival; remote sector valves ${REMOTE_OP_H} h after the alert; recharge ${RECHARGE_H} h after the repair.`,
      'Leak flow is proportional to the square root of pressure (orifice equation).',
      `Residents: residential floor area along cut-off pipes ÷ ${M2_PER_PERSON} m² per person, within 25 m of a pipe.`,
      'Crew travel time from road-class speeds on the modelled road graph; no live traffic.',
    ],
    limitations: [
      'The network, the leak and its location are simulated; there is no hydraulic model, so pressures and flows elsewhere are not computed.',
      'The sector is the twin\'s map grid sector, not a surveyed district metered area; remote-actuated valves are a proposal, not existing assets.',
    ],
    unavailable: [
      { metric: 'Repair and water cost (AED)', needs: 'utility unit rates for crews, materials and produced water' },
      { metric: 'Pressure at customer taps', needs: 'a calibrated hydraulic model of the network' },
    ],
    confidence: { level: 'medium', why: 'Topology and travel are computed from the model; leak rate, valve times and occupancy are assumptions.' },
    highlight: {
      points: [
        { x: LEAK_SURFACE.x, z: LEAK_SURFACE.z, role: 'problem', label: `Leak · ${INCIDENT_SEGMENT.id}` },
        { x: POI.depot.x, z: POI.depot.z, role: 'facility', label: 'Utility depot' },
        ...VALVES.filter((q) => q.isolation).map((q) => ({ x: q.x, z: q.z, role: 'action' as const, label: q.id })),
      ],
      paths: [
        ...outSector.map((s) => ({ pts: [s.a as XZ, s.b as XZ], role: (outTight.some((t) => t.id === s.id) ? 'problem' : 'affected') as 'problem' | 'affected', label: s.id })),
        { pts: r.points, role: 'route', label: 'Crew route' },
      ],
      focus: { x: LEAK_SURFACE.x, z: LEAK_SURFACE.z, r: 18 },
    },
  };
}

export const WATER_LEAK: ScenarioDef = {
  id: 'water-leak',
  title: 'Water leak response',
  titleAr: 'الاستجابة لتسرب المياه',
  icon: 'droplets',
  problem: `A simulated underground main (${INCIDENT_SEGMENT.id}) is leaking under Al Sajaa main road. Which valves should close, and how fast can supply be restored?`,
  why: 'Every hour a main leaks wastes treated water, undermines the road above and risks a burst; closing too much leaves homes without water.',
  infrastructure: [`Water main ${INCIDENT_SEGMENT.id}`, 'Isolation valves V-B12-02 / V-B12-03', 'Utility depot and crew', 'Al Sajaa main road'],
  inputs: [
    { kind: 'range', id: 'leakLps', label: 'Leak rate', min: 5, max: 80, step: 1, unit: 'L/s' },
    { kind: 'range', id: 'reportH', label: 'Detection without sensors (public report)', min: 1, max: 24, step: 0.5, unit: 'h' },
    { kind: 'range', id: 'sensorH', label: 'Detection with the twin\'s sensors', min: 0.1, max: 3, step: 0.1, unit: 'h' },
    { kind: 'range', id: 'repairH', label: 'Repair duration', min: 2, max: 12, step: 0.5, unit: 'h' },
    { kind: 'range', id: 'pressureCut', label: 'Pressure reduction on detection', min: 0, max: 50, step: 5, unit: '%' },
  ],
  defaults: { leakLps: 25, reportH: 6, sensorH: 0.5, repairH: 5, pressureCut: 30 },
  run: runWaterLeak,
};
