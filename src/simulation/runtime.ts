import type { VisualTargets } from './engine';
import type { LayerId } from '../data/networks';

/**
 * Per-frame mutable runtime shared between the simulation driver and the 3D scene.
 * Kept outside React/zustand on purpose: 3D components read these values inside
 * useFrame without triggering re-renders.
 */
export const runtime = {
  /** scenario clock (s) */
  t: 0,
  /** wall clock since start (s) */
  wall: 0,
  /** previous scenario time (for edge-triggered events) */
  lastT: -1,
  /** animation clock for shaders */
  time: 0,
};

const zeroTargets = (): VisualTargets => ({
  ping: 0,
  correlation: 0,
  reticle: 0,
  sectorAlert: 0,
  sectorSeverity: 0,
  healed: 0,
  trench: 0,
  xray: 0,
  exploded: 0,
  leak: 0,
  moisture: 0,
  annotation: 0,
  impact: 0,
  pois: 0,
  road: 0,
  valves: 0,
  isolation: 0,
  reroute: 0,
  route: 0,
  routeVisible: 0,
  truck: 0,
  repairTone: 0,
  future: 0,
  burst: 0,
  repaired: 0,
});

/** Damped visual values consumed by the 3D scene. */
export const live: VisualTargets & {
  layerDim: Record<LayerId, number>;
  layerVis: Record<LayerId, number>;
  hoverPulse: number;
} = {
  ...zeroTargets(),
  layerDim: { electric: 0, telecom: 0, water: 0, cooling: 0, sewage: 0 },
  layerVis: { electric: 1, telecom: 1, water: 1, cooling: 1, sewage: 1 },
  hoverPulse: 0,
};

/** Exponential damping speeds (1/s). Undefined → default. */
export const DAMP: Partial<Record<keyof VisualTargets, number>> = {
  xray: 2.6,
  future: 2.2,
  burst: 2.0,
  truck: 50,
  route: 50,
  impact: 4,
  leak: 3,
  moisture: 1.6,
};

/** Channels that move linearly (units / s) so shaders can apply their own easing. */
export const LINEAR: Partial<Record<keyof VisualTargets, number>> = {
  trench: 0.45,
  exploded: 0.62,
};

export function dampTowards(current: number, target: number, lambda: number, dt: number) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export function moveTowards(current: number, target: number, rate: number, dt: number) {
  const d = target - current;
  const step = rate * dt;
  return Math.abs(d) <= step ? target : current + Math.sign(d) * step;
}
