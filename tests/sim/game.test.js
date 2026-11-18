import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getView, listActions, doAction, endDay, serialize, deserialize } from '../../src/sim/index.js';
import { config } from '../../src/sim/data.js';

const run = (s, days) => { for (let i = 0; i < days; i++) s = endDay(s).state; return s; };
const feedAll = (s) => { for (const p of s.pens) { const r = doAction(s, { type: 'feedPen', penId: p.id }); if (r.ok) s = r.state; } return s; };
const runFed = (s, days) => { for (let i = 0; i < days; i++) s = endDay(feedAll(s)).state; return s; };
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.error)); return r.state; };

test('start state: 2 piglets, cash, debt, day 1', () => {
  const v = getView(createGame(1));
  assert.deepEqual(v.pigs.map((p) => p.role), ['breeder', 'finisher'], 'inherited gilt kept as breeder');
  assert.equal(v.day, 1); assert.equal(v.pigs.length, 2);
  assert.equal(v.cash, config.start.cash); assert.equal(v.debt.balance, config.debt.initial);
  assert.equal(v.ap.left, config.ap.base);
  assert.equal(v.herd.places, 8, 'start: 2 pens x 4');
});

test('same seed + same actions = same game; state is not mutated', () => {
  const a = createGame('farm'), b = createGame('farm');
  const before = serialize(a);
  const ra = doAction(a, { type: 'buy', itemId: 'piglet', breedId: 'duroc', qty: 2 });
  assert.equal(serialize(a), before);
  const sa = run(ra.state, 30), sb = run(doAction(b, { type: 'buy', itemId: 'piglet', breedId: 'duroc', qty: 2 }).state, 30);
  assert.equal(serialize(sa), serialize(sb));
});

test('save and load round trip', () => {
  const s = run(createGame(9), 5);
  const t = deserialize(serialize(s));
  assert.equal(serialize(endDay(t).state), serialize(endDay(s).state));
  assert.throws(() => deserialize('nope'), /save.invalid/);
  assert.throws(() => deserialize(JSON.stringify({ ...s, saveVersion: 99 })), /save.version/);
});

test('action points are spent and refused when empty', () => {
  let s = createGame(2);
  for (let i = 0; i < 5; i++) s = ok(doAction(s, { type: 'cleanPen', penId: 'pen-1' }));
  assert.equal(getView(s).ap.left, 0);
  const r = doAction(s, { type: 'cleanPen', penId: 'pen-1' });
  assert.equal(r.ok, false); assert.equal(r.error.code, 'ap.notEnough'); assert.equal(r.state, s);
  assert.equal(getView(endDay(s).state).ap.left, config.ap.base);
  s = ok(doAction(endDay(s).state, { type: 'hireWorker', workerId: 'helper_kim' }));
  assert.equal(getView(s).ap.max, config.ap.base + 4);
});

test('listActions reports disabled actions with a reason', () => {
  const s = createGame(3);
  const list = listActions(s, { kind: 'pen', id: 'pen-1' });
  const vac = list.find((a) => a.type === 'vaccinatePen');
  assert.equal(vac.enabled, false); assert.equal(vac.reason, 'stock.notEnough');
  assert.ok(list.find((a) => a.type === 'feedPen').enabled);
  assert.ok(listActions(s, { kind: 'shop' }).length > 10);
  assert.ok(listActions(s, { kind: 'pig', id: getView(s).pigs[0].id }).length >= 5);
});

test('places: 8 at start, piggery adds 22, cap 30, buying blocked when full', () => {
  let s = createGame(4);
  s.cash = 1e9;
  s = ok(doAction(s, { type: 'buy', itemId: 'piglet', breedId: 'duroc', qty: 2 }));
  s = ok(doAction(s, { type: 'buy', itemId: 'piglet', breedId: 'duroc', qty: 4, penId: 'pen-2' }));
  assert.equal(doAction(s, { type: 'buy', itemId: 'piglet', breedId: 'duroc', qty: 1 }).error.code, 'herd.full');
  s = ok(doAction(s, { type: 'buy', itemId: 'piggery' }));
  assert.equal(doAction(s, { type: 'buy', itemId: 'piggery' }).error.code, 'facility.owned');
  s = ok(doAction(s, { type: 'buy', itemId: 'piglet', breedId: 'duroc', qty: 22 }));
  assert.equal(getView(s).herd.count, 30);
  assert.equal(doAction(s, { type: 'buy', itemId: 'piglet', breedId: 'duroc', qty: 1 }).error.code, 'herd.full');
});

