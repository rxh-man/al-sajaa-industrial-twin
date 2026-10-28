/**
 * Energy and Microgrid Dispatch:
 * - Generation (solar), demand, battery state of charge.
 * - Charging/discharging constraints and efficiency.
 * - Grid import/export.
 * - Baseline vs. proposed scenario comparison.
 * - Energy and CO₂ impact estimates with units.
 *
 * Reuses existing solar, battery, and scenario infrastructure.
 * All calculations are modelled; no real-time metering or forecast.
 */

import { waterPumpingEnergy } from './waterSecurity';

/** Microgrid asset with operating parameters */
export interface MicrogridAsset {
  id: string;
  name: string;
  type: 'solar' | 'battery' | 'load' | 'grid' | 'pump';
  /** kW rated capacity */
  capacity: number;
  /** Current operating setpoint, kW */
  setpoint: number;
  /** Efficiency (0–1): losses in conversion */
  efficiency: number;
}

/** Time-step dispatch result */
export interface DispatchStep {
  hour: number;
  solarGenerationKw: number;
  demandKw: number;
  waterPumpingKw: number;
  batteryChargeKw: number; // positive = charging, negative = discharging
  batteryStateOfChargePercent: number;
  gridImportKw: number; // positive = import, negative = export
  curtailedKw: number; // solar spilled
  assumptions: string[];
}

/** Scenario configuration for microgrid dispatch */
export interface MicrogridScenario {
  id: string;
  name: string;
  description: string;
  /** Solar installed capacity, kW */
  solarCapacityKw: number;
  /** Battery capacity, kWh */
  batteryCapacityKwh: number;
  /** Battery charging efficiency (0.9 = 10% loss) */
  batteryChargeEfficiency: number;
  /** Battery discharging efficiency */
  batteryDischargeEfficiency: number;
  /** Baseline demand, kW */
  baselineDemandKw: number;
  /** Water-pumping demand reduction (e.g., from interventions), kW */
  waterPumpingReductionKw: number;
  /** Water demand, ML/day (used to calculate pumping energy) */
  waterDemandMl: number;
  assumptions: string[];
}

/** Daily summary of microgrid operation */
export interface MicrogridDayResult {
  date: string;
  steps: DispatchStep[];
  totalSolarGenerationKwh: number;
  totalDemandKwh: number;
  totalWaterPumpingKwh: number;
  batteryChargedKwh: number;
  batteryDischargedKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  curtailedKwh: number;
  /** CO₂ emissions (grid imports only; 0.5 kg CO₂/kWh assumed for grid) */
  emissionsCo2Kg: number;
  assumptions: string[];
}

// Default scenarios
export const MICROGRID_SCENARIOS: MicrogridScenario[] = [
  {
    id: 'baseline',
    name: 'Baseline (No Microgrid)',
    description: 'Existing grid supply; no solar or storage.',
    solarCapacityKw: 0,
    batteryCapacityKwh: 0,
    batteryChargeEfficiency: 0.9,
    batteryDischargeEfficiency: 0.95,
    baselineDemandKw: 15, // ~360 kWh/day
    waterPumpingReductionKw: 0,
    waterDemandMl: 42,
    assumptions: [
      'All power from grid.',
      'Grid emission factor: 0.5 kg CO₂/kWh (UAE average).',
      'No local generation or storage.',
    ],
  },
  {
    id: 'proposed',
    name: 'Proposed Microgrid',
    description: 'Solar 150 kW + battery 200 kWh + demand reduction.',
    solarCapacityKw: 150,
    batteryCapacityKwh: 200,
    batteryChargeEfficiency: 0.9,
    batteryDischargeEfficiency: 0.95,
    baselineDemandKw: 15,
    waterPumpingReductionKw: 2, // from greywater + irrigation efficiency
    waterDemandMl: 36, // reduced by ~14% via interventions
    assumptions: [
      'Solar capacity: 150 kW (rooftop, ~1800 m²).',
      'Battery: 200 kWh (4-hour duration at 50 kW discharge).',
      'Charge efficiency: 90%; discharge: 95%.',
      'Demand-side management: -2 kW from water reuse.',
      'Solar profile: typical UAE (peak 12:00–15:00, 1000 W/m²).',
      'Grid available as fallback.',
    ],
  },
];

/**
 * Estimate solar generation at a given hour (simplified 24-hour profile).
 * Peak at 12:00–15:00 (summer-like, UAE).
 */
function solarGenerationKw(hour: number, solarCapacityKw: number): number {
  // Sinusoid peaking 12:00–15:00
  if (hour < 6 || hour > 18) return 0; // night
  const t = (hour - 12) / 12; // -1 (6am) to +1 (18:00)
  const cf = Math.max(0, Math.cos(t * Math.PI) * 0.9 + 0.1); // capacity factor 10–100%
  return solarCapacityKw * cf;
}

