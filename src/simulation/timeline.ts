/**
 * Deterministic scenario timeline for "Sector B-12 Water Network Anomaly".
 * Everything the twin shows during the guided demo is a pure function of the
 * scenario clock `t` (seconds), so pause / seek / skip are exact and repeatable.
 */

export const T = {
  start: 0,
  anomaly: 2.5,
  correlate: 7,
  pattern: 10,
  localize: 12.5,
  open: 15,
  xray: 16.2,
  dive: 18,
  leak: 22.5,
  predict: 26,
  impact: 29.5,
  plan: 34,
  repair: 37.5,
  reroute: 39.5,
  dispatch: 41.5,
  /** the crew's 18-minute drive is shown fast between dispatch and arrive */
  arrive: 50.5,
  replace: 51.5,
  restore: 54,
  resolved: 56.5,
  end: 62,
} as const;

export type Phase =
  | 'NORMAL'
  | 'ANOMALY'
  | 'CORRELATION'
  | 'DETECTION'
  | 'PREDICTION'
  | 'PRIORITIZATION'
  | 'ACTION_PLAN'
  | 'MITIGATION'
  | 'RESOLVED';

export const PHASES: Phase[] = ['NORMAL', 'ANOMALY', 'CORRELATION', 'DETECTION', 'PREDICTION', 'PRIORITIZATION', 'ACTION_PLAN', 'MITIGATION', 'RESOLVED'];

export function phaseAt(t: number, active: boolean): Phase {
  if (!active) return 'NORMAL';
  if (t < T.anomaly) return 'NORMAL';
  if (t < T.correlate) return 'ANOMALY';
  if (t < T.pattern) return 'CORRELATION';
  if (t < T.predict) return 'DETECTION';
  if (t < T.impact) return 'PREDICTION';
  if (t < T.plan) return 'PRIORITIZATION';
  if (t < T.repair) return 'ACTION_PLAN';
  if (t < T.resolved) return 'MITIGATION';
  return 'RESOLVED';
}

/** Workflow stage: 0 idle · 1 detect · 2 predict · 3 prioritize · 4 plan · 5 complete */
export function stageAt(t: number, active: boolean): number {
  if (!active || t < T.anomaly) return 0;
  if (t < T.leak) return 1;
  if (t < T.impact) return 2;
  if (t < T.plan) return 3;
  if (t < T.resolved) return 4;
  return 5;
}

export type Tone = 'ok' | 'info' | 'warn' | 'alert' | 'success';

export interface Caption {
  key: string;
  title: string;
  detail?: string;
  tone: Tone;
}

const CAPTIONS: (Caption & { t: number })[] = [
  { t: 0, key: 'ok', title: 'Everything is normal', detail: '216 sensors reporting', tone: 'ok' },
  { t: T.anomaly, key: 'drift', title: 'Small changes in area B-12', detail: 'Each one looks harmless on its own', tone: 'info' },
  { t: T.correlate, key: 'correlate', title: 'Comparing nearby sensors…', detail: 'Pressure, wet ground and heat together', tone: 'warn' },
  { t: T.pattern, key: 'pattern', title: 'Something is wrong in area B-12', detail: 'The changes point to one cause', tone: 'warn' },
  { t: T.localize, key: 'localize', title: 'Finding the exact spot', detail: 'Under Khalifa Street', tone: 'warn' },
  { t: T.open, key: 'open', title: 'Looking under the road', detail: 'Khalifa Street', tone: 'info' },
  { t: T.dive, key: 'follow', title: 'Following the main water pipe', detail: '2 m below the street', tone: 'warn' },
  { t: T.leak, key: 'leak', title: 'Likely water leak underground', detail: 'Could burst in 36–52 hours', tone: 'alert' },
  { t: T.predict, key: 'predict', title: 'Working out when it could break', detail: 'Looking 3 days ahead', tone: 'alert' },
  { t: T.impact, key: 'impact', title: 'Who would be affected', detail: '12,400 people · a hospital nearby', tone: 'alert' },
  { t: T.plan, key: 'plan', title: 'Send a repair crew within 6 hours', detail: 'Fixing it now costs about AED 660K', tone: 'warn' },
  { t: T.repair, key: 'step1', title: 'Step 1 · Close the valves', detail: 'Stop water to the damaged part', tone: 'info' },
  { t: T.reroute, key: 'step2', title: 'Step 2 · Send water another way', detail: 'Homes keep their water', tone: 'info' },
  { t: T.dispatch, key: 'step3', title: 'Step 3 · Crew 07 is driving over', detail: 'An 18-minute drive through downtown, shown fast', tone: 'info' },
  { t: T.arrive, key: 'arrive', title: 'Crew 07 is on site', detail: 'One lane of Khalifa Street closed, ambulances still get through', tone: 'info' },
  { t: T.replace, key: 'step4', title: 'Step 4 · Replace the broken pipe', detail: 'A 3 m section', tone: 'info' },
  { t: T.restore, key: 'step5', title: 'Step 5 · Test and turn water back on', detail: 'Checking the pressure is normal', tone: 'info' },
  { t: T.resolved, key: 'resolved', title: 'Fixed before it broke', detail: '12,400 people kept their water · AED 5.94M saved', tone: 'success' },
];

export function captionAt(t: number, active: boolean): Caption {
  if (!active) return CAPTIONS[0];
  let c = CAPTIONS[0];
  for (const cap of CAPTIONS) if (t >= cap.t) c = cap;
  return c;
}

/** Markers shown on the scenario progress bar. */
export const TIMELINE_MARKERS: { t: number; label: string }[] = [
  { t: T.anomaly, label: 'Change' },
  { t: T.pattern, label: 'Detect' },
  { t: T.leak, label: 'Leak' },
  { t: T.predict, label: 'Predict' },
  { t: T.impact, label: 'Impact' },
  { t: T.plan, label: 'Plan' },
  { t: T.repair, label: 'Repair' },
  { t: T.dispatch, label: 'Crew' },
  { t: T.resolved, label: 'Fixed' },
];

/* ---------------- helpers ---------------- */

/** How much faster than real life the city moves: 6× while the crew's drive is fast-forwarded. */
export function fastForwardAt(t: number, active: boolean) {
  return active ? 1 + 5 * pulse(t, T.dispatch + 0.4, T.dispatch + 1.6, T.arrive - 1.0, T.arrive) : 1;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
/** 0→1 between a and b (smoothstep) */
export const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
/** rises a0→a1, holds, falls b0→b1 */
export const pulse = (t: number, a0: number, a1: number, b0: number, b1: number) => ramp(t, a0, a1) * (1 - ramp(t, b0, b1));

/** Piecewise interpolation over [t, value] keys with smoothstep easing. */
export function keys(t: number, k: [number, number][]): number {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) {
    const [t0, v0] = k[i];
    const [t1, v1] = k[i + 1];
    if (t <= t1) return v0 + (v1 - v0) * smooth((t - t0) / Math.max(1e-6, t1 - t0));
  }
  return k[k.length - 1][1];
}
