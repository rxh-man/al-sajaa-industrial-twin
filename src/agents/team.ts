import type { OrbState } from 'thinking-orbs';

/** The six Al Sajaa Twin agents. Each owns one job and hands off to the next. */
export type AgentId = 'watch' | 'diagnose' | 'plan' | 'patch' | 'dispatch' | 'verify';

export interface AgentDef {
  id: AgentId;
  name: string;
  job: string;
  orb: OrbState;
}

export const AGENTS: AgentDef[] = [
  { id: 'watch', name: 'Watch', job: 'Keeps an eye on every sensor', orb: 'listening' },
  { id: 'diagnose', name: 'Diagnose', job: 'Finds the cause and how long we have', orb: 'searching' },
  { id: 'plan', name: 'Plan', job: 'Compares fixes and picks the best one', orb: 'solving' },
  { id: 'patch', name: 'Patch', job: 'Makes remote fixes: valves and water flow', orb: 'connecting' },
  { id: 'dispatch', name: 'Dispatch', job: 'Sends the right crew and parts', orb: 'working' },
  { id: 'verify', name: 'Verify', job: 'Checks the fix and saves the lesson', orb: 'breathing' },
];

export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentDef>;
