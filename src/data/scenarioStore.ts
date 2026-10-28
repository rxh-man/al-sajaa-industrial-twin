/**
 * Saved climate scenarios: pure save / duplicate / rename / delete / restore operations
 * over a list, plus localStorage persistence. Each saved scenario carries a projected
 * Impact Ledger entry. Saved scenarios are a record of inputs and the model's PROJECTED
 * outcome; they are never measured or verified (the ledger entry says so).
 *
 * The operations are pure (they return a new list), so they are unit-testable without the
 * store or a browser. The store wires them to React and to persistence.
 */
import { BASELINE, type Scenario } from './climateAgents';
import { ledgerEntry, scenarioId, type LedgerEntry } from './actionPlan';

export interface SavedScenario {
  /** unique within the list */
  id: string;
  name: string;
  /** full scenario, including excluded roofs, so restore reproduces the exact state */
  scenario: Scenario;
  /** ISO timestamp of when it was saved */
  createdAt: string;
  /** projected impact at save time; validation is always 'projected' */
  ledger: LedgerEntry;
}

export const SCENARIO_STORE_KEY = 'alsajaa.scenarios.v1';

let counter = 0;
/** Unique id for a new saved scenario. Monotonic within a session; collision-checked against the list. */
function newId(list: SavedScenario[], seed: string): string {
  let id = '';
  do {
    counter += 1;
    id = `${seed}-${counter.toString(36)}`;
  } while (list.some((s) => s.id === id));
  return id;
}

/** Make a SavedScenario record from a scenario, name and timestamp. */
export function makeSaved(list: SavedScenario[], name: string, scenario: Scenario, timestamp: string): SavedScenario {
  const scen = { ...scenario, excludedRoofs: [...(scenario.excludedRoofs ?? [])] };
  return {
    id: newId(list, scenarioId(scen).slice(0, 24) || 'sc'),
    name: name.trim() || 'Untitled scenario',
    scenario: scen,
    createdAt: timestamp,
    ledger: ledgerEntry(scen, timestamp),
  };
}

export function saveScenario(list: SavedScenario[], name: string, scenario: Scenario, timestamp: string): { list: SavedScenario[]; id: string } {
  const entry = makeSaved(list, name, scenario, timestamp);
  return { list: [entry, ...list], id: entry.id };
}

export function duplicateScenario(list: SavedScenario[], id: string, timestamp: string): { list: SavedScenario[]; id: string | null } {
  const src = list.find((s) => s.id === id);
  if (!src) return { list, id: null };
  const copy = makeSaved(list, `${src.name} (copy)`, src.scenario, timestamp);
  const i = list.findIndex((s) => s.id === id);
  const next = [...list];
  next.splice(i + 1, 0, copy);
  return { list: next, id: copy.id };
}

export function renameScenario(list: SavedScenario[], id: string, name: string): SavedScenario[] {
  const clean = name.trim();
  if (!clean) return list;
  return list.map((s) => (s.id === id ? { ...s, name: clean } : s));
}

export function deleteScenario(list: SavedScenario[], id: string): SavedScenario[] {
  return list.filter((s) => s.id !== id);
}

export function getSaved(list: SavedScenario[], id: string): SavedScenario | undefined {
  return list.find((s) => s.id === id);
}

/** Load the saved list from localStorage. Returns [] in Node, in private mode, or on any error. */
export function loadSavedScenarios(): SavedScenario[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(SCENARIO_STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedScenario[]) : [];
  } catch {
    return [];
  }
}

/** Persist the saved list to localStorage. No-op in Node or on error. */
export function persistSavedScenarios(list: SavedScenario[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SCENARIO_STORE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable or full: saved scenarios stay in memory for this session */
  }
}

/** The editable scenario merged with the current excluded roofs. */
export function effectiveScenario(scenario: Scenario, excludedRoofs: string[]): Scenario {
  return { ...scenario, excludedRoofs };
}

export { BASELINE };
