/**
 * MissionMode: interactive guided workflow for climate action planning.
 * Steps: assess → identify → recommend → select → apply → compare → download
 */
import { useState } from 'react';
import { ChevronRight, Download } from 'lucide-react';
import { BASELINE } from '../../data/climateAgents';
import { createMission, advanceStep, selectIntervention, deselectIntervention, applyInterventions, downloadActionPlan, type MissionState, type StepId } from '../../data/climateGuidance';

const n = (v: number, d = 1) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

export function MissionMode() {
  const [mission, setMission] = useState<MissionState | null>(null);
  const [error, setError] = useState('');

  const start = () => {
    setError('');
    setMission(createMission(BASELINE));
  };

  const nextStep = () => {
    if (!mission) return;
    const steps: StepId[] = ['assess', 'identify', 'recommend', 'select', 'apply', 'compare'];
    const currentIdx = steps.indexOf(mission.step);
    if (currentIdx < steps.length - 1) {
      setMission(advanceStep(mission, steps[currentIdx + 1]));
    }
  };

  const toggleIntervention = (ivId: string) => {
    if (!mission) return;
    const selected = mission.selected.find((s) => s.id === ivId);
    if (selected) {
      setMission(deselectIntervention(mission, ivId));
    } else {
      const iv = mission.interventions.find((i) => i.id === ivId);
      if (iv) {
        const params = Object.fromEntries(
          Object.entries(iv.parameters).map(([k, v]) => [k, v.value])
        );
        setMission(selectIntervention(mission, ivId, params));
      }
    }
  };

  const doApply = () => {
    if (!mission) return;
    setMission(applyInterventions(mission));
    nextStep();
  };

  const downloadPlan = () => {
    if (!mission) return;
    const data = downloadActionPlan(mission);
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `action-plan-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (!mission) {
    return (
      <div className="mission-panel">
        <h3>Climate Mission Mode</h3>
        <p className="text-sm text-gray-500">Interactive guided workflow: assess baseline → recommend interventions → select portfolio → apply to scenario → compare → download action plan.</p>
        <button onClick={start} className="mission-start-btn">
          Start Mission
        </button>
      </div>
    );
  }

  return (
    <div className="mission-panel">
      <div className="mission-header">
        <h3>Climate Mission Mode</h3>
        <div className="mission-step-indicator">{mission.step}</div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="mission-content">
        {mission.step === 'assess' && mission.baselineAssessment && (
          <div className="mission-step assess">
            <h4>Assess Baseline</h4>
            <div className="assessment-grid">
              <div className="metric">
                <span className="label">Solar generation:</span>
                <span className="value">{n(mission.baselineAssessment.solarMWh)} MWh/yr</span>
              </div>
              <div className="metric">
                <span className="label">Factory emissions:</span>
                <span className="value">{n(mission.baselineAssessment.factoryCo2T)} t CO₂/yr</span>
              </div>
              <div className="metric">
                <span className="label">Truck emissions:</span>
                <span className="value">{n(mission.baselineAssessment.truckCo2T)} t CO₂/yr</span>
              </div>
              <div className="metric">
                <span className="label">Tree absorption:</span>
                <span className="value">{n(mission.baselineAssessment.treeCo2AbsorbedT)} t CO₂/yr</span>
              </div>
              <div className="metric">
                <span className="label">Net emissions:</span>
                <span className="value">{n(mission.baselineAssessment.netCo2T)} t CO₂/yr</span>
              </div>
              <div className="metric">
                <span className="label">Grid import:</span>
                <span className="value">{n(mission.baselineAssessment.gridImportMWh)} MWh/yr</span>
              </div>
            </div>
            <p className="text-sm text-gray-400 mt-4">
              <strong>Interpretation:</strong> This is a modelled assessment from the climate agents. No real data. These metrics drive the recommendations in the next step.
            </p>
          </div>
        )}

        {mission.step === 'identify' && (
          <div className="mission-step identify">
            <h4>Identify Issues & Opportunities</h4>
            <p className="text-sm text-gray-500 mb-4">
              Based on the baseline assessment, the system identifies high-impact areas for intervention. This is a simplified heuristic model.
            </p>
            <ul className="issues-list">
              {mission.baselineAssessment && mission.baselineAssessment.factoryCo2T > 50 && (
                <li>
                  <strong>Factory emissions:</strong> {mission.baselineAssessment.factoryCo2T.toFixed(0)} t CO₂/yr is a major source. Renewable energy and efficiency can help.
                </li>
              )}
              {mission.baselineAssessment && mission.baselineAssessment.truckCo2T > 1 && (
                <li>
                  <strong>Freight transport:</strong> {mission.baselineAssessment.truckCo2T.toFixed(1)} t CO₂/yr from trucks. Routing optimisation and electrification are levers.
                </li>
              )}
              <li>
                <strong>Green infrastructure:</strong> Expanding canopy and renewable energy improves resilience and absorption.
              </li>
            </ul>
          </div>
        )}

        {mission.step === 'recommend' && (
          <div className="mission-step recommend">
            <h4>Recommended Interventions</h4>
            <p className="text-sm text-gray-500 mb-4">
              Select interventions to move to the next step. Each shows modelled CO₂ reductions and data gaps (never invented costs).
            </p>
            <div className="interventions-list">
              {mission.interventions.map((iv) => {
                const isSelected = mission.selected.some((s) => s.id === iv.id);
                return (
                  <div key={iv.id} className={`intervention-card ${isSelected ? 'selected' : ''}`}>
                    <div className="iv-header">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleIntervention(iv.id)}
                      />
                      <div className="iv-title-block">
                        <h5>{iv.title}</h5>
                        <p className="text-xs text-gray-400">{iv.description}</p>
                      </div>
                    </div>
                    <div className="iv-details">
                      <div className="metric">
                        <span className="label">Modelled CO₂ reduction:</span>
                        <span className="value">{n(iv.estimatedCo2Reduction)} kg/yr</span>
                      </div>
                      <div className="metric">
                        <span className="label">Feasibility:</span>
                        <span className={`feasibility ${iv.feasibility}`}>{iv.feasibility}</span>
                      </div>
                      <details className="assumptions">
                        <summary>Assumptions & data gaps</summary>
                        <div className="details-content">
                          <p className="text-xs text-gray-400">
                            <strong>Assumptions:</strong> {iv.assumptions.join('; ')}
                          </p>
                          <p className="text-xs text-gray-400">
                            <strong>Data gaps (not invented):</strong> {iv.dataGaps.join('; ')}
                          </p>
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {mission.step === 'select' && (
          <div className="mission-step select">
            <h4>Selected Portfolio</h4>
            {mission.selected.length === 0 ? (
              <p className="text-sm text-gray-500">No interventions selected. Go back to Recommend to select some.</p>
            ) : (
              <div className="selected-list">
                {mission.selected.map((sel) => {
                  const iv = mission.interventions.find((i) => i.id === sel.id);
                  if (!iv) return null;
                  return (
                    <div key={sel.id} className="selected-item">
                      <div className="selected-header">
                        <h5>{iv.title}</h5>
                        <button className="remove-btn" onClick={() => toggleIntervention(sel.id)}>
                          Remove
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">{iv.description}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        <strong>Parameters:</strong> {JSON.stringify(sel.parameters)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mission.step === 'apply' && mission.comparison.proposed && (
          <div className="mission-step apply">
            <h4>Applied Scenario Comparison</h4>
            <div className="comparison-grid">
              <div className="scenario-col baseline">
                <h5>Baseline</h5>
                <p className="metric">
                  <span className="label">Net CO₂:</span>
                  <span className="value">{n(mission.comparison.baseline?.netCo2T ?? 0)} t/yr</span>
                </p>
                <p className="metric">
                  <span className="label">Solar:</span>
                  <span className="value">{n(mission.comparison.baseline?.solarMWh ?? 0)} MWh</span>
                </p>
              </div>
              <div className="scenario-col proposed">
                <h5>Proposed</h5>
                <p className="metric">
                  <span className="label">Net CO₂:</span>
                  <span className="value">{n(mission.comparison.proposed.netCo2T)} t/yr</span>
                </p>
                <p className="metric">
                  <span className="label">Solar:</span>
                  <span className="value">{n(mission.comparison.proposed.solarMWh)} MWh</span>
                </p>
              </div>
            </div>
            {mission.comparison.baseline && (
              <div className="savings">
                <p className="text-sm">
                  <strong>Impact:</strong> {(mission.comparison.baseline.netCo2T - mission.comparison.proposed.netCo2T).toFixed(0)} t CO₂/yr reduction
                </p>
              </div>
            )}
          </div>
        )}

        {mission.step === 'compare' && mission.comparison.actionPlan && (
          <div className="mission-step compare">
            <h4>Action Plan Generated</h4>
            <p className="text-sm text-gray-500 mb-4">
              Your climate action plan is ready. All calculations are modelled; no measured outcomes or external integrations are claimed.
            </p>
            <div className="action-plan-summary">
              <div className="metric">
                <span className="label">Interventions selected:</span>
                <span className="value">{mission.selected.length}</span>
              </div>
              <div className="metric">
                <span className="label">Plan entries:</span>
                <span className="value">{mission.comparison.actionPlan.interventions.length}</span>
              </div>
              <div className="metric">
                <span className="label">Projected validation status:</span>
                <span className="value">All impacts are modelled/projected</span>
              </div>
            </div>
            <button onClick={downloadPlan} className="download-btn">
              <Download size={16} />
              Download Action Plan (JSON)
            </button>
          </div>
        )}
      </div>

      <div className="mission-nav">
        {mission.step !== 'compare' && (
          <>
            {mission.step === 'select' ? (
              <button onClick={doApply} className="nav-btn next">
                Apply to Scenario <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={nextStep} className="nav-btn next">
                Next <ChevronRight size={16} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
