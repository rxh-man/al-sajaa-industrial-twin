// Screenshots of the live twin for the landing page (public/landing/*.jpg).
// Needs the dev server running (npm run dev) and Chrome installed:
//   node scripts/capture-landing.mjs [http://localhost:5173] [name,name,…]
// Drives the app through its dev hooks (window.__dev, window.__mapIntroAt) so every shot is reproducible.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// playwright-core is not a dependency of the app: point PLAYWRIGHT_CORE at any installed copy (a path or file URL)
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core').catch(() => {
  console.error('playwright-core not found: npm i -D playwright-core, or set PLAYWRIGHT_CORE to an installed copy');
  process.exit(1);
});

const [base = 'http://localhost:5173', only] = process.argv.slice(2);
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'landing');
mkdirSync(OUT, { recursive: true });
const S = 'window.__dev.store.getState()';

/** name → viewport and what to do once the twin is ready */
const SHOTS = {
  twin: { w: 1600, h: 1000, js: [`window.__dev.shot('city', 3)`], step: 1 },
  xray: { w: 1600, h: 900, js: [`window.__dev.shot('city', 3)`, `${S}.toggleXray()`], step: 2.5 },
  drive: { w: 1600, h: 900, js: [`${S}.run()`, `${S}.seek(44.5)`], step: 3 },
  approval: { w: 1600, h: 900, js: [`${S}.setSpendLimit(400000)`, `${S}.run()`, `${S}.seek(40)`], step: 2.5 },
  district: { w: 1600, h: 900, map: 5300 },
};

const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

for (const [name, shot] of Object.entries(SHOTS)) {
  if (only && !only.split(',').includes(name)) continue;
  const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(`[${name}] ${e.message}`));
  await page.goto(`${base}/#twin`);
  if (shot.map !== undefined) {
    // the opening map, frozen at one moment (the loader card hidden)
    await page.waitForFunction(() => typeof window.__mapIntroAt === 'function', null, { timeout: 120000 });
    await page.addStyleTag({ content: '.loader-card{display:none!important}' });
    await page.evaluate(`window.__mapIntroAt(${shot.map}); 0`);
    await page.waitForTimeout(600);
  } else {
    await page.waitForFunction(() => typeof window.__dev === 'object' && window.__dev.store?.getState().sceneReady, null, { timeout: 120000 });
    // let the boot run its course, skipping the map zoom and the title with key presses
    for (let i = 0; i < 80; i++) {
      if (await page.evaluate(`${S}.boot === 'ready'`)) break;
      await page.keyboard.press('Shift');
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1200);
    for (const js of shot.js) await page.evaluate(`${js}; 0`);
    // advance in short chunks (one long step can leave the camera where it was)
    for (let left = shot.step; left > 1e-6; left -= 0.5) await page.evaluate(`window.__dev.step(${Math.min(0.5, left)}, 30); 0`);
    await page.evaluate('window.__dev.step(1/60, 60); 0');
    await page.waitForTimeout(500);
  }
  const file = path.join(OUT, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
  console.log('saved', path.relative(process.cwd(), file));
  await page.close();
}
await browser.close();
