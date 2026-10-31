import { CLIMATE } from './scenarios/climate';
import { TRAFFIC } from './scenarios/traffic';
import { WATER_LEAK } from './scenarios/waterLeak';
import { ENERGY } from './scenarios/energy';
import { EMERGENCY } from './scenarios/emergency';
import { MAINTENANCE } from './scenarios/maintenance';
import { FREIGHT } from './scenarios/freight';
import { PLANNING } from './scenarios/planning';
import { AIR, FLOOD, SUSTAINABILITY } from './scenarios/environment';
import type { ScenarioDef } from './types';

/** every scenario model, in display order (water, traffic and climate first) */
export const SCENARIOS: ScenarioDef[] = [WATER_LEAK, TRAFFIC, CLIMATE, ENERGY, EMERGENCY, MAINTENANCE, FREIGHT, PLANNING, AIR, FLOOD, SUSTAINABILITY];

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id);