/**
 * Dispatch energy for a single hour.
 * - Satisfy demand from: solar → battery discharge → grid import.
 * - Excess solar: charge battery → grid export.
 * - Battery constraints: min 20%, max 100%, max charge/discharge rate.
 */
function dispatchHour(
  hour: number,
  scenario: MicrogridScenario,
  batterySOCPercent: number
): DispatchStep {
  // Generation and demand
  const solarKw = solarGenerationKw(hour, scenario.solarCapacityKw);
  const waterKw = waterPumpingEnergy(scenario.waterDemandMl) / 24; // spread over 24h
  const totalDemandKw = scenario.baselineDemandKw + waterKw - scenario.waterPumpingReductionKw;

  // Battery state (kWh)
  const batteryCapacityKwh = scenario.batteryCapacityKwh;
  const batteryCurrentKwh = (batterySOCPercent / 100) * batteryCapacityKwh;
  const maxChargeRateKw = batteryCapacityKwh / 4; // 4-hour charge time
  const maxDischargeRateKw = batteryCapacityKwh / 2; // 2-hour discharge time

  let batteryChargeKw = 0;
  let gridKw = 0;
  let curtailedKw = 0;

  // Balance: solar → demand → battery → grid
  let availableSolarKw = solarKw;
  let demandRemainKw = totalDemandKw;

  // 1. Satisfy demand from solar
  const solarToLoadKw = Math.min(availableSolarKw, demandRemainKw);
  availableSolarKw -= solarToLoadKw;
  demandRemainKw -= solarToLoadKw;

  // 2. Satisfy remaining demand from battery
  if (demandRemainKw > 0 && batterySOCPercent > 20) {
    const batteryDischargeKw = Math.min(
      maxDischargeRateKw,
      Math.min(demandRemainKw, (batteryCurrentKwh - (batteryCapacityKwh * 0.2)) / 1) // 1-hour step
    );
    const batteryAvailableKw = (batteryDischargeKw * scenario.batteryDischargeEfficiency) / 1; // energy out per hour
    const batteryUseKw = Math.min(batteryAvailableKw, demandRemainKw);
    demandRemainKw -= batteryUseKw;
    batteryChargeKw -= batteryUseKw / scenario.batteryDischargeEfficiency; // account for losses
  }

  // 3. Satisfy remaining demand from grid (or curtail if grid unavailable)
  gridKw = demandRemainKw; // import

  // 4. Charge battery from excess solar
  if (availableSolarKw > 0 && batterySOCPercent < 100) {
    const canChargeKw = Math.min(
      maxChargeRateKw,
      (batteryCapacityKwh - batteryCurrentKwh) / 1 // energy to full, per hour
    );
    const chargeKw = Math.min(availableSolarKw, canChargeKw);
    batteryChargeKw += chargeKw * scenario.batteryChargeEfficiency; // energy in, with losses
    availableSolarKw -= chargeKw;
  }

  // 5. Curtail or export excess
  if (availableSolarKw > 0) {
    // Option: curtail or export to grid
    curtailedKw = availableSolarKw * 0.1; // assume 10% curtailment; rest exported
    gridKw -= availableSolarKw * 0.9;
  }

  // Update battery SOC (1-hour step)
  let newBatterySocPercent = batterySOCPercent + (batteryChargeKw / batteryCapacityKwh) * 100;
  newBatterySocPercent = Math.max(20, Math.min(100, newBatterySocPercent));

  return {
    hour,
    solarGenerationKw: solarKw,
    demandKw: totalDemandKw,
    waterPumpingKw: waterKw,
    batteryChargeKw,
    batteryStateOfChargePercent: newBatterySocPercent,
    gridImportKw: Math.max(0, gridKw),
    curtailedKw,
    assumptions: [
      'Dispatch is deterministic and greedy: solar → load → battery → grid.',
      'Battery SOC limits: 20% minimum, 100% maximum.',
      'Charge/discharge rates limited by battery specifications.',
      'Solar profile is modelled from typical UAE irradiance.',
      'Water pumping energy linked to water-demand interventions.',
    ],
  };
}

/**
 * Simulate a full day (24 hours) of microgrid dispatch.
 */
