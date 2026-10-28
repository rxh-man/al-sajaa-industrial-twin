/**
 * Water Security and Cascading Resilience:
 * - Water-loss estimates over time.
 * - Reuse and irrigation interventions.
 * - Pumping-energy estimates (linked to energy model).
 * - Infrastructure dependency graph.
 * - Cascading-failure scenarios and recovery.
 *
 * All calculations are modelled; no measured system data.
 */

import type { Scenario } from './climateAgents';

export interface WaterAsset {
  id: string;
  name: string;
  type: 'pump' | 'valve' | 'main' | 'tank' | 'treatment';
  location: [number, number];
  capacity: number; // ML/day (megalitres)
  upstreamAssets: string[]; // ids of assets that feed into this one
  downstreamAssets: string[]; // ids of assets this feeds
  failureImpact: string; // what breaks if this asset fails
}

export interface WaterIntervention {
  id: string;
  name: string;
  description: string;
  type: 'reuse' | 'irrigation' | 'efficiency' | 'storage';
  assumptions: string[];
  dataGaps: string[];
  /** Water saved or reused per day, ML */
  waterSavedMl: number;
  /** Energy cost or benefit, kWh/day */
  energyKwh: number;
}

export const WATER_ASSETS: WaterAsset[] = [
  {
    id: 'pump-d11',
    name: 'D-11 Pumping Station',
    type: 'pump',
    location: [0, 0],
    capacity: 85,
    upstreamAssets: [],
    downstreamAssets: ['main-d11', 'tank-central'],
    failureImpact: 'No water supply to district D; tank drain-down in 6–8 hours',
  },
  {
    id: 'main-d11',
    name: 'D-11 Main (DN300)',
    type: 'main',
    location: [1.5, -2.4],
    capacity: 80,
    upstreamAssets: ['pump-d11'],
    downstreamAssets: ['valve-d12-01', 'tank-central'],
    failureImpact: 'Leak or rupture; district pressure drop; reroute via A|B loop',
  },
  {
    id: 'valve-d12-01',
    name: 'V-D12-01 (Isolation valve)',
    type: 'valve',
    location: [0, 0],
    capacity: 80,
    upstreamAssets: ['main-d11'],
    downstreamAssets: ['tank-central'],
    failureImpact: 'Cannot isolate leak; continues to drain tank',
  },
  {
    id: 'tank-central',
    name: 'Central Storage Tank',
    type: 'tank',
    location: [5, 5],
    capacity: 12,
    upstreamAssets: ['pump-d11', 'main-d11'],
    downstreamAssets: ['treatment-a'],
    failureImpact: 'No buffer; demand must match supply in real time',
  },
  {
    id: 'treatment-a',
    name: 'Treatment Plant A',
    type: 'treatment',
    location: [10, 10],
    capacity: 75,
    upstreamAssets: ['tank-central'],
    downstreamAssets: [],
    failureImpact: 'Untreated water released; health risk',
  },
];

/** Baseline daily water demand, ML/day */
export const BASELINE_DEMAND_ML = 42;

/**
 * Water-loss estimate over a period.
 * Baseline loss includes system leakage, evaporation, and unaccounted-for water.
 */
export function estimateWaterLoss(
  _scenario: Scenario | undefined,
  durationDays: number,
  assetFailures: string[] = []
): { lossMl: number; breakdownBySource: Record<string, number>; cascadeImpact: string } {
  // Baseline leakage: ~15% of supply (system loss)

  const breakdown: Record<string, number> = {
    'system_leakage': BASELINE_DEMAND_ML * 0.15 * durationDays,
    'evaporation': BASELINE_DEMAND_ML * 0.05 * durationDays,
  };

  // Asset failures increase loss
  let cascadeMsg = '';
  if (assetFailures.includes('main-d11')) {
    // Rupture loss ~30 ML/day for ~12 hours until isolated
    breakdown['main_rupture'] = 30 * 0.5 * durationDays;
    cascadeMsg = 'Main rupture: 30 ML/day until isolation. Valve-D12-01 must function.';
  }
  if (assetFailures.includes('tank-central')) {
    breakdown['tank_overflow'] = 5 * durationDays; // overflow if no control
    cascadeMsg += ' Tank overflow: lose excess if pump cannot modulate.';
  }

  const totalLoss = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    lossMl: totalLoss,
    breakdownBySource: breakdown,
    cascadeImpact: cascadeMsg || 'No cascading failures.',
  };
}

