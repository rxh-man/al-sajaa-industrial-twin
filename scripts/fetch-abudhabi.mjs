// Downloads the downtown Abu Dhabi extract from OpenStreetMap (Overpass API).
// Map data © OpenStreetMap contributors, available under the ODbL.
//   node scripts/fetch-abudhabi.mjs <out.json>
// Small queries run one after another with retries so the public server isn't hammered.
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'abudhabi-osm.json';
const BOX = '24.4760,54.3450,24.4980,54.3690';
const COAST_BOX = '24.4650,54.3300,24.5100,54.3850';
const queries = [
  ['coastline', `way["natural"="coastline"](${COAST_BOX});`],
  ['roads', `way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)$"](${BOX});`],
  ['green', `(way["leisure"~"^(park|garden)$"](${BOX});way["landuse"="grass"](${BOX}););`],
  ['buildings-w', `way["building"](24.4760,54.3450,24.4980,54.3570);`],
  ['buildings-e', `way["building"](24.4760,54.3570,24.4980,54.3690);`],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const all = new Map();
for (const [name, q] of queries) {
  let ok = false;
  for (let attempt = 1; attempt <= 6 && !ok; attempt++) {
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Al Sajaa Twin-hackathon-demo/1.0 (one-off map extract)' },
        body: 'data=' + encodeURIComponent(`[out:json][timeout:90];${q}out geom;`),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await res.text();
      if (!res.ok || text.startsWith('<')) throw new Error(`HTTP ${res.status}`);
      const j = JSON.parse(text);
      for (const e of j.elements) all.set(`${e.type}/${e.id}`, e);
      console.log(`${name}: ${j.elements.length} elements`);
      ok = true;
    } catch (err) {
      console.log(`${name}: attempt ${attempt} failed (${err.message}); waiting`);
      await sleep(8000 * attempt);
    }
  }
  if (!ok) process.exit(1);
  await sleep(3000);
}
writeFileSync(OUT, JSON.stringify({ source: 'OpenStreetMap via Overpass API', license: 'ODbL — © OpenStreetMap contributors', fetched: new Date().toISOString(), box: BOX, elements: [...all.values()] }));
console.log('saved', all.size, 'elements to', OUT);
