/**
 * Extreme Heat Intelligence: time-of-day modulation and pedestrian exposure.
 *
 * Extends heatGrid with:
 * - Time-of-day temperature curve (cooler early morning, peak midday, cooling evening).
 * - Pedestrian exposure: heat load over a walking duration, affected by shade availability and surface.
 * - High-exposure location identification.
 *
 * All values are modelled approximations with explicit assumptions. No measured temperatures.
 */

import { heatAt } from './heatGrid';
import { FACTORIES, SHADE_TREES } from './airClimate';
import { AD } from './abudhabi';

/** Hour 0–23 */
export type Hour = number;

/** Time-of-day relative temperature curve (peak = 1.0 at noon). */
export function temperatureCurve(hour: Hour): number {
  // Sinusoidal with peak at 12:00, cooler mornings/evenings
  // 6:00 (sunrise) ≈ 0.2, 12:00 (peak) = 1.0, 18:00 (sunset) ≈ 0.3, 0:00 = 0.15
  const t = (hour - 12) / 12; // shift so peak is at hour 12
  return Math.max(0.15, Math.sin(t * Math.PI + Math.PI / 2) * 0.5 + 0.5);
}

export interface HeatAt {
  hour: Hour;
  location: [number, number]; // [x, z]
}

/** Modelled heat at a location and hour (0–1 scale). */
export function heatAtTimeAndPlace(at: HeatAt): number {
  const baseHeat = heatAt(at.location[0], at.location[1]);
  const timeMod = temperatureCurve(at.hour);
  return baseHeat * timeMod;
}

/** Distance to nearest shade (shade tree or building). Simple: trees only. */
function distanceToNearestShade(x: number, z: number): number {
  let minDist = Infinity;
  for (const tree of SHADE_TREES) {
    const d = Math.hypot(tree.x - x, tree.z - z);
    if (d < minDist) minDist = d;
  }
  // Buildings: for simplicity, assume buildings (from AD.buildings) have their footprints;
  // rough heuristic: any location near a building cluster gets some shade.
  // For now, only count trees for precision.
  return minDist;
}

/** Shade factor: 1.0 = fully exposed, 0.5 = partial shade (under tree canopy), 0.0 = full shade. */
function shadeFactor(x: number, z: number): number {
  const d = distanceToNearestShade(x, z);
  // If within 3 units (30 m) of a tree, get progressively more shade
  if (d > 10) return 1.0; // no shade
  if (d < 1) return 0.5; // under tree
  // Linear fade: at 10 units away, 1.0; at 1 unit away, 0.5
  return 1.0 - (10 - d) / 18;
}

/** Surface type affects heat absorption/reflection. Roads absorb more; parks/green less. */
function surfaceHeatFactor(x: number, z: number): number {
  // Heuristic: near a factory or road cluster → asphalt (1.1 multiplier);
  // near trees/parks → lower (0.9). For now, simple: if near factory, 1.1; else 1.0
  for (const f of FACTORIES) {
    if (Math.hypot(f.x - x, f.z - z) < 20) return 1.1;
  }
  return 1.0;
}

export interface PedestrianRoute {
  startLocation: [number, number];
  endLocation: [number, number];
  /** Walking time in minutes */
  durationMinutes: number;
  /** Hour of day (0–23) when walk starts */
  startHour: Hour;
}

export interface ExposureResult {
  /** Cumulative heat dose (heat × time × factors) */
  heatDose: number;
  /** Average heat experienced (0–1) */
  avgHeat: number;
  /** Shade factor encountered (0–1; 0 = all shaded, 1 = all exposed) */
  shadeAvailability: number;
  /** Assumptions and limitations */
  assumptions: string[];
}

/**
 * Calculate pedestrian heat exposure over a route and duration.
 * Integrates heat at multiple points along the path, accounting for time-of-day, shade, and surface.
 */
