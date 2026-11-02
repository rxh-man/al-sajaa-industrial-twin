import { scenarioById } from '../solutions/registry';
import { TOOLS } from './tools';

/**
 * The specialist agents. Each is a capability of the one orchestrating agent (same loop, same tools, same approval
 * gate), with its own responsibility, scenario models, inputs, outputs and dependencies. The six twin agents of
 * the incident demo (Watch … Verify) are mapped onto the steps of the same loop.
 */

export interface Specialist {
  id: string;
  name: string;
  nameAr: string;
  responsibility: string;
  scenarios: string[];
  /** other specialists whose outputs it uses */
  dependsOn: string[];
  /** a goal that exercises it (runs through the real loop) */
  demoGoal: string;
}

export const SPECIALISTS: Specialist[] = [
  { id: 'water', name: 'Water Security Agent', nameAr: 'وكيل أمن المياه', responsibility: 'Detects simulated leaks, evaluates isolation options, estimates water lost and residents affected, routes the repair crew.', scenarios: ['water-leak'], dependsOn: ['maintenance'], demoGoal: 'Leak of 30 L/s on the water main. Reduce water lost by 80% and keep residents supplied.' },
  { id: 'traffic', name: 'Traffic Intelligence Agent', nameAr: 'وكيل ذكاء المرور', responsibility: 'Finds bottlenecks, evaluates signal retiming and diversions, and the extra distance diversions add.', scenarios: ['traffic'], dependsOn: [], demoGoal: 'Congestion on Al Sajaa Road 10, one lane closed, 4500 veh/h. Reduce vehicle-hours delay by 5%.' },
  { id: 'energy', name: 'Energy Optimisation Agent', nameAr: 'وكيل تحسين الطاقة', responsibility: 'Analyses solar and battery dispatch, and restores supply after feeder faults while protecting critical sites.', scenarios: ['climate', 'energy'], dependsOn: ['maintenance'], demoGoal: 'Cable fault causes an outage, repair takes 10 hours. Protect the critical sites.' },
  { id: 'environment', name: 'Environmental Risk Agent', nameAr: 'وكيل المخاطر البيئية', responsibility: 'Evaluates air pollution at sensitive sites under the current wind, and hypothetical storms against drainage capacity.', scenarios: ['air', 'flood'], dependsOn: ['sustainability'], demoGoal: 'Air pollution at schools and labour camps with wind from 270. Reduce exposure by 40%.' },
  { id: 'planning', name: 'Urban Planning Agent', nameAr: 'وكيل التخطيط العمراني', responsibility: 'Sites proposed facilities on vacant land and estimates their grid, water, traffic, parking and emissions impact.', scenarios: ['planning'], dependsOn: ['sustainability', 'traffic'], demoGoal: '15 new metal fabrication factories proposed in the Northern Mixed District. Reduce the added CO2 by 40%.' },
  { id: 'emergency', name: 'Emergency Coordination Agent', nameAr: 'وكيل تنسيق الطوارئ', responsibility: 'Routes responders around closures from assumed bases and lists cascading utility risks near the incident (no official integration).', scenarios: ['emergency'], dependsOn: ['water', 'energy'], demoGoal: 'Chemical spill at a factory, Al Sajaa Road 1 is closed. Respond within 6 min.' },
  { id: 'maintenance', name: 'Predictive Maintenance Agent', nameAr: 'وكيل الصيانة التنبؤية', responsibility: 'Ranks pipes and cables by failure probability and consequence and spends the crew budget where it removes most risk.', scenarios: ['maintenance'], dependsOn: [], demoGoal: 'Prioritise repairs with a budget of 1200 crew-hours.' },
  { id: 'freight', name: 'Freight Agent', nameAr: 'وكيل الشحن', responsibility: 'Orders delivery rounds from the depot to the busiest warehouses and compares one truck with two.', scenarios: ['freight'], dependsOn: ['traffic'], demoGoal: 'Optimise the truck delivery rounds to 8 sites and reduce CO2 by 20%.' },
  { id: 'parking', name: 'Parking Intelligence Agent', nameAr: 'وكيل ذكاء المواقف', responsibility: 'Reads PARKNEX occupancy, revenue, tenant allocation and demand; compares tariff and allocation strategies; changes only after operator approval.', scenarios: ['parking'], dependsOn: ['traffic'], demoGoal: 'PARKNEX Central parking is full at peak. Test a 20% more tariff and reduce drivers turned away by 30%.' },
  { id: 'sustainability', name: 'Sustainability Intelligence Agent', nameAr: 'وكيل ذكاء الاستدامة', responsibility: 'Compares city-wide programmes (solar, abatement, electrification, greening) on the Command Centre model.', scenarios: ['sustainability', 'climate'], dependsOn: ['energy'], demoGoal: 'City-wide strategy: reduce carbon emissions by 2% and cut dust.' },
];

/** the twin's six incident agents, and the loop step each corresponds to */
export const TWIN_AGENTS = [
  { name: 'Watch', step: 'inspect', does: 'reads the (simulated) sensors and flags anomalies' },
  { name: 'Diagnose', step: 'tools', does: 'runs the models that locate and explain the problem' },
  { name: 'Plan', step: 'evaluate', does: 'builds and scores the candidate interventions' },
  { name: 'Patch', step: 'execute', does: 'applies the approved intervention to the simulated twin' },
  { name: 'Dispatch', step: 'execute', does: 'routes crews and vehicles for the chosen plan' },
  { name: 'Verify', step: 'verify', does: 're-runs the model and reports what changed and what risk remains' },
];

/** a specialist's inputs and outputs, read from its scenario models (so the card never drifts from the code) */
export function specialistIO(s: Specialist) {
  const defs = s.scenarios.map((id) => scenarioById(id)).filter(Boolean);
  return {
    inputs: defs.flatMap((d) => d!.inputs.map((i) => i.label)),
    outputs: defs.flatMap((d) => {
      try {
        return d!.run(d!.defaults).kpis.map((k) => `${k.label} (${k.unit})`);
      } catch {
        return [];
      }
    }),
    tools: TOOLS.map((t) => t.contract.name),
  };
}
