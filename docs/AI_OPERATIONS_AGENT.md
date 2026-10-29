# Al Sajaa AI Operations Agent

An additive module on top of the existing twin: header button **AI Agent** opens the panel. Code lives in
`src/opsAgent/` (agent) and `src/solutions/` (scenario models used as its tools). Tests: `tests/opsAgent.test.ts`.

## What it is — and is not
- A deterministic agent loop over the twin's **simulated** data. **No language model is connected**: goals are
  read with keyword and number rules (`goal.ts`), and everything it says is built from tool results.
- Not connected to any real network, sensor feed or control system. Not production-ready.

## Loop (`runtime.ts`)
1. Understand the goal → workflow, inputs, targets/constraints (anything not understood is listed).
2. Inspect assets and simulated sensors (`inspect_assets`, `read_simulated_sensors`).
3. Run the scenario model (`run_scenario`, inputs validated against declared ranges).
4. Evaluate candidates against the goal (`compare_interventions`).
5. Explain from the results (weights and scores shown).
6. **Stop for human approval** — only the *operator* role can approve; other roles are blocked and logged.
7. Execute the simulated action (`execute_simulated_action`), update the 3D overlay.
8. Verify by an independent re-run (`verify_outcome`), report remaining risks.

## Workflows
| Workflow | Status | Model |
|---|---|---|
| Water Incident | implemented | `solutions/scenarios/waterLeak.ts` — network graph isolation, crew route on the road graph, orifice-law pressure reduction |
| Traffic Optimisation | implemented | `solutions/scenarios/traffic.ts` — BPR delay on a routed corridor vs a routed diversion, retiming, optimised split |
| Climate Action | implemented | `solutions/scenarios/climate.ts` — rooftop PV with hourly battery dispatch, street trees and reflective roofs on the relative heat grid, irrigation trade-off |
| Energy Resilience, Emergency Response, Infrastructure Maintenance, Freight Optimisation | **not implemented** | the agent recognises them and says so |

Every KPI carries its basis (Simulated / Estimated / Assumption) and each scenario lists assumptions, limitations
and the metrics it cannot estimate (e.g. AED costs, °C, measured travel times).
