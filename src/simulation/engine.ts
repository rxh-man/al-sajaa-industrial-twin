import { T, phaseAt, stageAt, captionAt, ramp, pulse, keys, type Phase, type Caption } from './timeline';
import { telemetryAt, type Telemetry } from './telemetry';
import type { LayerId } from '../data/networks';

/* ------------------------------------------------------------------ */
/* UI snapshot                                                         */
/* ------------------------------------------------------------------ */

export interface SimSnapshot extends Telemetry {
  t: number;
  active: boolean;
  phase: Phase;
  stage: number;
  caption: Caption;
  anomaly: boolean;
  correlating: boolean;
  patternDetected: boolean;
  localized: boolean;
  prediction: boolean;
  impact: boolean;
  recommendation: boolean;
  /** 0 = not started, 1..5 = active step, 6 = complete */
  repairStep: number;
  resolved: boolean;
}

export function repairStepAt(t: number, active: boolean) {
  if (!active || t < T.repair) return 0;
  if (t < T.reroute) return 1;
  if (t < T.dispatch) return 2;
  if (t < T.replace) return 3;
  if (t < T.restore) return 4;
  if (t < T.resolved) return 5;
  return 6;
}

export function computeSnapshot(t: number, wall: number, active: boolean): SimSnapshot {
  const tel = telemetryAt(t, wall, active);
  const on = (x: number) => active && t >= x;
  return {
    ...tel,
    t,
    active,
    phase: phaseAt(t, active),
    stage: stageAt(t, active),
    caption: captionAt(t, active),
    anomaly: on(T.anomaly),
    correlating: on(T.correlate) && t < T.leak,
    patternDetected: on(T.pattern),
    localized: on(T.leak),
    prediction: on(T.predict),
    impact: on(T.impact),
    recommendation: on(T.plan),
    repairStep: repairStepAt(t, active),
    resolved: on(T.resolved),
  };
}

/* ------------------------------------------------------------------ */
/* Scenario events — discrete state changes fired as the clock passes  */
/* ------------------------------------------------------------------ */

export type ShotId =
  | 'intro'
  | 'city'
  | 'sector'
  | 'underground'
  | 'failure'
  | 'impact'
  | 'approach'
  | 'dive'
  | 'valves'
  | 'reroute'
  | 'route'
  | 'follow'
  | 'repairView'
  | 'exploded'
  | 'outro';

export interface ScenarioControlled {
  xray: boolean;
  trench: boolean;
  focus: LayerId | null;
  repairOpen: boolean;
  shot: ShotId | null;
}

export const SCENARIO_DEFAULTS: ScenarioControlled = {
  xray: false,
  trench: false,
  focus: null,
  repairOpen: false,
  shot: null,
};

export const EVENTS: { t: number; set: Partial<ScenarioControlled> }[] = [
  { t: 0, set: { shot: 'city' } },
  { t: T.correlate + 0.4, set: { shot: 'sector' } },
  { t: T.localize, set: { shot: 'approach' } },
  { t: T.open, set: { trench: true } },
  { t: T.xray, set: { xray: true, focus: 'water' } },
  { t: T.dive, set: { shot: 'dive' } },
  { t: T.impact, set: { shot: 'impact', xray: false } },
  { t: T.plan - 0.2, set: { shot: 'repairView' } },
  { t: T.repair, set: { repairOpen: true, shot: 'valves', xray: true } },
  { t: T.reroute, set: { shot: 'reroute' } },
  { t: T.dispatch, set: { shot: 'route', xray: false } },
  { t: T.dispatch + 1.5, set: { shot: 'follow' } },
  { t: T.arrive, set: { shot: 'approach' } },
  { t: T.replace, set: { shot: 'underground' } },
  { t: T.resolved, set: { trench: false, xray: false, focus: null, shot: 'outro' } },
];

/** Accumulate every event with time ≤ t (used when seeking). */
export function controlledAt(t: number): ScenarioControlled {
  const out: ScenarioControlled = { ...SCENARIO_DEFAULTS };
  for (const e of EVENTS) if (e.t <= t) Object.assign(out, e.set);
  return out;
}

/* ------------------------------------------------------------------ */
/* Visual targets for the 3D scene                                     */
/* ------------------------------------------------------------------ */

export interface ViewInputs {
  active: boolean;
  xray: boolean;
  trench: boolean;
  exploded: boolean;
  future: boolean;
  compare: null | 'none' | 'ai';
}