test('debt: minimum is auto-paid on payday, interest added', () => {
  let s = createGame(5);
  s.cash = 5_000_000;
  const out = endDay(run(s, 27));
  const due = out.events.find((e) => e.type === 'debtDue');
  assert.ok(due);
  const min = config.debt.minPerSeason[0];
  assert.equal(due.paid, min);
  assert.equal(due.balance, (config.debt.initial - min) + Math.round((config.debt.initial - min) * config.debt.ratePerSeason));
  assert.equal(out.state.debt.missed, 0);
});

test('every minimum payment exceeds that season interest, so on-time payments shrink the balance', () => {
  let bal = config.debt.initial;
  for (const min of config.debt.minPerSeason) {
    const interest = Math.round((bal - min) * config.debt.ratePerSeason);
    assert.ok(min > Math.round(bal * config.debt.ratePerSeason), `min ${min} vs interest on ${bal}`);
    const next = bal - min + interest;
    assert.ok(next < bal); bal = next;
  }
});

test('debt: misses must be consecutive; full payment incl. arrears resets the count; partial counts as a miss', () => {
  const min = config.debt.minPerSeason;
  let s = run(createGame(11), 27); s.cash = 0;
  s = endDay(s).state;
  assert.equal(s.debt.missed, 1); assert.equal(s.debt.arrears, min[0]);
  // Season 2: pay part of it -> still a miss.
  s = run(s, 27); s.cash = 0; s = ok(doAction({ ...s, cash: 100000 }, { type: 'payDebt', amount: 100000 }));
  s = endDay(s).state;
  assert.equal(s.debt.missed, 2);
  assert.equal(s.debt.arrears, min[0] + min[1] - 100000);
  // Season 3: pay everything owed -> back to 0.
  s = run(s, 27); s.cash = s.debt.arrears + min[2];
  s = endDay(s).state;
  assert.equal(s.debt.missed, 0); assert.equal(s.debt.arrears, 0); assert.equal(s.phase, 'playing');
});

test('genotype and breeding values never appear in the view (decision 31)', () => {
  let s = createGame(12); s.cash = 1e8;
  s = ok(doAction(s, { type: 'buy', itemId: 'piglet', breedId: 'berkshire', qty: 2 }));
  const text = JSON.stringify(getView(s));
  for (const k of ['"KIT"', '"MC1R"', '"RYR1"', '"SPOT"', '"loci"', '"genome"', '"bv"', '"genotype"']) assert.ok(!text.includes(k), k);
  assert.ok(getView(s).pigs[2].appearance.pattern === 'points');
  assert.ok(!listActions(s, { kind: 'shop' }).some((a) => a.params.itemId === 'gene_lab'));
});

test('debt: early payments count toward the minimum', () => {
  let s = createGame(5);
  s.cash = 5_000_000;
  s = ok(doAction(s, { type: 'payDebt', amount: 1_000_000 }));
  const out = endDay(run(s, 27));
  const due = out.events.find((e) => e.type === 'debtDue');
  assert.equal(due.paid, 1_000_000);
  assert.equal(due.interest, Math.round((config.debt.initial - 1_000_000) * config.debt.ratePerSeason));
});

test('debt: a miss doubles that interest; 3 misses in a row = foreclosure', () => {
  let s = createGame(6);
  s = run(s, 27);
  s.cash = 0;
  const out = endDay(s);
  const due = out.events.find((e) => e.type === 'debtDue');
  assert.equal(due.missed, 1);
  assert.equal(due.interest, Math.round(config.debt.initial * config.debt.ratePerSeason * config.debt.lateRateMult));
  s = out.state;
  for (let k = 0; k < 2; k++) { s = run(s, 27); s.cash = 0; s = endDay(s).state; }
  assert.equal(s.phase, 'foreclosed');
  assert.equal(doAction(s, { type: 'cleanPen', penId: 'pen-1' }).error.code, 'game.over');
});

test('a full year ends in yearComplete', () => {
  let s = createGame(7);
  s.cash = 1e8;
  let last;
  for (let i = 0; i < 112; i++) { last = endDay(s); s = last.state; }
  assert.equal(s.phase, 'yearComplete');
  assert.ok(last.events.some((e) => e.type === 'yearComplete'));
});

