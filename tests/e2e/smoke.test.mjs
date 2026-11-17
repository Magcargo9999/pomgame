// E2E smoke: load page, move (0 AP), end day, save/reload. TEST-PLAN.md A2, A4, A5, J1.
// Run: node --test tests/e2e/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { hasPage, startServer, loadPlaywright, gameNums, clickEndDay, step, playerPos, shot } from './helpers.mjs';

let pw, srv, browser;
const skip = !hasPage() ? 'index.html not found (ui-shell not merged yet)' : false;

before(async () => {
  if (skip) return;
  pw = await loadPlaywright();
  if (!pw) throw new Error('Playwright not found. Set PLAYWRIGHT_MODULE or run `npx playwright --version` once.');
  srv = await startServer();
  browser = await pw.chromium.launch();
});

after(async () => {
  await browser?.close();
  srv?.server.close();
});

async function openGame(page, errors) {
  page.on('pageerror', (e) => errors.push(String(e)));
  // Resource 404s are judged by URL below; other console errors count.
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  // The shell probes assets/sprites/* and falls back to generated sprites until the art lands.
  page.on('response', (r) => { if (r.status() >= 400 && !/\/assets\/sprites\//.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(srv.url);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' || document.querySelector('[data-testid="day"]'), null, { timeout: 15_000 });
}

const canvasPng = (page) => page.locator('canvas').first().screenshot();

test('smoke: load, move, end day, reload', { skip }, async (t) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  let failed = false;
  const check = async (name, fn) => t.test(name, async () => {
    try { await fn(); } catch (e) { failed = true; await shot(page, `smoke-${name.replace(/\W+/g, '_')}`); throw e; }
  });
  try {
    await openGame(page, errors);

    await check('page loads without errors', async () => {
      assert.deepEqual(errors, [], 'console/page errors on load');
      const n = await gameNums(page);
      for (const k of ['day', 'ap', 'cash']) assert.equal(typeof n[k], 'number', `cannot read ${k}`);
    });

    const n0 = await gameNums(page);

    await check('moving costs 0 AP (A5)', async () => {
      await page.locator('canvas').first().focus();
      const p0 = await playerPos(page);
      const img0 = await canvasPng(page);
      for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowDown']) await step(page, k);
      const p1 = await playerPos(page);
      if (p0 && p1) assert.notDeepEqual(p1, p0, 'player position unchanged');
      else assert.notDeepEqual(await canvasPng(page), img0, 'canvas unchanged after arrow keys');
      assert.equal((await gameNums(page)).ap, n0.ap, 'AP changed after moving');
    });

    await check('end day advances exactly one day and refills AP (A2, A4)', async () => {
      await clickEndDay(page);
      await page.waitForFunction((d) => ((window.__game?.state ?? window.__ranch?.app?.state)?.day ?? 0) !== d, n0.day, { timeout: 5_000 }).catch(() => {});
      await page.keyboard.press('Escape'); // close the morning summary
      const n1 = await gameNums(page);
      assert.equal(n1.day, n0.day + 1);
      assert.equal(n1.ap, n0.ap, 'AP not refilled to the daily max');
    });

    await check('auto-save survives reload (J1)', async () => {
      const before = await gameNums(page);
      await page.reload();
      await page.waitForFunction(() => document.body.dataset.ready === 'true' || document.querySelector('[data-testid="day"]'));
      assert.deepEqual(await gameNums(page), before);
    });
  } finally {
    await shot(page, failed ? 'smoke-last-FAILED' : 'smoke-last');
    await context.close();
  }
});
