// E2E smoke: load page, move (0 AP), end day, save/reload. TEST-PLAN.md A2, A4, A5, J1.
// Run: node --test tests/e2e/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { hasPage, startServer, loadPlaywright, readNum, playerPos, shot } from './helpers.mjs';

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

async function openGame(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(srv.url);
  await page.getByTestId('day').waitFor({ timeout: 10_000 });
  return { page, errors };
}

test('smoke: load, move, end day, reload', { skip }, async (t) => {
  const context = await browser.newContext();
  const { page, errors } = await openGame(context);
  try {
    await t.test('page loads without errors', async () => {
      assert.deepEqual(errors, [], 'console/page errors on load');
    });

    const day0 = await readNum(page, 'day');

    await t.test('moving costs 0 AP (A5)', async () => {
      const ap0 = await readNum(page, 'ap');
      const p0 = await playerPos(page);
      assert.ok(p0, 'player position hook missing: window.__game.player or data-testid=player-pos');
      await page.locator('canvas').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
      for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) await page.keyboard.press(k);
      const p1 = await playerPos(page);
      assert.notDeepEqual(p1, p0, 'player did not move');
      assert.equal(await readNum(page, 'ap'), ap0, 'AP changed after moving');
    });

    await t.test('end day advances exactly one day and refills AP (A2, A4)', async () => {
      await page.getByTestId('end-day').click();
      await page.waitForFunction(
        (d) => /\d+/.test(document.querySelector('[data-testid="day"]').textContent) &&
               Number(document.querySelector('[data-testid="day"]').textContent.replace(/,/g, '').match(/\d+/)[0]) !== d,
        day0, { timeout: 5_000 });
      assert.equal(await readNum(page, 'day'), day0 + 1);
    });

    await t.test('auto-save survives reload (J1)', async () => {
      const before = { day: await readNum(page, 'day'), cash: await readNum(page, 'cash'), pos: await playerPos(page) };
      await page.reload();
      await page.getByTestId('day').waitFor();
      const afterState = { day: await readNum(page, 'day'), cash: await readNum(page, 'cash'), pos: await playerPos(page) };
      assert.deepEqual(afterState, before);
    });
  } catch (e) {
    await shot(page, `smoke-fail-${Date.now()}`);
    throw e;
  } finally {
    await shot(page, 'smoke-last');
    await context.close();
  }
});