export function simulateMicrogridDay(scenario: MicrogridScenario, dateIso: string = '2026-10-29'): MicrogridDayResult {
  const steps: DispatchStep[] = [];
  let batterySOC = 50; // start at 50% charge

  let totalSolar = 0,
    totalDemand = 0,
    totalWaterPumping = 0,
    totalBatteryCharge = 0,
    totalBatteryDischarge = 0,
    totalGridImport = 0,
    totalGridExport = 0,
    totalCurtailed = 0;

  for (let h = 0; h < 24; h++) {
    const step = dispatchHour(h, scenario, batterySOC);
    steps.push(step);
    batterySOC = step.batteryStateOfChargePercent;

    totalSolar += step.solarGenerationKw;
    totalDemand += step.demandKw;
    totalWaterPumping += step.waterPumpingKw;
    if (step.batteryChargeKw > 0) totalBatteryCharge += step.batteryChargeKw;
    else totalBatteryDischarge += -step.batteryChargeKw;
    totalGridImport += step.gridImportKw;
    if (step.gridImportKw < 0) totalGridExport += -step.gridImportKw;
    totalCurtailed += step.curtailedKw;
  }

  // CO₂ from grid imports (0.5 kg/kWh assumed)
  const gridEmissionFactor = 0.5; // kg CO₂/kWh
  const emissionsCo2Kg = totalGridImport * gridEmissionFactor;

  return {
    date: dateIso,
    steps,
    totalSolarGenerationKwh: totalSolar,
    totalDemandKwh: totalDemand,
    totalWaterPumpingKwh: totalWaterPumping,
    batteryChargedKwh: totalBatteryCharge,
    batteryDischargedKwh: totalBatteryDischarge,
    gridImportKwh: totalGridImport,
    gridExportKwh: totalGridExport,
    curtailedKwh: totalCurtailed,
    emissionsCo2Kg,
    assumptions: scenario.assumptions,
  };
}

/** Comparison of two scenarios (baseline vs. proposed) */
export interface MicrogridComparison {
  baselineResult: MicrogridDayResult;
  proposedResult: MicrogridDayResult;
  energySavingsKwh: number;
  emissionsSavingsCo2Kg: number;
  improvementPercent: number; // (baseline - proposed) / baseline × 100
}

/**
 * Compare baseline and proposed microgrid scenarios.
 */
export function compareMicrogridScenarios(
  baselineScenario: MicrogridScenario = MICROGRID_SCENARIOS[0],
  proposedScenario: MicrogridScenario = MICROGRID_SCENARIOS[1]
): MicrogridComparison {
  const baselineResult = simulateMicrogridDay(baselineScenario);
  const proposedResult = simulateMicrogridDay(proposedScenario);

  const energySavingsKwh = baselineResult.gridImportKwh - proposedResult.gridImportKwh;
  const emissionsSavingsCo2Kg = baselineResult.emissionsCo2Kg - proposedResult.emissionsCo2Kg;
  const improvementPercent =
    baselineResult.gridImportKwh > 0
      ? ((baselineResult.gridImportKwh - proposedResult.gridImportKwh) / baselineResult.gridImportKwh) * 100
      : 0;

  return {
    baselineResult,
    proposedResult,
    energySavingsKwh,
    emissionsSavingsCo2Kg,
    improvementPercent,
  };
}

/**
 * Summary of microgrid financial and environmental impact.
 */
export interface MicrogridImpact {
  scenario: string;
  annualSolarGenerationKwh: number;
  annualGridImportKwh: number;
  annualEmissionsCo2Tonnes: number;
  estimatedCapitalCostUsd: number;
  estimatedAnnualOperatingCostUsd: number;
  paybackYears: number;
}

/**
 * Estimate annual impact and payback period.
 */
export function estimateMicrogridImpact(scenario: MicrogridScenario): MicrogridImpact {
  // Simple annual projection: 365 days
  const dayResult = simulateMicrogridDay(scenario);

  const annualSolar = dayResult.totalSolarGenerationKwh * 365;
  const annualGridImport = dayResult.gridImportKwh * 365;
  const annualEmissions = (dayResult.emissionsCo2Kg * 365) / 1000; // to tonnes

  // Cost estimates (modelled, not real)
  let capitalCostUsd = 0;
  let annualOpexUsd = 0;

  if (scenario.solarCapacityKw > 0) {
    capitalCostUsd += scenario.solarCapacityKw * 1500; // USD/kW
  }
  if (scenario.batteryCapacityKwh > 0) {
    capitalCostUsd += scenario.batteryCapacityKwh * 300; // USD/kWh
  }
  annualOpexUsd = capitalCostUsd * 0.02; // 2% of capital per year

  const elecCostPerKwh = 0.10; // USD/kWh
  annualOpexUsd += annualGridImport * elecCostPerKwh;

  const paybackYears = capitalCostUsd > 0 ? capitalCostUsd / (annualOpexUsd * 0.5) : Infinity;

  return {
    scenario: scenario.name,
    annualSolarGenerationKwh: annualSolar,
    annualGridImportKwh: annualGridImport,
    annualEmissionsCo2Tonnes: annualEmissions,
    estimatedCapitalCostUsd: Math.round(capitalCostUsd),
    estimatedAnnualOperatingCostUsd: Math.round(annualOpexUsd),
    paybackYears: Math.round(paybackYears * 10) / 10,
  };
}
