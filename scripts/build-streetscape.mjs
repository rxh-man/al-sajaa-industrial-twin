// Lays out the streetscape (src/data/streetscape.ts) and writes src/data/alsajaa-streetscape.json.
// Run after changing the world corrections, the lamps or the streetscape rules: node scripts/build-streetscape.mjs
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
const { buildStreetscape } = await server.ssrLoadModule('/src/data/streetscape.ts');
const s = buildStreetscape();
await server.close();
const r3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
const round = (o) => (Array.isArray(o) ? o.map(round) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)])) : r3(o));
writeFileSync(new URL('../src/data/alsajaa-streetscape.json', import.meta.url), JSON.stringify(round(s)) + '\n');
console.log(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.length])));
