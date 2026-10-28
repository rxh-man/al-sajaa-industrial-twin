/**
 * FreightOptimiser: interactive green freight route comparison.
 * Shows baseline distance/CO₂ vs. emissions-optimised routing on the existing road graph.
 */
import { useState } from 'react';
import { AD } from '../../data/abudhabi';
import { buildClassGraph, compareRoutes } from '../../data/freightOptimise';

const graph = buildClassGraph(AD.roads);

export function FreightOptimiser() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [result, setResult] = useState<ReturnType<typeof compareRoutes> | null>(null);
  const [error, setError] = useState('');

  const handleCompare = () => {
    setError('');
    if (!from || !to) {
      setError('Please enter both start and end points');
      return;
    }
    const [fx, fz] = from.split(',').map((v) => parseFloat(v.trim()));
    const [tx, tz] = to.split(',').map((v) => parseFloat(v.trim()));
    if (isNaN(fx) || isNaN(fz) || isNaN(tx) || isNaN(tz)) {
      setError('Invalid coordinates (format: x,z)');
      return;
    }
    const comp = compareRoutes(graph, [fx, fz], [tx, tz]);
    setResult(comp);
  };

  return (
    <div className="freight-optimiser">
      <h3>Green Freight Optimisation</h3>
      <p className="text-sm text-gray-500">
        Compare distance-minimising routes with emissions-optimised routes that favour freight-grade roads.
      </p>

      <div className="freight-controls">
        <div className="coord-input">
          <label>Start (x, z):</label>
          <input type="text" placeholder="e.g., 100,200" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="coord-input">
          <label>End (x, z):</label>
          <input type="text" placeholder="e.g., 500,300" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={handleCompare} className="freight-compare-btn">
          Compare Routes
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {result && (
        <div className="freight-result">
          {!result.feasible ? (
            <div className="infeasible">
              <p className="text-red-600">No route found ({result.note})</p>
            </div>
          ) : (
            <>
              <div className="route-comparison">
                <div className="route-card baseline">
                  <h4>Baseline (Distance-Minimised)</h4>
                  <p className="metric">
                    <span className="label">Distance:</span>
                    <span className="value">{result.baseline?.lengthKm.toFixed(2)} km</span>
                  </p>
                  <p className="metric">
                    <span className="label">Modelled CO₂:</span>
                    <span className="value">{result.baseline?.co2Kg.toFixed(1)} kg</span>
                  </p>
                  {result.baseline?.classes && (
                    <p className="metric">
                      <span className="label">Road classes:</span>
                      <span className="value">{result.baseline.classes.join(', ')}</span>
                    </p>
                  )}
                </div>
                <div className="route-card optimised">
                  <h4>Optimised (Emissions-Minimised)</h4>
                  <p className="metric">
                    <span className="label">Distance:</span>
                    <span className="value">{result.optimised?.lengthKm.toFixed(2)} km</span>
                  </p>
                  <p className="metric">
                    <span className="label">Modelled CO₂:</span>
                    <span className="value">{result.optimised?.co2Kg.toFixed(1)} kg</span>
                  </p>
                  {result.optimised?.classes && (
                    <p className="metric">
                      <span className="label">Road classes:</span>
                      <span className="value">{result.optimised.classes.join(', ')}</span>
                    </p>
                  )}
                </div>
              </div>

              {result.savings && (
                <div className="savings-summary">
                  <h4>Savings</h4>
                  <p className="metric">
                    <span className="label">Distance:</span>
                    <span className="value">
                      {result.savings.distanceUnits.toFixed(0)} units ({result.savings.distancePct.toFixed(1)}%)
                    </span>
                  </p>
                  <p className="metric">
                    <span className="label">CO₂:</span>
                    <span className="value">
                      {result.savings.co2Kg.toFixed(1)} kg ({result.savings.co2Pct.toFixed(1)}%)
                    </span>
                  </p>
                </div>
              )}

              <div className="note">{result.note}</div>
            </>
          )}

          <details className="assumptions-details">
            <summary>Assumptions & Model</summary>
            <ul className="assumptions-list">
              {result.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
              <li>Evaluated {result.evaluatedNodes} graph nodes (evidence of genuine route search).</li>
              <li>Road class emission factors are illustrative, not measured from field data.</li>
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