export function calculateExposure(route: PedestrianRoute): ExposureResult {
  const [sx, sz] = route.startLocation;
  const [ex, ez] = route.endLocation;
  const dist = Math.hypot(ex - sx, ez - sz);
  const steps = Math.max(3, Math.ceil(dist / 2)); // sample every ~2 units
  const timePerStep = route.durationMinutes / 60 / steps; // hours per step

  let totalHeat = 0;
  let totalShade = 0;
  let totalSurfaceFactor = 1;

  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    const x = sx + (ex - sx) * frac;
    const z = sz + (ez - sz) * frac;
    const hour = (route.startHour + (i / steps) * (route.durationMinutes / 60)) % 24;

    const heat = heatAtTimeAndPlace({ hour, location: [x, z] });
    const shade = shadeFactor(x, z);
    const surface = surfaceHeatFactor(x, z);

    // Effective heat dose: heat × shade factor (exposed more) × surface (darker surfaces hotter)
    const effectiveHeat = heat * shade * surface;
    totalHeat += effectiveHeat * timePerStep;
    totalShade += shade;
    totalSurfaceFactor *= surface;
  }

  const numSamples = steps + 1;
  const avgHeat = totalHeat / (route.durationMinutes / 60); // normalize by duration
  const avgShade = totalShade / numSamples;

  return {
    heatDose: totalHeat,
    avgHeat: Math.min(1, avgHeat), // clamp to 0–1
    shadeAvailability: avgShade,
    assumptions: [
      'Heat model is modelled from road class, factories, and tree shade; not measured temperatures.',
      'Time-of-day curve is a sinusoid; does not account for seasonal variation, clouds, or actual meteorology.',
      'Pedestrian exposure assumes constant walking speed and linear path.',
      'Shade factor: trees within 10 units (100 m); buildings ignored (simplified).',
      'Surface factor: near factories (±20 units) assumed asphalt (1.1×); elsewhere 1.0×.',
      'No account for humidity, wind, clothing, acclimation, or health factors.',
      'Duration is input; no adaptive timing model.',
    ],
  };
}

export interface HighExposureLocation {
  name: string;
  location: [number, number];
  baseHeat: number;
  peakHour: Hour;
  peakHeat: number;
  riskFactors: string[];
}

/**
 * Identify locations where pedestrians face high heat exposure.
 * Criteria: high base heat + low shade + surface heat + peak-hour timing.
 */
export function findHighExposureLocations(): HighExposureLocation[] {
  const locations: HighExposureLocation[] = [];
  const rect = AD.meta.rect;
  // Sample a coarse grid to find hotspots
  const step = 25; // every 25 units (250 m)
  for (let x = rect.minX + step; x < rect.maxX; x += step) {
    for (let z = rect.minZ + step; z < rect.maxZ; z += step) {
      const baseHeat = heatAt(x, z);
      const shade = shadeFactor(x, z);
      const surface = surfaceHeatFactor(x, z);

      // High exposure: high heat + low shade + surface factor
      const exposureScore = baseHeat * shade * surface;
      if (exposureScore < 0.6) continue; // only report high-exposure areas

      // Find peak hour for this location
      let peakHour = 12;
      let peakHeat = 0;
      for (let h = 6; h <= 18; h++) {
        const h_val = heatAtTimeAndPlace({ hour: h, location: [x, z] });
        if (h_val > peakHeat) {
          peakHeat = h_val;
          peakHour = h;
        }
      }

      const riskFactors: string[] = [];
      if (baseHeat > 0.7) riskFactors.push('High baseline heat');
      if (shade > 0.8) riskFactors.push('Low shade availability');
      if (surface > 1.05) riskFactors.push('Heat-absorbing surfaces');
      if (peakHour >= 12 && peakHour <= 14) riskFactors.push('Peak exposure near midday');

      locations.push({
        name: `Hotspot at (${x.toFixed(0)}, ${z.toFixed(0)})`,
        location: [x, z],
        baseHeat,
        peakHour,
        peakHeat,
        riskFactors,
      });
    }
  }

  // Sort by peak heat, descending
  return locations.sort((a, b) => b.peakHeat - a.peakHeat).slice(0, 10);
}
