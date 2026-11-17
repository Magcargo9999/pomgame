// Full 1-year loop on the real sim with a scripted "ordinary farmer" strategy (standing order).
// Checks invariants every day and that the year ends in yearComplete, not foreclosure (D26).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const has = fs.existsSync(path.join(ROOT, 'src', 'sim', 'index.js'));
const skip = has ? false : 'src/sim not merged yet';
const sim = has ? await import('../../src/sim/index.js') : {};

const FEED_FOR = { suckling: 'feed_starter', nursery: 'feed_starter', grower: 'feed_grower', finisher: 'feed_finisher' };

function tryDo(s, a) { const r = sim.doAction(s, a); return r.ok ? r.state : s; }

/** One day of an ordinary player: buy feed, set and feed every pen, clean dirty pens, ship ready pigs, restock piglets. */
function playDay(s) {
  let v = sim.getView(s);
  // Pay the season minimum early if cash allows (keeps a margin for feed).
  // Ship everything in the market window, normal fasting.
  // Carcass = live x 0.77; grade 1 needs carcass >= 80 kg, so wait for ~108 kg live or the last window days.
  const ready = v.pigs.filter((p) => p.shippable && p.marketWindow && (p.weightKg >= 108 || p.ageDays >= 41)).map((p) => p.id);
  if (ready.length) s = tryDo(s, { type: 'shipPigs', pigIds: ready, fast: 'normal', gentle: false, useLairage: false });
  v = sim.getView(s);
  for (const pen of v.pens) {
    const pigs = v.pigs.filter((p) => p.penId === pen.id);
    if (!pigs.length) continue;
    const want = FEED_FOR[pigs.map((p) => p.stage).find((st) => FEED_FOR[st]) ?? 'grower'];
    const stock = v.inventory.feeds[want] ?? 0;
    if (stock < 60) s = tryDo(s, { type: 'buy', itemId: want, qty: 100 });
    if (pen.feed?.id !== want) s = tryDo(s, { type: 'setPenFeed', penId: pen.id, feed: { kind: 'commercial', id: want } });
    s = tryDo(s, { type: 'feedPen', penId: pen.id });
    if (pen.hygiene < 50) s = tryDo(s, { type: 'cleanPen', penId: pen.id });
  }
  // Ordinary player raises every pig for meat (no breeding in this script).
  for (const p of v.pigs) if (p.role !== 'finisher') s = tryDo(s, { type: 'setRole', pigId: p.id, role: 'finisher' });
  // Restock: buy cheap piglets while there is room; near payday keep the minimum in hand.
  v = sim.getView(s);
  const daysToPay = v.debt.nextDueDay - v.day;
  const feedBudget = Number(process.env.QA_FB ?? 60000) * (v.herd.count + 1); // ~30 kg feed/pig/week ahead
  const reserve = feedBudget + (daysToPay <= 12 ? Math.max(0, (v.debt.minDue ?? v.debt.minPerSeason) - v.debt.paidThisSeason) : 0) + 80000;
  const price = v.shop.find((x) => x.itemId === 'piglet' && x.breedId === 'yorkshire_landrace')?.price ?? Infinity;
  for (let i = 0; i < 4 && v.cash - price > reserve && v.herd.count < v.herd.max; i++) {
    const before = s; s = tryDo(s, { type: 'buy', itemId: 'piglet', breedId: 'yorkshire_landrace', qty: 1, asFinisher: true });
    if (s === before) break;
    v = sim.getView(s);
  }
  return s;
}

test('1-year loop: scripted ordinary play reaches day 112 without foreclosure', { skip, timeout: 60_000 }, () => {
  let s = sim.createGame(20261118);
  const log = { shipped: 0, reports: 0, paydays: [], maxHerd: 0, minCash: Infinity };
  for (let guard = 0; guard < 130 && sim.getView(s).phase === 'playing'; guard++) {
    s = playDay(s);
    const v0 = sim.getView(s);
    const r = sim.endDay(s); s = r.state;
    const v = sim.getView(s);
    // invariants every day
    assert.ok(v.cash >= 0, `day ${v.day}: cash ${v.cash} < 0`);
    assert.ok(v.herd.count <= 30, `day ${v.day}: herd ${v.herd.count} > 30`);
    for (const pen of v.pens) {
      const n = v.pigs.filter((p) => p.penId === pen.id && p.stage !== 'suckling').length;
      assert.ok(n <= pen.capacity, `day ${v.day}: pen ${pen.id} ${n}/${pen.capacity}`);
    }
    assert.equal(v.ap.left, v.ap.max, `day ${v.day}: AP not refilled`);
    assert.equal(v.day, v0.day + 1);
    for (const e of r.events) {
      if (e.type === 'gradeReport') {
        log.reports++;
        assert.ok(['brand', '1+', '1', '2', 'out'].includes(e.sheet.grade), `bad grade ${e.sheet.grade}`);
      }
      if (e.type === 'gradeReport' && process.env.QA_SHEETS) console.log('SHEET', JSON.stringify(e.sheet));
      if (e.type === 'unfed') log.unfed = (log.unfed ?? 0) + 1;
      if (e.type === 'shipped') log.shipped += e.pigIds.length;
      if (e.type === 'debtDue') log.paydays.push({ day: e.day, ...e });
    }
    log.maxHerd = Math.max(log.maxHerd, v.herd.count);
    log.minCash = Math.min(log.minCash, v.cash);
  }
  const v = sim.getView(s);
  const summary = { phase: v.phase, day: v.day, cash: v.cash, debt: v.debt.balance, missed: v.debt.missed,
    shipped: log.shipped, reports: log.reports, grades: v.stats.gradeCounts, maxHerd: log.maxHerd, unfedPenDays: log.unfed ?? 0, minCash: log.minCash,
    paydays: log.paydays.map((p) => `${p.day}:paid ${p.paid} int ${p.interest} missed ${p.missed}`) };
  console.log('YEAR SUMMARY', JSON.stringify(summary));
  assert.equal(log.paydays.length, 4, 'expected 4 paydays in the year');
  assert.ok(log.shipped > 0 && log.reports === log.shipped, `shipped ${log.shipped}, reports ${log.reports}`);
  assert.equal(v.phase, 'yearComplete', `year ended as ${v.phase}`);
  assert.ok(v.debt.balance < sim.createGame(1).debt.balance, 'debt did not fall over the year');
});

test('1-year loop is deterministic for a seed', { skip, timeout: 60_000 }, () => {
  const run = () => { let s = sim.createGame(7); for (let i = 0; i < 112 && sim.getView(s).phase === 'playing'; i++) s = sim.endDay(playDay(s)).state; return sim.serialize(s); };
  assert.equal(run(), run());
});
