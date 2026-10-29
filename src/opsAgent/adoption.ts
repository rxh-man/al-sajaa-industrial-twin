/**
 * Adoption and deployment notes for the operations agent. Plain statements of intent and requirements: no
 * customers, savings or integrations are claimed.
 */
export const ADOPTION: { h: string; items: string[] }[] = [
  {
    h: 'User problem',
    items: [
      'Utility, traffic and sustainability teams in an industrial district work from separate systems; an incident on one network (a burst main under a busy road) needs decisions across several.',
      'Choosing between interventions is slow and hard to justify: the trade-offs (water lost vs customers cut off, delay vs extra distance, CO₂ vs irrigation water) are rarely laid out side by side.',
    ],
  },
  {
    h: 'Intended customers (not yet engaged)',
    items: [
      'Municipal and utility operations centres responsible for an industrial area.',
      'Industrial-zone operators and free-zone authorities planning climate measures.',
      'No customer has adopted or piloted this; these are target users only.',
    ],
  },
  {
    h: 'Workflow',
    items: [
      'An operator states a goal in plain words (or picks a guided scenario).',
      'The agent reads the goal, inspects the relevant assets and sensors, runs the scenario models, and compares interventions against the stated targets.',
      'It explains its choice from the computed results and stops. Only an operator can approve; a viewer cannot.',
      'After approval it applies the action to the simulated twin, re-runs the model independently to verify, and lists the remaining risks.',
    ],
  },
  {
    h: 'Value proposition (to be validated)',
    items: [
      'Faster, traceable decisions: every number shows its basis (simulated, estimated, assumption) and every choice shows its weights and scores.',
      'Human-in-the-loop by design: nothing consequential happens without approval, and every tool call is logged.',
      'Financial savings and environmental improvements are not claimed: they need real data and a pilot to measure.',
    ],
  },
  {
    h: 'Deployment requirements',
    items: [
      'Read access to the utility GIS (pipe network, valves), SCADA/telemetry for pressure and flow, traffic counts or probe data, and metered electricity.',
      'Calibrated models: a hydraulic network model, a traffic assignment model and a microclimate model, replacing the simplified models here.',
      'Identity and role management (SSO) for approvers; a tamper-evident audit log; integration through the operator\'s existing control systems with their own interlocks — the agent should propose, not actuate, until validated.',
      'Data protection: personal data is not needed for these workflows and should not be ingested; sensitive asset locations stay inside the operator\'s environment.',
    ],
  },
  {
    h: 'Data roadmap',
    items: [
      'Now: simulated network, sensors and incident; procedural city layout; documented assumptions.',
      'Next: replace layout and assumptions with the operator\'s GIS and historical records; back-test the models against past incidents.',
      'Then: live read-only telemetry in a shadow pilot (agent proposes, operators decide, outcomes compared).',
      'Later: other workflows (energy resilience, emergency response, maintenance, freight) once their models are validated. They are not implemented in this demo.',
    ],
  },
  {
    h: 'Safeguards in this demo',
    items: [
      'Inputs are validated against declared ranges and options; unknown inputs are rejected.',
      'Goal text is sanitised and capped at 400 characters; no external service is called.',
      'Tool failures stop the loop at the failing step and are shown, never hidden.',
      'Execution requires an operator approval; attempts by other roles are blocked and logged.',
      'Not production-ready and not connected to any live infrastructure.',
    ],
  },
];
