/**
 * Industrial Air Quality Intelligence: wind-driven dispersion model.
 *
 * Simulates factory pollutant dispersion under configurable wind conditions.
 * - Wind direction (0–360°) and speed (m/s, converted from scene units).
 * - Gaussian plume model per factory (simplified, illustrative).
 * - Source attribution: shows which factories contribute to a location.
 * - Comparison of baseline vs mitigation scenarios.
 *
 * This is a modelled approximation, not a validated atmospheric dispersion forecast.
 * No measured concentrations or real meteorology.
 */

import { FACTORIES, POLLUTANTS } from './airClimate';

/** Wind in scene units (1 unit = 10 m) */
export interface Wind {
  /** Direction in degrees: 0° = North, 90° = East, etc. */
  directionDeg: number;
  /** Speed in scene units per second (10 m/s ≈ 1 unit/s) */
  speedUnitsPerSec: number;
}

/** Source attribution at a location */
export interface SourceAttribution {
  location: [number, number];
  sources: Array<{
    factoryId: number;
    contribution: number; // 0–1 normalized
    pollutants: string[];
  }>;
  totalConcentration: number; // 0–1 normalized
}

/**
 * Gaussian plume model: concentration at a downwind point.
 * Simplified: ignores stability class, elevation, deposition.
 * C(x,y,z) = (Q / (U * σy * σz * √(2π))) * exp(-y²/(2σy²)) * exp(-(z-H)²/(2σz²))
 *
 * Parameters are illustrative, not calibrated to real data.
 */
function gaussianPlume(
  sourceX: number,
  sourceZ: number,
  receiverX: number,
  receiverZ: number,
  wind: Wind,
  emissionRate: number
): number {
  // Vector from source to receiver
  const dx = receiverX - sourceX;
  const dz = receiverZ - sourceZ;

  // Wind vector (normalized direction + speed)
  const windAngleRad = (wind.directionDeg * Math.PI) / 180;
  const windX = Math.cos(windAngleRad);
  const windZ = Math.sin(windAngleRad);

  // Downwind distance (projection onto wind vector)
  const downwindDist = dx * windX + dz * windZ;

  // Crosswind distance (perpendicular to wind)
  const crosswindDist = Math.abs(-dx * windZ + dz * windX);

  // If upwind, no contribution
  if (downwindDist < 0.5) return 0;

  // Dispersion parameters (Pasquill-Gifford, Stability D, approximate)
  // σy and σz grow with downwind distance
  const ay = 0.22 * downwindDist; // crosswind spread
  const az = 0.2 * downwindDist; // vertical spread (stack height ignored)

  // Avoid division by zero
  if (ay < 0.1 || az < 0.1) return 0;

  // Plume concentration (Gaussian in crosswind and vertical)
  const crosswindFactor = Math.exp(-(crosswindDist * crosswindDist) / (2 * ay * ay));
  const verticalFactor = 1; // simplified: assume receptor at stack height

  // Normalized concentration: emission rate × plume shape / wind transport
  const U = wind.speedUnitsPerSec || 0.1; // avoid zero wind
  const concentration = (emissionRate / (Math.max(0.1, U) * ay * az)) * crosswindFactor * verticalFactor;

  return Math.min(1, concentration * 0.01); // clip to 0–1 and scale
}

/**
 * Total air quality (concentration) at a location, summed over all factories.
 * Baseline: all factories emit at their default levels.
 */
export function airQualityBaseline(location: [number, number], wind: Wind): SourceAttribution {
  const sources = [];
  let total = 0;

  for (const f of FACTORIES) {
    const totalEmission = f.levels.reduce((a, l) => a + l, 0); // sum all pollutants
    const concentration = gaussianPlume(f.x, f.z, location[0], location[1], wind, totalEmission);

    if (concentration > 0) {
      sources.push({
        factoryId: f.id,
        contribution: concentration,
        pollutants: POLLUTANTS.map((p, i) => (f.levels[i] > 0 ? p : null)).filter(Boolean) as string[],
      });
      total += concentration;
    }
  }

  return {
    location,
    sources: sources.sort((a, b) => b.contribution - a.contribution),
    totalConcentration: Math.min(1, total),
  };
}