export const WATER_INTERVENTIONS: WaterIntervention[] = [
  {
    id: 'greywater-reuse',
    name: 'Greywater Recycling System',
    description: 'Capture and reuse building greywater (showers, sinks) for irrigation and toilet flushing.',
    type: 'reuse',
    assumptions: [
      'Capture ~30% of building water (excludes toilet, grey waste)',
      'Reuse for irrigation (60%) and toilet flushing (40%)',
      'No health risk if not mixed with potable water',
      'Simple treatment (coarse filter + UV); no advanced WQRS',
    ],
    dataGaps: ['Actual building occupancy and daily routines', 'Greywater microbiology', 'Willingness to use reclaimed water'],
    waterSavedMl: 6,
    energyKwh: 2, // small pump + UV
  },
  {
    id: 'rainwater-harvest',
    name: 'Rainwater Harvesting',
    description: 'Capture roof runoff during rainfall (rare in Al Sajaa) and store for irrigation.',
    type: 'storage',
    assumptions: [
      'Rainfall ~150 mm/year in UAE; most falls Oct–Apr',
      'Roof area ~15,000 m² (buildings)',
      'Catchment efficiency ~80%; tank loss to evaporation ~10%',
      'Storage in 50 ML distributed tanks',
    ],
    dataGaps: ['Actual rainfall patterns (ENSO, climate change)', 'Tank maintenance and algae growth', 'Integration with existing irrigation'],
    waterSavedMl: 1, // averaged over whole year (high variance)
    energyKwh: -0.5, // gravity feed, slight saving
  },
  {
    id: 'irrigation-efficiency',
    name: 'Drip Irrigation Upgrade',
    description: 'Replace flood irrigation with drip and micro-irrigation for landscape and agriculture.',
    type: 'efficiency',
    assumptions: [
      'Current irrigation: 18 ML/day (flood method)',
      'Drip efficiency: ~85% vs ~60% (flood)',
      '25% reduction in water use for same greenery',
      'No yield loss; reduced labour',
    ],
    dataGaps: ['Actual irrigation demand by crop', 'Maintenance requirements', 'Soil type and infiltration rates'],
    waterSavedMl: 4.5,
    energyKwh: 3, // higher-pressure pumps for drip lines
  },
  {
    id: 'demand-mgmt',
    name: 'Demand Management (Behaviour)',
    description: 'Public education, leakage detection, and meter-based conservation pricing.',
    type: 'efficiency',
    assumptions: [
      'Behaviour change: ~10% reduction in per-capita use',
      'Leakage detection: monthly inspections, NRW reduced from 15% to 12%',
      'Pricing: 1.5× rate above baseline; elastic demand',
    ],
    dataGaps: ['Price elasticity', 'Public compliance', 'Equity concerns for low-income users'],
    waterSavedMl: 5,
    energyKwh: 0, // none
  },
];

/**
 * Apply water interventions to reduce demand/loss.
 * Returns the adjusted demand and energy impact.
 */
export function applyWaterInterventions(
  selected: string[],
  demandMl: number = BASELINE_DEMAND_ML
): { adjustedDemandMl: number; totalEnergyKwh: number; description: string } {
  let waterSaved = 0;
  let energyImpact = 0;
  const names: string[] = [];

  for (const id of selected) {
    const iv = WATER_INTERVENTIONS.find((i) => i.id === id);
    if (iv) {
      waterSaved += iv.waterSavedMl;
      energyImpact += iv.energyKwh;
      names.push(iv.name);
    }
  }

  return {
    adjustedDemandMl: Math.max(0, demandMl - waterSaved),
    totalEnergyKwh: energyImpact,
    description: `Applied: ${names.join(', ')}. Water saved: ${waterSaved.toFixed(1)} ML/day. Energy impact: ${energyImpact > 0 ? '+' : ''}${energyImpact.toFixed(1)} kWh/day.`,
  };
}

/**
 * Link water pumping demand to energy model.
 * Pumping energy depends on volume and pressure/elevation gain.
 * Simplified: 1 kWh per ML pumped (includes treatment, delivery).
 */
export function waterPumpingEnergy(demandMl: number): number {
  const baselineEnergyKwh = 1; // kWh per ML
  return demandMl * baselineEnergyKwh;
}

/**
 * Cascading-failure scenario.
 * Asset failure → downstream consequence → user impact.
 */
export interface FailureScenario {
  failedAsset: string;
  directImpact: string;
  cascadeChain: string[];
  recoveryActions: string[];
  recoveryTimeHours: number;
  waterLossML: number;
}

export function analyzeFailureScenario(failedAssetId: string, durationHours: number = 12): FailureScenario {
  const asset = WATER_ASSETS.find((a) => a.id === failedAssetId);
  if (!asset) {
    return {
      failedAsset: failedAssetId,
      directImpact: 'Asset not found',
      cascadeChain: [],
      recoveryActions: [],
      recoveryTimeHours: 0,
      waterLossML: 0,
    };
  }

  // Identify cascade
  const cascade: string[] = [];
  const visited = new Set<string>();

  function propagate(assetId: string, depth: number) {
    if (depth > 3 || visited.has(assetId)) return;
    visited.add(assetId);
    const a = WATER_ASSETS.find((x) => x.id === assetId);
    if (a) {
      cascade.push(`${a.name} (${a.failureImpact})`);
      for (const downstream of a.downstreamAssets) {
        propagate(downstream, depth + 1);
      }
    }
  }

  propagate(failedAssetId, 0);

  // Recovery depends on asset type
  let recoveryTime = 0;
  const recovery: string[] = [];

  if (asset.type === 'pump') {
    recoveryTime = 6; // 6 hours to replace/repair pump
    recovery.push('Activate backup pump', 'Isolate failed pump', 'Run parallel supply via tank');
  } else if (asset.type === 'main') {
    recoveryTime = 12; // 12 hours to excavate, repair, pressure-test
    recovery.push('Isolate with upstream/downstream valves', 'Reroute via backup main', 'Pressure test at 5 bar', 'Reopen in stages');
  } else if (asset.type === 'valve') {
    recoveryTime = 2; // 2 hours to manual bypass or repair
    recovery.push('Isolate failed valve', 'Install temporary bypass', 'Test flow');
  } else {
    recoveryTime = 3;
    recovery.push('Assess condition', 'Activate backup system', 'Gradual recovery');
  }

  // Water loss during outage
  const lossResult = estimateWaterLoss(undefined as any, durationHours / 24, [failedAssetId]);

  return {
    failedAsset: asset.name,
    directImpact: asset.failureImpact,
    cascadeChain: cascade,
    recoveryActions: recovery,
    recoveryTimeHours: recoveryTime,
    waterLossML: lossResult.lossMl,
  };
}
