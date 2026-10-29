import data from './alsajaa-streetscape.json';
import type { Streetscape } from './streetscape';

/**
 * The laid-out streetscape (parked cars, lots, driveways, loading bays, bus stops, crossings, benches, bins,
 * trees). Precomputed by scripts/build-streetscape.mjs from src/data/streetscape.ts so the page does not
 * spend seconds placing it at load; tests/world.test.ts fails when it is stale.
 */
export const STREETSCAPE = data as unknown as Streetscape;
