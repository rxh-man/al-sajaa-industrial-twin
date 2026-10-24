import { ASSUMPTIONS, BASELINE, DEMAND_MWH, HEAT_EXPOSED_FACTORIES, TOP_FACTORIES, WAREHOUSE_ROOFS, run, type Scenario } from './climateAgents';
import { FACTORY_CO2_T } from './airClimate';

/**
 * Local demo agents. Deterministic: each answer is computed from the same model the panel shows.
 * No AI service is connected. Answers state their evidence and limits.
 */

export type AgentId = 'pollution' | 'green' | 'renewable' | 'resilience' | 'transport' | 'strategy';

export const AGENTS: Record<AgentId, string> = {
  pollution: 'Pollution Source Agent',
  green: 'Green Infrastructure Agent',
  renewable: 'Renewable Energy Agent',
  resilience: 'Climate Resilience Agent',
  transport: 'Transport Optimization Agent',
  strategy: 'Sustainability Strategy Agent',
};

export interface Answer {
  agent: string;
  question: string;
  points: string[];
  evidence: string[];
  limits: string[];
}

const n = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

export const PROMPTS: { id: string; agent: AgentId; text: string }[] = [
  { id: 'co2', agent: 'pollution', text: 'Which factories contribute most to the modeled CO2 inventory?' },
  { id: 'roofs', agent: 'renewable', text: 'Which rooftops are suitable for solar installations?' },
  { id: 'green', agent: 'green', text: 'Where could additional greenery provide the greatest potential benefit?' },
  { id: 'grid', agent: 'renewable', text: 'What happens to estimated grid electricity demand if solar capacity increases?' },
  { id: 'transport', agent: 'transport', text: 'Which interventions could reduce modeled transport emissions?' },
  { id: 'combo', agent: 'strategy', text: 'Compare the baseline with a scenario combining rooftop solar, energy efficiency, and optimized logistics.' },
  { id: 'evidence', agent: 'strategy', text: 'Which recommendations have the strongest evidence, and which depend on uncertain assumptions?' },
  { id: 'heat', agent: 'resilience', text: 'Identify the most heat-exposed areas and recommend interventions, explaining the evidence and assumptions behind each recommendation.' },
];

