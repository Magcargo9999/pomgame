// UI-driven run (god, PAG-5): day 1 -> day 57 through the real page with keyboard and clicks only.
// Game state is READ from the test hooks to decide what to do, never written.
// Asserts: zero console/page errors, both paydays (28, 56) paid in full, no misses.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { hasPage, startServer, loadPlaywright, shot } from './helpers.mjs';

const skip = !hasPage() ? 'index.html not found' : false;
let pw, srv, browser;
before(async () => { if (skip) return; pw = await loadPlaywright(); srv = await startServer(); browser = await pw.chromium.launch(); });
after(async () => { await browser?.close(); srv?.server.close(); });

const view = (page) => page.evaluate(() => window.__game.view);
const player = (page) => page.evaluate(() => window.__ranch.world.player);
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const FRAME_MS = 16;
const sameTile = (a, b) => a.x === b.x && a.y === b.y;

async function stepKey(page, dir) {
  // Playwright's paused clock schedules one animation frame per 16 ms.
  // Let the game read the held key once, then release it before the next tile.
  await page.keyboard.down(KEY[dir]);
  try {
    await page.clock.runFor(FRAME_MS);
  } finally {
    await page.keyboard.up(KEY[dir]);
  }
  for (let frame = 0; frame < 60; frame++) {
    const p = await player(page);
    if (!p.moving) return p;
    await page.clock.runFor(FRAME_MS);
  }
  throw new Error(`movement did not settle after pressing ${dir}`);
}
/** Walk tile by tile: x first along the road row, then y. Fails with a screenshot if blocked. */
async function walkTo(page, tx, ty, roadY = 5) {
  const legs = [['y', roadY], ['x', tx], ['y', ty]];
  for (const [axis, target] of legs) {
    for (let guard = 0; guard < 60; guard++) {
      const p = await player(page);
      if (p[axis] === target) break;
      const dir = axis === 'x' ? (p.x < target ? 'right' : 'left') : (p.y < target ? 'down' : 'up');
      const q = await stepKey(page, dir);
      if (sameTile(p, q)) { await shot(page, 'ui-run-blocked'); throw new Error(`blocked at ${p.x},${p.y} going ${dir} to ${tx},${ty}`); }
    }
  }
}
async function faceBuilding(page) {
  const p = await player(page);
  if (p.dir === 'up') return;
  const q = await stepKey(page, 'up');
  assert.equal(q.dir, 'up');
  assert.ok(sameTile(p, q), 'the building should block movement');
}
async function use(page) { await page.locator('#world').focus(); await page.keyboard.press('KeyE'); await page.waitForTimeout(150); }
async function menuItem(page, label) {
  const item = page.getByRole('menuitem', { name: label });
  await item.first().waitFor({ timeout: 3000 });
  if (await item.first().isDisabled()) { await page.keyboard.press('Escape'); return false; }
  await item.first().click(); await page.waitForTimeout(100); return true;
}
async function closeDialogs(page) { for (let i = 0; i < 3 && await page.locator('[role=dialog]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(80); } }

test('UI run: day 1 to 57 by keyboard and mouse, both payments made', { skip, timeout: 900_000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; const log = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    const start = new Date();
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 60_000));
    await page.goto(srv.url);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 15_000 });
    const SHED = { x: 10, y: 4 }, DOCK = { x: 29, y: 4 };
    await walkTo(page, SHED.x, SHED.y); await faceBuilding(page);

    while ((await view(page)).day <= 56) {
      let v = await view(page);
      assert.equal(v.phase, 'playing', `phase ${v.phase} on day ${v.day}`);
      // 1. buy feed in town when the pen's feed runs low (HUD button -> feed tab)
      const pen = v.pens.find((p) => p.pigIds.length);
      const feedId = pen?.feed?.id ?? 'feed_starter';
      if (pen && (v.inventory.feeds[feedId] ?? 0) < 40) {
        await page.locator('#btn-town').click();
        const row = page.locator('.shoprow', { hasText: await page.evaluate((id) => window.__ranch.app.itemName(id), feedId) });
        await row.getByRole('button', { name: /100 kg/ }).click();
        await closeDialogs(page);
      }
      // 2. feed every pen at the shed
      v = await view(page);
      if (v.pens.some((p) => p.pigIds.length && !p.fedToday)) {
        await use(page);
        const ok = await menuItem(page, '모든 우리 먹이 주기');
        if (!ok) log.push(`day ${v.day}: feed-all disabled`);
      }
      // 3. ship ready pigs from the dock (finishers at ~108 kg or day 41 of age)
      v = await view(page);
      if (v.pigs.some((p) => p.shippable && p.marketWindow && (p.weightKg >= 108 || p.ageDays >= 41))) {
        await walkTo(page, DOCK.x, DOCK.y); await faceBuilding(page); await use(page);
        await menuItem(page, '출하하기');
        await page.getByRole('button', { name: '트럭에 태우기' }).click();
        await closeDialogs(page);
        log.push(`day ${v.day}: shipped ${(await view(page)).shipments.length}`);
        await walkTo(page, SHED.x, SHED.y); await faceBuilding(page);
      }
      // 4. pay the season's due at the creditor when it is close and affordable
      v = await view(page);
      const remaining = Math.max(0, (v.debt.minDue ?? v.debt.minPerSeason) - v.debt.paidThisSeason);
      if (remaining > 0 && v.debt.nextDueDay - v.day <= 3 && v.cash >= remaining) {
        await page.locator('#btn-town').click();
        await page.getByRole('tab', { name: '채권자' }).or(page.getByRole('button', { name: '채권자' })).first().click();
        await page.getByTestId('pay-due').click();
        log.push(`day ${v.day}: paid ${remaining}`);
        await closeDialogs(page);
      }
      // 5. end the day and close the morning summary
      const d = v.day;
      await page.getByTestId('end-day').click();
      await page.waitForFunction((x) => window.__game.view.day === x + 1, d, { timeout: 5000 });
      await closeDialogs(page);
    }
    const v = await view(page);
    console.log('UI RUN', JSON.stringify({ day: v.day, cash: v.cash, debt: v.debt, shipped: v.stats.shipped, grades: v.stats.gradeCounts, log }));
    await shot(page, 'ui-run-day57');
    assert.deepEqual(errors, [], 'console/page errors during the run');
    assert.equal(v.day, 57);
    assert.equal(v.debt.missed, 0, 'a payment was missed');
    assert.equal(v.debt.arrears ?? 0, 0, 'arrears outstanding');
    const paidDays = log.filter((l) => /paid/.test(l)).map((l) => +l.match(/day (\d+)/)[1]);
    assert.ok(paidDays.some((d) => d <= 28) && paidDays.some((d) => d > 28 && d <= 56), `both seasons paid through the UI: ${log.join('; ')}`);
  } catch (e) { await shot(page, 'ui-run-FAILED'); console.log('UI RUN LOG', JSON.stringify(log), errors); throw e; }
  finally { await page.close(); }
});
