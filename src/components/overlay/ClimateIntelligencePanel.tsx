import { useEffect, useState } from 'react';
import { Bot, Cpu } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { temperatureCurve, findHighExposureLocations } from '../../data/heatExposure';
import { airQualityBaseline, compareAirQuality, type Wind } from '../../data/airDispersion';
import {
  estimateWaterLoss,
  analyzeFailureScenario,
  applyWaterInterventions,
  waterPumpingEnergy,
  WATER_INTERVENTIONS,
  BASELINE_DEMAND_ML
} from '../../data/waterSecurity';
import {
  simulateMicrogridDay,
  compareMicrogridScenarios,
  estimateMicrogridImpact,
  MICROGRID_SCENARIOS,
  type MicrogridScenario,
} from '../../data/microgridDispatch';
import { AgentExecutionPanel } from './AgentExecutionPanel';
import { LanguageSwitcher } from './LanguageSwitcher';

/**
 * Climate Intelligence Panel: controls for heat exposure and air quality.
 * - Time-of-day slider: affects temperature curve and pedestrian exposure.
 * - Wind controls: direction (0–360°) and speed.
 * - Mitigation selector: reduce emissions at selected factories.
 * - Results display: high-exposure locations, air quality at selected point.
 */

export function ClimateIntelligencePanel() {
  const heatOn = useTwinStore((s) => s.heatOn);
  const airOn = useTwinStore((s) => s.airOn);
  const waterOn = useTwinStore((s) => s.waterOn ?? false); // default to false if undefined
  const microgridOn = useTwinStore((s) => s.microgridOn ?? false); // default to false if undefined
  const agentExecutorOn = useTwinStore((s) => s.agentExecutorOn ?? false);
  const setAgentExecutorOn = useTwinStore((s) => s.setAgentExecutorOn);
  // only shown alongside the Air or Climate panel, so the first view of the city stays clear
  const airPanel = useTwinStore((s) => s.airPanel);
  const climatePanel = useTwinStore((s) => s.climatePanel);

  if (!airPanel && !climatePanel) return null;
  if (!heatOn && !airOn && !waterOn && !microgridOn && !agentExecutorOn) return null;

  return (
    <aside className="ov-panel climate-panel climate-intel" aria-label="Climate intelligence controls">
      <div className="climate-header">
        <h3>Climate Intelligence</h3>
        <p className="climate-meta">Modelled scenarios · no real-time data</p>
        <button
          onClick={() => setAgentExecutorOn(!agentExecutorOn)}
          className="climate-agent-toggle"
          title="Toggle agent execution engine"
          aria-label="Toggle agent execution engine"
          aria-pressed={agentExecutorOn}
        >
          {agentExecutorOn ? <Bot size={14} /> : <Cpu size={14} />}
        </button>
      </div>

      <LanguageSwitcher />

      {agentExecutorOn && <AgentExecutionPanel />}
      {heatOn && <HeatExposureSection />}
      {airOn && <AirQualitySection />}
      {waterOn && <WaterSecuritySection />}
      {microgridOn && <MicrogridSection />}
    </aside>
  );
}