test('fed pigs reach market weight around day 40 and get graded', () => {
  let s = createGame(8);
  s.cash = 5_000_000;
  s = ok(doAction(s, { type: 'buy', itemId: 'piglet', breedId: 'duroc', qty: 4, penId: 'pen-2' }));
  s = ok(doAction(s, { type: 'buy', itemId: 'feed_finisher', qty: 1500 }));
  s = ok(doAction(s, { type: 'buy', itemId: 'feed_grower', qty: 1500 }));
  s = ok(doAction(s, { type: 'buy', itemId: 'feed_starter', qty: 400 }));
  for (let d = 0; d < 35; d++) {
    const v = getView(s);
    const pigs = v.pigs.filter((p) => p.penId === 'pen-2');
    const feed = pigs[0].ageDays < 13 ? 'feed_starter' : pigs[0].ageDays < 25 ? 'feed_grower' : 'feed_finisher';
    s = ok(doAction(s, { type: 'setPenFeed', penId: 'pen-2', feed: { kind: 'commercial', id: feed } }));
    s = ok(doAction(s, { type: 'feedPen', penId: 'pen-2' }));
    if (v.pens[1].hygiene < 60) s = ok(doAction(s, { type: 'cleanPen', penId: 'pen-2' }));
    for (const p of pigs) if (p.condition === 'sick') { const r = doAction(s, { type: 'treatPig', pigId: p.id }); if (r.ok) s = r.state; }
    s = endDay(s).state;
  }
  const v = getView(s);
  const pigs = v.pigs.filter((p) => p.penId === 'pen-2');
  for (const p of pigs) {
    assert.equal(p.ageDays, 40);
    assert.ok(p.weightKg > 95 && p.weightKg < 135, `weight ${p.weightKg}`);
    assert.ok(p.backfatMm > 12 && p.backfatMm < 30, `backfat ${p.backfatMm}`);
  }
  const ids = pigs.filter((p) => p.shippable).map((p) => p.id);
  s = ok(doAction(s, { type: 'shipPigs', pigIds: ids, fast: 'normal', gentle: true }));
  const out = endDay(s);
  const sheets = out.events.filter((e) => e.type === 'gradeReport');
  assert.equal(sheets.length, ids.length);
  for (const e of sheets) assert.ok(['brand', '1+', '1', '2', 'out'].includes(e.sheet.grade));
  assert.equal(getView(out.state).pigs.filter((p) => ids.includes(p.id)).length, 0);
});

test('breeding produces a litter with pedigree and F', () => {
  let s = createGame(10);
  s.cash = 5_000_000;
  s = ok(doAction(s, { type: 'buy', itemId: 'boar', breedId: 'duroc' }));
  s = ok(doAction(s, { type: 'buy', itemId: 'feed_grower', qty: 3000 }));
  s = ok(doAction(s, { type: 'setPenFeed', penId: 'pen-1', feed: { kind: 'commercial', id: 'feed_grower' } }));
  s = runFed(s, 30);
  const v = getView(s);
  const dam = v.pigs.find((p) => p.sex === 'F' && p.stage === 'breeder');
  const sire = v.pigs.find((p) => p.sex === 'M' && p.stage === 'breeder');
  assert.ok(dam && sire, 'need a mature gilt and boar');
  let conceived = false;
  for (let tries = 0; tries < 5 && !conceived; tries++) {
    s = ok(doAction(s, { type: 'breed', sireId: sire.id, damId: dam.id }));
    const out = endDay(feedAll(s)); s = out.state;
    conceived = out.events.some((e) => e.type === 'conception');
  }
  assert.ok(conceived);
  let births;
  for (let i = 0; i < 30 && !births; i++) { const out = endDay(feedAll(s)); s = out.state; births = out.events.find((e) => e.type === 'birth'); }
  assert.ok(births && births.pigIds.length > 0);
  const kid = getView(s).pigs.find((p) => p.id === births.pigIds[0]);
  assert.equal(kid.sireId, sire.id); assert.equal(kid.damId, dam.id); assert.equal(kid.F, 0);
  assert.equal(kid.breedId, 'crossbred');
});

test('previews: breeding shows expected F and risk; mix shows fat colour and price', async () => {
  const { previewBreeding, previewMix } = await import('../../src/sim/index.js');
  let s = createGame(13); s.cash = 1e8;
  s = ok(doAction(s, { type: 'buy', itemId: 'boar', breedId: 'duroc' }));
  const v = getView(s);
  const gilt = v.pigs.find((p) => p.role === 'breeder' && p.sex === 'F');
  const boar = v.pigs.find((p) => p.sex === 'M' && p.role === 'breeder');
  const pb = previewBreeding(s, boar.id, gilt.id);
  assert.equal(pb.expectedF, 0); assert.equal(pb.risk, 'safe');
  assert.equal(pb.ok, false); assert.equal(pb.reason, 'breed.invalid', 'gilt is too young on day 1');
  assert.ok(pb.sire.appearance.coat === 'red');
  const barley = previewMix({ barley: 0.55, corn: 0.33, soybean_meal: 0.12, vitamin_e: 0.01 });
  assert.equal(barley.fatColor, 1); assert.equal(barley.vitE, true);
  assert.ok(previewMix({ food_waste: 1 }).fatColor >= 4);
  assert.equal(previewMix({}).ok, false);
});
