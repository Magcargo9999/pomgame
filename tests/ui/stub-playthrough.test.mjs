// Plays the stub sim from day 1 through the first debt payment the way a
// person would with the UI: feed every day, clean, ship in the market window,
// read the report, pay the creditor, end the season.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../../src/ui/sim.js';

test('day 1 to first debt payment is playable', () => {
  const s = sim.newGame({ seed: 7 });
  assert.equal(s.pigs.length, 2);
  const rows = [];
  while (s.day <= 28) {
    if (s.feed.stock.grower < 15) assert.equal(sim.act(s, { type: 'buyFeed', item: 'grower', kg: 50 }).ok, true);
    if (s.pigs.length) assert.equal(sim.act(s, { type: 'feed' }).ok, true, `feed on day ${s.day}`);
    if (s.day % 5 === 0) sim.act(s, { type: 'clean', penId: 'A' });
    const ready = s.pigs.filter((p) => p.ageDays >= 39);
    if (ready.length) assert.equal(sim.act(s, { type: 'ship', pigIds: ready.map((p) => p.id), fast: true }).ok, true);
    if (s.day === 28) {
      const di = sim.debtInfo(s);
      assert.equal(di.dueDay, 28);
      assert.ok(s.cash >= di.remaining, `cash ${s.cash} < ${di.remaining}`);
      assert.equal(sim.act(s, { type: 'payDebt', amount: di.remaining }).ok, true);
    }
    const out = sim.endDay(s);
    if (out.report) rows.push(...out.report.rows);
    if (s.day === 29) assert.ok(out.events.some((e) => e.type === 'debtOk'), 'debt kept');
  }
  assert.equal(rows.length, 2, 'grade reports arrived');
  for (const r of rows) assert.ok(['brand', '1+', '1', '2', 'out'].includes(r.grade));
  assert.equal(s.debt.missed, 0);
  assert.ok(s.debt.balance < 30000000 * 1.03);
});

test('action points gate actions and reset each day', () => {
  const s = sim.newGame({ seed: 1 });
  s.ap = 1;
  assert.equal(sim.act(s, { type: 'clean', penId: 'A' }).error, 'noAp');
  sim.endDay(s);
  assert.equal(s.ap, sim.rules.apMax);
});

test('save round-trips and rejects foreign files', () => {
  const s = sim.newGame({ seed: 3 });
  const back = sim.deserialize(sim.serialize(s));
  assert.deepEqual(back, s);
  assert.throws(() => sim.deserialize('{"hello":1}'));
});

test('grade function follows GDD 1.1 with the farm brand on top', () => {
  const base = { carcassKg: 88, backfat: 20, imf: 3.2, color: 4, fatColor: 2, bellyScore: 0.8, PSE: false, DFD: false };
  assert.equal(sim.gradeCarcass(base), '1+');
  assert.equal(sim.gradeCarcass({ ...base, imf: 4.2, fatColor: 1 }), 'brand');
  assert.equal(sim.gradeCarcass({ ...base, carcassKg: 99 }), '2');
  assert.equal(sim.gradeCarcass({ ...base, PSE: true }), '2');
});

function endSeason(s, pay) {
  while (s.day % sim.rules.seasonDays !== 0) sim.endDay(s);
  if (pay) sim.act(s, { type: 'payDebt', amount: pay });
  return sim.endDay(s).events;
}

test('ruling O1: partial payment is a miss, misses are consecutive, full payment with arrears resets', () => {
  const s = sim.newGame({ seed: 2 });
  s.cash = 1e9;
  assert.ok(endSeason(s, 100000).some((e) => e.type === 'debtMissed'));
  assert.equal(s.debt.missed, 1);
  const due = sim.debtInfo(s);
  assert.equal(due.minPayment, sim.rules.debt.minPayment[0] + 500000, 'arrears added to the next amount due');
  endSeason(s, 0);
  assert.equal(s.debt.missed, 2);
  endSeason(s, sim.debtInfo(s).remaining);
  assert.equal(s.debt.missed, 0, 'full payment resets the count');
  assert.equal(s.over, null);
});

test('ruling O1: three consecutive misses foreclose', () => {
  const s = sim.newGame({ seed: 2 });
  endSeason(s, 0); endSeason(s, 0);
  assert.ok(endSeason(s, 0).some((e) => e.type === 'foreclosed'));
  assert.equal(s.over, 'foreclosed');
});

test('ruling O3: an on-time minimum payment always lowers the balance', () => {
  const s = sim.newGame({ seed: 4 });
  s.cash = 1e9;
  const before = s.debt.balance;
  endSeason(s, sim.debtInfo(s).remaining);
  assert.ok(s.debt.balance < before);
});

test('ruling O2: 8 places at start, buying blocked when full, extra piglets sold at birth', () => {
  const s = sim.newGame({ seed: 5 });
  s.cash = 1e9;
  assert.equal(sim.capacity(s), 8);
  for (let i = 0; i < 6; i++) assert.equal(sim.act(s, { type: 'buyPiglet', breed: 'duroc' }).ok, true);
  assert.equal(sim.act(s, { type: 'buyPiglet', breed: 'duroc' }).error, 'cap');
  const [dam, sire] = s.pigs;
  dam.ageDays = 40; sire.ageDays = 40;
  assert.equal(sim.act(s, { type: 'breed', sireId: sire.id, damId: dam.id }).ok, true, 'breeding allowed when full');

  let ev = [];
  for (let i = 0; i < sim.rules.gestationDays + 1 && !ev.some((e) => e.type === 'born'); i++) {
    s.feed.stock.grower = 999; s.ap = sim.rules.apMax;
    sim.act(s, { type: 'feed' });
    ev = sim.endDay(s).events;
  }
  const sold = ev.find((e) => e.type === 'bornSold');
  assert.ok(sold && sold.n >= 6);
  assert.equal(sold.amount, sold.n * sim.rules.weanedPigletPrice);
  assert.equal(s.pigs.length, 8);
});

test('ruling O5: UI code never renders genotype', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['screens.js', 'main.js', 'world.js']) {
    const src = readFileSync(new URL(`../../src/ui/${f}`, import.meta.url), 'utf8');
    assert.ok(!/\.genome\b/.test(src), `${f} reads pig.genome`);
  }
});