export function answer(id: string, sc: Scenario): Answer {
  const base = run(BASELINE);
  const cur = run(sc);
  switch (id) {
    case 'co2':
      return {
        agent: AGENTS.pollution,
        question: PROMPTS[0].text,
        points: [
          `Top modelled CO2 sources: ${TOP_FACTORIES.slice(0, 3).map((f) => `factory ${f.id} (${n(f.co2T)} t per year)`).join(', ')}.`,
          `Together, the top six are about ${n((TOP_FACTORIES.reduce((a, f) => a + f.co2T, 0) / FACTORY_CO2_T) * 100, 1)}% of the modelled factory CO2.`,
          `Dominant pollutant types vary by factory; hover or click a factory to see its levels and the options to reduce it.`,
        ],
        evidence: ['Factory count and positions: scene layout (computed).', 'CO2 per factory: simulated level assignment, not an emissions register.'],
        limits: ['Particulate and other pollutants are levels only, not mass. CO2 is not a measure of local air quality.'],
      };
    case 'roofs': {
      const top = WAREHOUSE_ROOFS.slice(0, 3);
      return {
        agent: AGENTS.renewable,
        question: PROMPTS[1].text,
        points: [
          `Largest warehouse roofs: ${top.map((r) => `${r.name} (${n(r.m2)} m²)`).join(', ')}.`,
          `Usable share is set at ${n(ASSUMPTIONS.roofUsableShare.v * 100)}%, so roughly ${n(top.reduce((a, r) => a + r.m2, 0) * ASSUMPTIONS.roofUsableShare.v)} m² across these three.`,
          `At ${n(sc.solarCoverage * 100)}% coverage, the district generates about ${n(cur.solarMWh)} MWh per year.`,
        ],
        evidence: ['Roof areas: footprint from the scene layout (computed).', 'Yield and panel output: assumptions.'],
        limits: ['No roof structure, orientation or shading survey. Check load and access before installing.'],
      };
    }
    case 'green':
      return {
        agent: AGENTS.green,
        question: PROMPTS[2].text,
        points: [
          `Heat is highest near: ${HEAT_EXPOSED_FACTORIES.slice(0, 3).map((x) => `factory ${x.f.id}`).join(', ')} (relative heat under the current field).`,
          `Each 100 extra trees would add about ${n((100 * 118) / 1000)} t O2 and ${n((100 * 22) / 1000, 1)} t CO2 uptake per year (assumptions).`,
          `Current scenario adds ${n(sc.extraTrees)} trees; heat index moves from ${n(base.heatIndex, 1)} to ${n(cur.heatIndex, 1)} (relative).`,
        ],
        evidence: ['Heat field: simulated from road class, factories and trees.', 'Tree rates: assumptions for mature shade trees.'],
        limits: ['Trees need irrigation, space and maintenance. Survival and growth are not modelled. Uptake is small beside factory CO2.'],
      };
    case 'grid': {
      const full = run({ ...sc, solarCoverage: 1 });
      return {
        agent: AGENTS.renewable,
        question: PROMPTS[3].text,
        points: [
          `Modelled electricity demand is about ${n(DEMAND_MWH)} MWh per year (assumption).`,
          `At 100% coverage, grid imports fall to about ${n(Math.max(0, full.gridImportMWh))} MWh per year, from ${n(base.gridImportMWh)} MWh at no solar.`,
          `Beyond the point where generation exceeds demand, extra solar is exported, not used on site.`,
        ],
        evidence: ['Demand and solar: assumptions on a typical day repeated across the year.'],
        limits: ['A flat demand profile and a typical day are simplifications. Real load and export rules will differ.'],
      };
    }
    case 'transport':
      return {
        agent: AGENTS.transport,
        question: PROMPTS[4].text,
        points: [
          `Truck CO2 in the baseline is about ${n(base.truckCo2T)} t per year (assumption).`,
          `Optimised routing and less idling cut it by about ${n((1 - (1 - ASSUMPTIONS.routingCut.v) * (1 - ASSUMPTIONS.idlingCut.v)) * 100)}% of km and fuel (illustrative).`,
          `Electric share removes tailpipe CO2 in proportion; the current electric share is ${n(sc.evShare * 100)}%.`,
        ],
        evidence: ['Major roads: scene layout (computed). Movements and trip length: assumptions.'],
        limits: ['No live traffic counts or GPS. Routing and idling effects are illustrative, not measured.'],
      };
    case 'combo': {
      const combo = run({ ...BASELINE, solarCoverage: 0.5, optimisedRouting: true, battery: true });
      return {
        agent: AGENTS.strategy,
        question: PROMPTS[5].text,
        points: [
          `Net CO2: baseline ${n(base.netCo2T)} t per year; combined scenario ${n(combo.netCo2T)} t per year.`,
          `Solar at 50% and routing changes are included. Energy efficiency has no parameter in this model, so it is not counted.`,
          `Grid imports: ${n(base.gridImportMWh)} MWh baseline, ${n(combo.gridImportMWh)} MWh combined.`,
        ],
        evidence: ['Factory CO2 is the largest term and does not change in this scenario.'],
        limits: ['The combined effect is small against modelled factory CO2. Energy efficiency needs its own data before it can be counted.'],
      };
    }
    case 'heat':
      return {
        agent: AGENTS.resilience,
        question: PROMPTS[7].text,
        points: [
          `Most heat-exposed factories (relative): ${HEAT_EXPOSED_FACTORIES.map((x) => `factory ${x.f.id} (${n(x.h, 2)})`).join(', ')}.`,
          `Heat index now ${n(cur.heatIndex, 1)} vs ${n(base.heatIndex, 1)} baseline (relative). Hot-weather intensity: ${n(sc.hotWeather * 100)}%.`,
          `Interventions: shade and trees near the hottest factories, reflective roofs on warehouses, and site layout that keeps stacks upwind of yards.`,
        ],
        evidence: ['Heat field: simulated relative index from roads, factories and trees.', 'Intervention effects: illustrative relative cuts.'],
        limits: ['No surface temperature, weather or material data. The index is for ranking, not for measuring degrees.'],
      };
    case 'evidence':
      return {
        agent: AGENTS.strategy,
        question: PROMPTS[6].text,
        points: [
          'Strongest evidence: the layout facts (factory count, roof areas, road lengths) because they come from the scene.',
          'Moderate: solar yield and demand, which depend on a typical day and a yield assumption.',
          'Weakest: pollutant levels, the grid factor, heat effects and truck emissions. These are simulated or illustrative.',
        ],
        evidence: ['Each figure in the panel carries a basis tag.'],
        limits: ['Get metered electricity, emissions and traffic data before taking any figure to a decision.'],
      };
    default:
      return { agent: 'Climate agents', question: id, points: ['Choose a suggested prompt.'], evidence: [], limits: [] };
  }
}