export interface VisualTargets {
  ping: number;
  correlation: number;
  reticle: number;
  sectorAlert: number;
  sectorSeverity: number;
  healed: number;
  trench: number;
  xray: number;
  exploded: number;
  leak: number;
  moisture: number;
  annotation: number;
  impact: number;
  pois: number;
  road: number;
  valves: number;
  isolation: number;
  reroute: number;
  route: number;
  routeVisible: number;
  truck: number;
  repairTone: number;
  future: number;
  burst: number;
  repaired: number;
}

export function computeTargets(t: number, v: ViewInputs): VisualTargets {
  const a = v.active;
  const s = a ? t : -1;
  const future = v.future ? 1 : 0;
  // +48H looks past the projected T+44 h failure, so it shows the burst too
  const burst = v.compare === 'none' || v.future ? 1 : 0;
  const repairedCompare = v.compare === 'ai' ? 1 : 0;

  let leak = a ? keys(s, [[T.anomaly, 0], [T.dive, 0.35], [T.leak, 1], [T.repair + 1.2, 1], [T.repair + 2.2, 0.32], [T.replace, 0.32], [T.replace + 1.4, 0]]) : 0;
  let moisture = a ? keys(s, [[T.anomaly, 0.08], [T.dive, 0.5], [T.leak, 1], [T.replace, 1], [T.resolved + 3, 0.25]]) : 0;
  let impact = a ? pulse(s, T.impact, T.impact + 3.2, T.resolved, T.resolved + 2.6) : 0;
  let road = a ? pulse(s, T.impact + 2.2, T.impact + 3.0, T.resolved, T.resolved + 1.2) : 0;
  let pois = a ? pulse(s, T.impact + 1.2, T.impact + 2.2, T.resolved + 0.5, T.resolved + 2) : 0;

  if (future) {
    leak = Math.max(leak, 2.6);
    moisture = Math.max(moisture, 2.6);
    impact = 1;
    road = 1;
    pois = 1;
  }
  if (burst) {
    leak = 3.2;
    moisture = 3;
    impact = 1;
    road = 1;
    pois = 1;
  }

  return {
    ping: a ? pulse(s, T.anomaly, T.anomaly + 1, T.resolved, T.resolved + 1.5) : 0,
    correlation: a ? pulse(s, T.correlate, T.correlate + 1, T.open, T.open + 1.5) : 0,
    reticle: a ? pulse(s, T.localize, T.localize + 0.8, T.open + 0.6, T.open + 1.8) : 0,
    sectorAlert: burst || repairedCompare ? 1 : a ? pulse(s, T.pattern, T.pattern + 1, T.resolved + 3, T.resolved + 5.5) : 0,
    sectorSeverity: burst ? 1 : a ? keys(s, [[T.pattern, 0], [T.leak - 1, 0], [T.leak, 1], [T.replace, 1], [T.replace + 1, 0.4]]) : 0,
    healed: repairedCompare ? 1 : a && !burst ? ramp(s, T.resolved, T.resolved + 1.2) : 0,
    trench: v.trench ? 1 : 0,
    xray: v.xray ? 1 : 0,
    exploded: v.exploded ? 1 : 0,
    leak,
    moisture,
    annotation: a && !burst && !repairedCompare ? Math.max(pulse(s, T.leak, T.leak + 0.6, T.impact - 0.6, T.impact + 0.2), future) : future,
    impact: repairedCompare ? 0 : impact,
    pois: repairedCompare ? 0 : pois,
    road: repairedCompare ? 0 : road,
    valves: a ? pulse(s, T.repair + 0.2, T.repair + 1.6, T.restore + 0.2, T.restore + 1.4) : 0,
    isolation: a ? pulse(s, T.repair + 1.0, T.repair + 1.8, T.restore + 0.6, T.restore + 1.6) : 0,
    reroute: a ? pulse(s, T.reroute, T.reroute + 0.8, T.restore + 0.8, T.restore + 2.0) : 0,
    route: a ? ramp(s, T.dispatch, T.dispatch + 2.0) : 0,
    routeVisible: a ? pulse(s, T.dispatch - 0.2, T.dispatch + 0.3, T.resolved + 1.5, T.resolved + 3) : 0,
    truck: a ? ramp(s, T.dispatch + 0.8, T.arrive) : 0,
    repairTone: a ? keys(s, [[T.replace, 0], [T.replace + 0.9, 1], [T.restore, 1], [T.restore + 1.2, 2]]) : 0,
    future,
    burst,
    repaired: repairedCompare,
  };
}