function HeatExposureSection() {
  const [hour, setHour] = useState(12);
  const [locations, setLocations] = useState<any[]>([]);

  useEffect(() => {
    const locs = findHighExposureLocations();
    setLocations(locs.slice(0, 5)); // top 5
  }, []);

  const tempCurve = temperatureCurve(hour);

  return (
    <div className="climate-section heat-section">
      <h4>Extreme Heat Intelligence</h4>

      <div className="climate-control">
        <label>Time of Day</label>
        <input type="range" min="0" max="23" value={hour} onChange={(e) => setHour(parseInt(e.target.value))} />
        <span className="time-display">
          {hour.toString().padStart(2, '0')}:00 (temp curve: {(tempCurve * 100).toFixed(0)}%)
        </span>
      </div>

      <div className="climate-results">
        <h5>High-Exposure Locations (Top 5)</h5>
        {locations.length > 0 ? (
          <ul className="location-list">
            {locations.map((loc, i) => (
              <li key={i} className="location-item">
                <div className="loc-name">{loc.name}</div>
                <div className="loc-heat">Peak heat: {(loc.peakHeat * 100).toFixed(0)}% @ {loc.peakHour}:00</div>
                {loc.riskFactors.length > 0 && (
                  <div className="loc-risks">Risks: {loc.riskFactors.join(', ')}</div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="climate-info">No high-exposure locations found at this time.</p>
        )}
      </div>

      <div className="climate-note">
        Heat is modelled from road class, factories, and shade trees. No measured temperatures. Time-of-day curve is a sinusoid;
        does not account for clouds or seasonal variation.
      </div>
    </div>
  );
}

function AirQualitySection() {
  const [windDir, setWindDir] = useState(45);
  const [windSpeed, setWindSpeed] = useState(5);
  const [selectedLocation] = useState<[number, number]>([0, 0]);
  const [baselineResult, setBaselineResult] = useState<any>(null);
  const [mitigationEnabled, setMitigationEnabled] = useState(false);
  const [factoryMitigations] = useState(new Map<number, number>());

  useEffect(() => {
    const wind: Wind = { directionDeg: windDir, speedUnitsPerSec: windSpeed / 10 };
    const result = airQualityBaseline(selectedLocation, wind);
    setBaselineResult(result);
  }, [windDir, windSpeed, selectedLocation]);

  const wind: Wind = { directionDeg: windDir, speedUnitsPerSec: windSpeed / 10 };
  const mitigated = mitigationEnabled ? compareAirQuality(selectedLocation, wind, factoryMitigations) : null;
  // drop sources that round to 0.0%, so the list never shows a column of zeros
  const topSources = (baselineResult?.sources ?? []).filter((src: any) => src.contribution >= 0.0005).slice(0, 3);

  return (
    <div className="climate-section air-section">
      <h4>Air Quality Intelligence</h4>

      <div className="climate-controls">
        <div className="climate-control">
          <label>Wind Direction</label>
          <input type="range" min="0" max="360" value={windDir} onChange={(e) => setWindDir(parseInt(e.target.value))} />
          <span>{windDir}°</span>
        </div>

        <div className="climate-control">
          <label>Wind Speed (m/s)</label>
          <input type="range" min="1" max="20" value={windSpeed} onChange={(e) => setWindSpeed(parseInt(e.target.value))} />
          <span>{(windSpeed / 10).toFixed(1)} m/s</span>
        </div>
      </div>

      <div className="climate-results">
        <h5>Baseline Concentration</h5>
        {baselineResult && (
          <div className="air-result">
            <div className="air-concentration">
              Total: {(baselineResult.totalConcentration * 100).toFixed(1)}% (normalized)
            </div>
            {topSources.length > 0 ? (
              <div className="air-sources">
                <p>Top contributors:</p>
                <ul>
                  {topSources.map((src: any, i: number) => (
                    <li key={i}>
                      Factory {src.factoryId}: {(src.contribution * 100).toFixed(1)}%
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="climate-info">No factory adds a measurable share at this point with this wind.</p>
            )}
          </div>
        )}
      </div>

      <div className="climate-controls">
        <label className="climate-check">
          <input
            type="checkbox"
            checked={mitigationEnabled}
            onChange={(e) => setMitigationEnabled(e.target.checked)}
          />
          Show Mitigation Scenario
        </label>
      </div>

      {mitigationEnabled && mitigated && (
        <div className="climate-results">
          <h5>Mitigation Impact</h5>
          <div className="mitigation-result">
            <div className="air-improvement">
              Improvement: {(mitigated.improvement * 100).toFixed(1)}%
            </div>
            <div className="air-mitigated">Mitigated concentration: {(mitigated.mitigated.totalConcentration * 100).toFixed(1)}%</div>
          </div>
        </div>
      )}

      <div className="climate-note">
        Air quality is modelled with a simplified Gaussian plume; no measured data or field validation. Wind is assumed constant
        across the domain. Concentrations are normalized 0–1 and cannot be compared to ambient air-quality standards.
      </div>
    </div>
  );
}

function WaterSecuritySection() {
  const [leakDurationDays, setLeakDurationDays] = useState(1);
  const [selectedInterventions, setSelectedInterventions] = useState<string[]>([]);
  const [failedAsset, setFailedAsset] = useState<string>('pump-d11');
  const [showFailureScenario, setShowFailureScenario] = useState(false);

  // Calculate water loss with current leak scenario
  const waterLoss = estimateWaterLoss(undefined, leakDurationDays);

  // Calculate interventions impact
  const interventionResult = applyWaterInterventions(selectedInterventions);

  // Get failure scenario if toggled
  const failureScenario = showFailureScenario ? analyzeFailureScenario(failedAsset, 12) : null;

  // Calculate pumping energy
  const baselinePumpingKwh = waterPumpingEnergy(BASELINE_DEMAND_ML);
  const proposedPumpingKwh = waterPumpingEnergy(interventionResult.adjustedDemandMl);

  const handleInterventionToggle = (id: string) => {
    setSelectedInterventions((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="climate-section water-section">
      <h4>Water Security & Cascading Resilience</h4>

      <div className="climate-controls">
        <div className="climate-control">
          <label>Leak Duration (days)</label>
          <input
            type="range"
            min="0.5"
            max="7"
            step="0.5"
            value={leakDurationDays}
            onChange={(e) => setLeakDurationDays(parseFloat(e.target.value))}
          />
          <span>{leakDurationDays} day{leakDurationDays !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="climate-results">
        <h5>Water Loss Estimate</h5>
        <div className="water-loss-result">
          <div className="loss-total">Total loss: {waterLoss.lossMl.toFixed(2)} ML</div>
          <div className="loss-breakdown">
            <p>Breakdown:</p>
            <ul>
              {Object.entries(waterLoss.breakdownBySource).map(([source, amount]) => (
                <li key={source}>
                  {source.replace(/_/g, ' ')}: {(amount as number).toFixed(2)} ML
                </li>
              ))}
            </ul>
          </div>
          {waterLoss.cascadeImpact && (
            <div className="cascade-msg">{waterLoss.cascadeImpact}</div>
          )}
        </div>
      </div>

      <div className="climate-controls">
        <h5>Water Interventions</h5>
        {WATER_INTERVENTIONS.map((iv) => (
          <label key={iv.id} className="intervention-checkbox">
            <input
              type="checkbox"
              checked={selectedInterventions.includes(iv.id)}
              onChange={() => handleInterventionToggle(iv.id)}
            />
            <span>{iv.name}</span>
            <span className="intervention-detail">
              {iv.waterSavedMl.toFixed(1)} ML/day, {iv.energyKwh > 0 ? '+' : ''}{iv.energyKwh.toFixed(1)} kWh/day
            </span>
          </label>
        ))}
      </div>

      <div className="climate-results">
        <h5>Scenario Comparison</h5>
        <div className="scenario-compare">
          <div className="scenario-row">
            <div className="scenario-label">Baseline Demand:</div>
            <div className="scenario-value">{BASELINE_DEMAND_ML} ML/day</div>
          </div>
          <div className="scenario-row">
            <div className="scenario-label">Baseline Pumping Energy:</div>
            <div className="scenario-value">{baselinePumpingKwh.toFixed(1)} kWh/day</div>
          </div>
          {selectedInterventions.length > 0 && (
            <>
              <div className="scenario-row scenario-proposed">
                <div className="scenario-label">Proposed Demand:</div>
                <div className="scenario-value">{interventionResult.adjustedDemandMl.toFixed(1)} ML/day</div>
              </div>
              <div className="scenario-row scenario-proposed">
                <div className="scenario-label">Proposed Pumping Energy:</div>
                <div className="scenario-value">{proposedPumpingKwh.toFixed(1)} kWh/day</div>
              </div>
              <div className="scenario-row scenario-savings">
                <div className="scenario-label">Water Saved:</div>
                <div className="scenario-value">{(BASELINE_DEMAND_ML - interventionResult.adjustedDemandMl).toFixed(1)} ML/day</div>
              </div>
              <div className="scenario-row scenario-savings">
                <div className="scenario-label">Energy Impact:</div>
                <div className="scenario-value">{interventionResult.totalEnergyKwh > 0 ? '+' : ''}{interventionResult.totalEnergyKwh.toFixed(1)} kWh/day</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="climate-controls">
        <label className="climate-check">
          <input
            type="checkbox"
            checked={showFailureScenario}
            onChange={(e) => setShowFailureScenario(e.target.checked)}
          />
          Show Cascading Failure Scenario
        </label>
        {showFailureScenario && (
          <div className="climate-control">
            <label>Failed Asset</label>
            <select value={failedAsset} onChange={(e) => setFailedAsset(e.target.value)}>
              <option value="pump-d11">D-11 Pumping Station (pump)</option>
              <option value="main-d11">D-11 Main (main)</option>
              <option value="valve-d12-01">V-D12-01 (isolation valve)</option>
              <option value="tank-central">Central Storage Tank (tank)</option>
              <option value="treatment-a">Treatment Plant A (treatment)</option>
            </select>
          </div>
        )}
      </div>

      {showFailureScenario && failureScenario && (
        <div className="climate-results">
          <h5>Asset Failure: {failureScenario.failedAsset}</h5>
          <div className="failure-scenario">
            <div className="failure-impact">{failureScenario.directImpact}</div>
            {failureScenario.cascadeChain.length > 0 && (
              <div className="cascade-chain">
                <p>Cascade chain:</p>
                <ul>
                  {failureScenario.cascadeChain.map((asset, i) => (
                    <li key={i}>{asset}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="failure-metrics">
              <div className="metric">Recovery time: {failureScenario.recoveryTimeHours}h</div>
              <div className="metric">Water loss: {failureScenario.waterLossML.toFixed(2)} ML</div>
            </div>
            {failureScenario.recoveryActions.length > 0 && (
              <div className="recovery-actions">
                <p>Recovery actions:</p>
                <ul>
                  {failureScenario.recoveryActions.map((action, i) => (
                    <li key={i}>{action}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="climate-note">
        Water loss is modelled from system leakage (15%), evaporation (5%), and failure scenarios (deterministic). Asset dependency graph
        shows pump → main → valve → tank → treatment. All interventions are modelled; no measured outcomes. Energy estimate: 1 kWh per ML
        including treatment and delivery.
      </div>
    </div>
  );
}

function MicrogridSection() {
  const [solarCapacityKw, setSolarCapacityKw] = useState(150);
  const [batteryCapacityKwh, setBatteryCapacityKwh] = useState(200);
  const [demandReductionKw, setDemandReductionKw] = useState(2);

  // Create custom scenario with user inputs
  const customScenario: MicrogridScenario = {
    id: 'custom',
    name: 'Custom Scenario',
    description: 'User-configured microgrid',
    solarCapacityKw,
    batteryCapacityKwh,
    batteryChargeEfficiency: 0.9,
    batteryDischargeEfficiency: 0.95,
    baselineDemandKw: 15,
    waterPumpingReductionKw: demandReductionKw,
    waterDemandMl: 42 - (demandReductionKw * 24), // approximate
    assumptions: ['Solar capacity adjustable', 'Battery capacity adjustable', 'Demand reduction from user input'],
  };

  // Simulate day and get results
  const baselineResult = simulateMicrogridDay(MICROGRID_SCENARIOS[0]); // baseline
  const customResult = simulateMicrogridDay(customScenario);

  // Compare scenarios
  const comparison = compareMicrogridScenarios(MICROGRID_SCENARIOS[0], customScenario);

  // Get annual impact
  const customImpact = estimateMicrogridImpact(customScenario);
  const baselineImpact = estimateMicrogridImpact(MICROGRID_SCENARIOS[0]);

  return (
    <div className="climate-section microgrid-section">
      <h4>Microgrid Dispatch & Energy</h4>

      <div className="climate-controls">
        <div className="climate-control">
          <label>Solar Capacity (kW)</label>
          <input
            type="range"
            min="0"
            max="300"
            step="10"
            value={solarCapacityKw}
            onChange={(e) => setSolarCapacityKw(parseInt(e.target.value))}
          />
          <span>{solarCapacityKw} kW</span>
        </div>

        <div className="climate-control">
          <label>Battery Capacity (kWh)</label>
          <input
            type="range"
            min="0"
            max="500"
            step="50"
            value={batteryCapacityKwh}
            onChange={(e) => setBatteryCapacityKwh(parseInt(e.target.value))}
          />
          <span>{batteryCapacityKwh} kWh</span>
        </div>

        <div className="climate-control">
          <label>Demand Reduction (kW)</label>
          <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={demandReductionKw}
            onChange={(e) => setDemandReductionKw(parseFloat(e.target.value))}
          />
          <span>{demandReductionKw.toFixed(1)} kW</span>
        </div>
      </div>

      <div className="climate-results">
        <h5>Daily Dispatch Profile</h5>
        <div className="dispatch-summary">
          <div className="dispatch-row">
            <div className="dispatch-label">Solar Generation:</div>
            <div className="dispatch-value">{customResult.totalSolarGenerationKwh.toFixed(0)} kWh</div>
          </div>
          <div className="dispatch-row">
            <div className="dispatch-label">Total Demand:</div>
            <div className="dispatch-value">{customResult.totalDemandKwh.toFixed(0)} kWh</div>
          </div>
          <div className="dispatch-row">
            <div className="dispatch-label">Battery Charged:</div>
            <div className="dispatch-value">{customResult.batteryChargedKwh.toFixed(1)} kWh</div>
          </div>
          <div className="dispatch-row">
            <div className="dispatch-label">Battery Discharged:</div>
            <div className="dispatch-value">{customResult.batteryDischargedKwh.toFixed(1)} kWh</div>
          </div>
          <div className="dispatch-row">
            <div className="dispatch-label">Grid Import:</div>
            <div className="dispatch-value">{customResult.gridImportKwh.toFixed(0)} kWh</div>
          </div>
          {customResult.gridExportKwh > 0 && (
            <div className="dispatch-row">
              <div className="dispatch-label">Grid Export:</div>
              <div className="dispatch-value">{customResult.gridExportKwh.toFixed(0)} kWh</div>
            </div>
          )}
          {customResult.curtailedKwh > 0 && (
            <div className="dispatch-row">
              <div className="dispatch-label">Curtailed (spilled):</div>
              <div className="dispatch-value">{customResult.curtailedKwh.toFixed(1)} kWh</div>
            </div>
          )}
        </div>
      </div>

      <div className="climate-results">
        <h5>Scenario Comparison (Daily)</h5>
        <div className="scenario-compare">
          <div className="scenario-row">
            <div className="scenario-label">Baseline Grid Import:</div>
            <div className="scenario-value">{baselineResult.gridImportKwh.toFixed(0)} kWh</div>
          </div>
          <div className="scenario-row">
            <div className="scenario-label">Custom Grid Import:</div>
            <div className="scenario-value">{customResult.gridImportKwh.toFixed(0)} kWh</div>
          </div>
          <div className="scenario-row scenario-savings">
            <div className="scenario-label">Energy Saved:</div>
            <div className="scenario-value">{comparison.energySavingsKwh.toFixed(0)} kWh</div>
          </div>
          <div className="scenario-row scenario-savings">
            <div className="scenario-label">CO₂ Savings:</div>
            <div className="scenario-value">{comparison.emissionsSavingsCo2Kg.toFixed(1)} kg</div>
          </div>
          <div className="scenario-row scenario-savings">
            <div className="scenario-label">Improvement:</div>
            <div className="scenario-value">{comparison.improvementPercent.toFixed(1)}%</div>
          </div>
        </div>
      </div>

      <div className="climate-results">
        <h5>Annual Impact & Payback</h5>
        <div className="impact-summary">
          <div className="impact-row">
            <div className="impact-label">Annual Solar Generation:</div>
            <div className="impact-value">{(customImpact.annualSolarGenerationKwh / 1000).toFixed(0)} MWh</div>
          </div>
          <div className="impact-row">
            <div className="impact-label">Annual Grid Import (custom):</div>
            <div className="impact-value">{(customImpact.annualGridImportKwh / 1000).toFixed(0)} MWh</div>
          </div>
          <div className="impact-row">
            <div className="impact-label">Annual Grid Import (baseline):</div>
            <div className="impact-value">{(baselineImpact.annualGridImportKwh / 1000).toFixed(0)} MWh</div>
          </div>
          <div className="impact-row">
            <div className="impact-label">Annual CO₂ (custom):</div>
            <div className="impact-value">{customImpact.annualEmissionsCo2Tonnes.toFixed(1)} tonnes</div>
          </div>
          <div className="impact-row">
            <div className="impact-label">Capital Cost:</div>
            <div className="impact-value">${customImpact.estimatedCapitalCostUsd.toLocaleString()}</div>
          </div>
          <div className="impact-row">
            <div className="impact-label">Annual Operating Cost:</div>
            <div className="impact-value">${customImpact.estimatedAnnualOperatingCostUsd.toLocaleString()}</div>
          </div>
          <div className="impact-row scenario-savings">
            <div className="impact-label">Payback Period:</div>
            <div className="impact-value">{customImpact.paybackYears.toFixed(1)} years</div>
          </div>
        </div>
      </div>

      <div className="climate-note">
        Microgrid dispatch is deterministic: solar → demand → battery → grid. Battery constraints: 20–100% SOC, max charge/discharge rates.
        Solar profile is typical UAE (peaks 12–15:00, zero at night). Annual projections assume 365 identical days. Grid emission factor: 0.5 kg CO₂/kWh.
        Capital and opex estimates are modelled for planning purposes only.
      </div>
    </div>
  );
}