/**
 * Mitigation scenario: reduce emissions at selected factories.
 * mitigatedFactories: map of factory ID to reduction factor (0.5 = 50% reduction).
 */
export function airQualityMitigated(
  location: [number, number],
  wind: Wind,
  mitigatedFactories: Map<number, number>
): SourceAttribution {
  const sources = [];
  let total = 0;

  for (const f of FACTORIES) {
    const reductionFactor = mitigatedFactories.get(f.id) ?? 1.0; // default: no reduction
    const mitigatedLevels = f.levels.map((l) => l * reductionFactor);
    const totalEmission = mitigatedLevels.reduce((a, l) => a + l, 0);
    const concentration = gaussianPlume(f.x, f.z, location[0], location[1], wind, totalEmission);

    if (concentration > 0) {
      sources.push({
        factoryId: f.id,
        contribution: concentration,
        pollutants: POLLUTANTS.map((p, i) => (mitigatedLevels[i] > 0 ? p : null)).filter(Boolean) as string[],
      });
      total += concentration;
    }
  }

  return {
    location,
    sources: sources.sort((a, b) => b.contribution - a.contribution),
    totalConcentration: Math.min(1, total),
  };
}

export interface ComparisonResult {
  baseline: SourceAttribution;
  mitigated: SourceAttribution;
  improvement: number; // 0–1: (baseline - mitigated) / baseline
  assumptions: string[];
}

/**
 * Compare baseline and mitigated scenarios at a location.
 */
export function compareAirQuality(
  location: [number, number],
  wind: Wind,
  mitigatedFactories: Map<number, number>
): ComparisonResult {
  const baseline = airQualityBaseline(location, wind);
  const mitigated = airQualityMitigated(location, wind, mitigatedFactories);

  const improvement =
    baseline.totalConcentration > 0 ? (baseline.totalConcentration - mitigated.totalConcentration) / baseline.totalConcentration : 0;

  return {
    baseline,
    mitigated,
    improvement: Math.max(0, Math.min(1, improvement)),
    assumptions: [
      'Gaussian plume model is simplified and illustrative; no measured data or field validation.',
      'Dispersion parameters (σy, σz) are approximations; stability class is fixed at Pasquill-Gifford D.',
      'No deposition, chemical transformation, or secondary pollutants modelled.',
      'Wind is assumed constant across the domain (no vertical shear or topographic effects).',
      'Receptor height is at source height (stack height and building effects ignored).',
      'Emission rates are modelled from CATALOGUE; no real monitoring data.',
      'Concentrations are normalized 0–1 and cannot be compared to ambient air-quality standards.',
      'This is a deterministic model; uncertainty is not quantified.',
    ],
  };
}

/**
 * Grid of air quality across the domain at the current wind conditions.
 * For visualization: sample a coarse grid of locations.
 */
export interface AirQualityGrid {
  wind: Wind;
  cells: Array<{
    location: [number, number];
    concentration: number;
    topSource: { factoryId: number; contribution: number } | null;
  }>;
  assumptions: string[];
}

/**
 * Generate a coarse air-quality grid for the scene.
 */
export function buildAirQualityGrid(wind: Wind): AirQualityGrid {
  const cells = [];
  const step = 30; // every 30 units (300 m)
  const minX = -100,
    maxX = 500,
    minZ = -100,
    maxZ = 500;

  for (let x = minX; x < maxX; x += step) {
    for (let z = minZ; z < maxZ; z += step) {
      const attr = airQualityBaseline([x, z] as [number, number], wind);
      const topSource = attr.sources[0] ?? null;
      cells.push({
        location: [x, z] as [number, number],
        concentration: attr.totalConcentration,
        topSource: topSource
          ? { factoryId: topSource.factoryId, contribution: topSource.contribution }
          : null,
      });
    }
  }

  return {
    wind,
    cells,
    assumptions: compareAirQuality([0, 0], wind, new Map()).assumptions,
  };
}
