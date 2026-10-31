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

## Workflows (all implemented and tested end to end)
| Workflow (specialist) | Model |
|---|---|
| Water Incident (Water Security Agent) | `solutions/scenarios/waterLeak.ts` — network isolation, crew route on the road graph, orifice-law pressure reduction |
| Traffic Optimisation (Traffic Intelligence Agent) | `traffic.ts` — BPR delay on a routed corridor vs a routed diversion, retiming, optimised split |
| Climate Action (Energy Optimisation / Sustainability) | `climate.ts` — rooftop PV with hourly battery dispatch, trees and reflective roofs on the relative heat grid, irrigation trade-off |
| Energy Resilience (Energy Optimisation Agent) | `energy.ts` — feeder fault traced on the cable network (each network piece fed from its nearest substation), tie-switch back-feed, generators, battery microgrid for critical sites |
| Emergency Response (Emergency Coordination Agent) | `emergency.ts` — routes from assumed bases with a known/unknown closure, cascading utility risk in the hazard radius; no official integration |
| Infrastructure Maintenance (Predictive Maintenance Agent) | `maintenance.ts` — failure probability × consequence across water, electricity and cooling; crew budget spent by four strategies; synthetic seeded anomalies |
| Freight Optimisation (Freight Agent) | `freight.ts` — road-graph distance matrix; list order vs nearest-neighbour vs 2-opt vs two trucks |
| Urban Planning (Urban Planning Agent) | `planning.ts` — the Command Centre's development model: as proposed, with mitigation, relocated |
| Air Quality / Flood (Environmental Risk Agent) | `environment.ts` — plume model at sensitive receptors under a chosen wind; hypothetical storm vs drainage per district |
| Sustainability Strategy (Sustainability Intelligence Agent) | `environment.ts` — city-wide programmes on the Command Centre model |

Optional language model: `server/agentGoal.ts` (POST `/api/agent-goal`, server-side key `AGENT_LLM_*` or `DASHSCOPE_*`)
proposes a structured reading of the goal; `src/opsAgent/llm.ts` validates every field against the scenario models
and falls back to the rules when the endpoint is offline. No key is configured in this repository, so by default
the rules read the goal and the panel says so.

Every KPI carries its basis (Simulated / Estimated / Assumption) and each scenario lists assumptions, limitations
and the metrics it cannot estimate (e.g. AED costs, °C, measured travel times).
