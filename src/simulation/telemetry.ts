import { T, keys } from './timeline';
import { INCIDENT } from '../data/incident';

/**
 * Deterministic telemetry model.
 * Baselines carry a small, smooth "sensor noise" built from incommensurate sines
 * of wall-clock time (never Math.random), and the incident adds controlled,
 * scripted deviations as a function of scenario time.
 */

export interface Telemetry {
  pressureDev: number; // % vs baseline
  pressureBar: number;
  moistureDev: number; // %
  tempDev: number; // %
  networkHealth: number; // %
  flowImbalance: number; // %
  confidence: number; // leak confidence %
  risk: number; // 0..100
}

const n = (w: number, seed: number) => 0.55 * Math.sin(w * 0.83 + seed) + 0.3 * Math.sin(w * 2.17 + seed * 1.7) + 0.15 * Math.sin(w * 4.9 + seed * 0.37);

export function telemetryAt(t: number, wall: number, active: boolean): Telemetry {
  const s = active ? t : 0;
  const pressureDev =
    keys(s, [
      [T.anomaly, 0],
      [T.anomaly + 2, -0.8],
      [T.anomaly + 4, -1.6],
      [T.pattern - 0.5, -2.7],
      [T.repair + 1, -2.7],
      [T.repair + 2, -3.4],
      [T.reroute + 1.6, -1.9],
      [T.restore, -1.9],
      [T.restore + 1.8, -0.4],
      [T.end, -0.1],
    ]) +
    n(wall, 1.3) * 0.035;
  const moistureDev =
    keys(s, [
      [T.anomaly, 0],
      [T.anomaly + 2.5, 5],
      [T.anomaly + 5, 11],
      [T.pattern, 18],
      [T.replace, 18],
      [T.resolved, 12],
      [T.end, 7],
    ]) +
    n(wall, 4.1) * 0.22;
  const tempDev =
    keys(s, [
      [T.anomaly + 0.5, 0],
      [T.anomaly + 3, 1],
      [T.anomaly + 5.5, 2],
      [T.pattern + 0.5, 4],
      [T.replace, 4],
      [T.resolved, 2],
      [T.end, 1],
    ]) +
    n(wall, 7.7) * 0.07;
  const networkHealth =
    keys(s, [
      [T.pattern - 1, 98.7],
      [T.pattern + 2, 98.1],
      [T.leak, 97.6],
      [T.repair + 1, 97.6],
      [T.repair + 2.2, 96.9],
      [T.restore, 96.9],
      [T.resolved, 98.6],
      [T.end, 98.9],
    ]) +
    n(wall, 2.9) * 0.015;
  const flowImbalance =
    keys(s, [
      [T.anomaly, 0],
      [T.anomaly + 3, 1.2],
      [T.pattern, 3.1],
      [T.repair + 1, 3.1],
      [T.reroute + 1.5, 0.6],
      [T.resolved, 0.2],
    ]) +
    n(wall, 9.1) * 0.05;
  const confidence = keys(s, [
    [T.correlate, 0],
    [T.pattern, 41],
    [T.localize, 61],
    [T.dive + 2, 78],
    [T.leak, INCIDENT.confidence],
  ]);
  const risk = keys(s, [
    [T.anomaly, 12],
    [T.leak, 24],
    [T.predict + 2.5, INCIDENT.riskBefore],
    [T.replace, INCIDENT.riskBefore],
    [T.restore, 48],
    [T.resolved, INCIDENT.riskAfter],
  ]);
  return {
    pressureDev,
    pressureBar: INCIDENT.pressureBaselineBar * (1 + pressureDev / 100),
    moistureDev: Math.max(0, moistureDev),
    tempDev,
    networkHealth,
    flowImbalance,
    confidence,
    risk,
  };
}

/** Projected state at T+48 h if nothing is done (shown by the +48H toggle). */
export const PROJECTED_48H: Telemetry = {
  pressureDev: -11.4,
  pressureBar: INCIDENT.pressureBaselineBar * (1 - 0.114),
  moistureDev: 64,
  tempDev: 9,
  networkHealth: 91.3,
  flowImbalance: 14.8,
  confidence: 97,
  risk: INCIDENT.riskFuture,
};

export const HISTORY_LENGTH = 72;
export const HISTORY_STEP = 0.25; // seconds of scenario/wall time between samples
