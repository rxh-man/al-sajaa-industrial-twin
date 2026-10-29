import { CLIMATE } from './scenarios/climate';
import { TRAFFIC } from './scenarios/traffic';
import { WATER_LEAK } from './scenarios/waterLeak';
import type { ScenarioDef } from './types';

/** every scenario model, in display order (water, traffic and climate first) */
export const SCENARIOS: ScenarioDef[] = [WATER_LEAK, TRAFFIC, CLIMATE];

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id);
