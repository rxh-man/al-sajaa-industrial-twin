/**
 * PARKNEX parking discovery (src/parknex/model.ts findSpaces): free bays only, healthy sensors only,
 * nearest facility entrance first, category filter and limit. All data is simulated.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let M: any;

before(async () => {
  server = await createServer({ root: new URL('..', import.meta.url).pathname, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  M = await server.ssrLoadModule('/src/parknex/model.ts');
});
after(async () => { await server.close(); });

test('discovery returns only available bays with a healthy sensor', () => {
  const rows = M.findSpaces('any', 50);
  assert.ok(rows.length > 0, 'expected free bays in the default state');
  for (const r of rows) {
    assert.equal(r.bay.sensor, 'ok', `${r.bay.id} has a faulty or offline sensor`);
    assert.equal(M.bayStatus(r.bay, r.facility, M.BASE_OPS), 'available', `${r.bay.id} is not free`);
  }
});

test('discovery is ordered nearest first and respects the limit', () => {
  const rows = M.findSpaces('any', 8);
  assert.ok(rows.length <= 8);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].dist >= rows[i - 1].dist, 'not sorted by distance');
});

test('category filter only returns bays of that category', () => {
  for (const c of ['visitor', 'ev', 'accessible']) {
    const rows = M.findSpaces(c, 20);
    for (const r of rows) assert.equal(r.bay.category, c);
  }
});

test('a bay that is occupied in the operations state is never offered', () => {
  const all = M.findSpaces('any', 1000);
  const ids = new Set(all.map((r: { bay: { id: string } }) => r.bay.id));
  // every bay the model reports as non-available must be absent from discovery
  for (const f of M.FACILITIES) for (const b of f.bays) {
    if (M.bayStatus(b, f, M.BASE_OPS) !== 'available') assert.ok(!ids.has(b.id), `${b.id} offered while ${M.bayStatus(b, f, M.BASE_OPS)}`);
  }
});
