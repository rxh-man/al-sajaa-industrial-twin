/**
 * Code-level overrides. The baseline data (src/data/alsajaa.json) stays hash-locked and is never edited;
 * these flags change what is rendered and labelled on top of it.
 */

/** Al Sajaa is inland (Sharjah–Dhaid highway, next to Emirates Road E611). Hides the sea, the Corniche and the river-style water. */
export const ALSAJAA_INLAND = true;

/** Al Sajaa centre (per Wikipedia). Recorded here; no rendering code reads the origin, so this does not move the scene. */
export const ALSAJAA_CENTRE = { lat: 25.3306, lon: 55.6435 } as const;

/** Which demo "Play the demo" runs: the new resident guide script, or the original pipe-failure story. */
export const DEFAULT_DEMO: 'guide' | 'pipe' = 'guide';

/**
 * Which base map the scene uses. 'baseline' (default): the locked procedural Al Sajaa layout, whose simulated
 * pipes, sensors and incident are authored in its frame. 'osm': the OpenStreetMap extract in
 * src/data/alsajaa-osm.json, used only when that file exists. It is not the default because the simulation
 * data is not yet re-anchored to the OSM frame (the OSM centre is about 22 km east of the baseline origin).
 */
export const ALSAJAA_MAP_SOURCE: 'baseline' | 'osm' = 'baseline';
