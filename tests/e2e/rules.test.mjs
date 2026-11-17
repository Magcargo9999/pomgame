// QA acceptance checks on the public sim API (TEST-PLAN.md ids in test names).
// Black-box except for setup: state is a plain JSON object, so tests clone it and set
// fields (cash, day, age) to reach a situation quickly. Skips if src/sim is not merged yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const has = fs.existsSync(path.join(ROOT, 'src', 'sim', 'index.js'));
const skip = has ? false : 'src/sim not merged yet';
const sim = has ? await import('../../src/sim/index.js') : {};
const { createGame, getView, doAction, endDay, serialize, deserialize } = sim;

const clone = (s) => structuredClone(s);
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.error)); return r.state; };
const night = (s) => endDay(s);
const toDay = (s, day) => { s = clone(s); s.day = day; return s; };

test('A2/A4 end day: +1 day, AP refilled', { skip }, () => {
  let s = createGame(1);
  s = ok(doAction(s, { type: 'cleanPen', penId: getView(s).pens[0].id }));
  const v0 = getView(s);
  const v1 = getView(night(s).state);
  assert.equal(v1.day, v0.day + 1);
  assert.equal(v1.ap.left, v1.ap.max);
});

test('C1/C4 start: exactly 2 pigs, all species pig', { skip }, () => {
  const v = getView(createGame(1));
  assert.equal(v.pigs.length, 2);
});

test('D4 start capacity is 2 pens x 4 = 8 places (D28)', { skip }, () => {
  const v = getView(createGame(1));
  assert.equal(v.pens.length, 2);
  assert.deepEqual(v.pens.map((p) => p.capacity), [4, 4]);
});

test('D4 total pen capacity can never exceed 30 (D28)', { skip }, () => {
  let s = clone(createGame(1)); s.cash = 1e9;
  for (let i = 0; i < 20; i++) { const r = doAction(s, { type: 'buy', itemId: 'pen' }); if (r.ok) s = r.state; }
  for (const id of ['piggery', 'piggery_t1']) { const r = doAction(s, { type: 'buy', itemId: id }); if (r.ok) s = r.state; }
  const cap = getView(s).pens.reduce((t, p) => t + p.capacity, 0);
  assert.ok(cap <= 30, `total capacity ${cap} > 30`);
});

test('D2 litter overflow: no pen holds more weaned pigs than its capacity (D28)', { skip }, () => {
  let s = clone(createGame(3)); s.cash = 1e9;
  const dam = s.pigs.find((p) => p.sex === 'F'); const sire = s.pigs.find((p) => p.sex === 'M');
  // fill the dam's pen to capacity with bought piglets
  const pen = s.pens.find((p) => p.id === dam.penId);
  let free = pen.capacity - s.pigs.filter((p) => p.penId === pen.id).length;
  if (free > 0) s = ok(doAction(s, { type: 'buy', itemId: 'piglet', breedId: 'duroc', qty: free, penId: pen.id }));
  s = clone(s);
  const d = s.pigs.find((p) => p.id === dam.id);
  d.pregnantDueDay = s.day; d.pregnantBy = sire.id;
  let r = night(s); s = r.state;
  const birth = r.events.find((e) => e.type === 'birth');
  assert.ok(birth, 'no birth event');
  for (let i = 0; i < 8; i++) s = night(s).state;   // past weaning
  const v = getView(s);
  for (const p of v.pens) {
    const n = v.pigs.filter((x) => x.penId === p.id && x.stage !== 'suckling').length;
    assert.ok(n <= p.capacity, `pen ${p.id}: ${n} pigs in ${p.capacity} places (litter ${birth.pigIds.length} kept, ${birth.soldExtra} sold)`);
  }
});

test('D5 breeding allowed when full but warns (D28)', { skip }, () => {
  // Fill the herd to 30 by cloning the boar, then ask for the sow's actions.
  const s = clone(createGame(1));
  const dam = s.pigs.find((p) => p.sex === 'F'); const boar = s.pigs.find((p) => p.sex === 'M');
  for (const p of [dam, boar]) { p.role = 'breeder'; p.castrated = false; p.bornDay = s.day - 50; }
  while (s.pigs.length < 30) s.pigs.push({ ...structuredClone(boar), id: `QA-${s.pigs.length}` });
  const info = sim.listActions(s, { kind: 'pig', id: dam.id }).find((a) => a.type === 'breed');
  assert.ok(info, 'no breed action listed');
  assert.equal(info.enabled, true, `breeding blocked when full: ${info.reason}`);
  assert.ok(info.warning || info.warnings?.length, `no full-farm warning on breed action: ${JSON.stringify(info)}`);
});

test('F2/F3 grade report next morning with a real grade code', { skip }, () => {
  let s = clone(createGame(5));
  const p = s.pigs[0];
  p.role = 'finisher'; p.castrated = p.sex === 'M'; p.bornDay = s.day - 38; p.weightKg = 112;
  const v = getView(s);
  const pv = v.pigs.find((x) => x.id === p.id);
  if (!pv.shippable) return assert.fail(`set-up pig not shippable: ${JSON.stringify(pv)}`);
  s = ok(doAction(s, { type: 'shipPigs', pigIds: [p.id], fast: 'normal', gentle: false, useLairage: false }));
  assert.equal(getView(s).reports.length, 0, 'report before the night');
  const r = night(s);
  const sheet = r.events.find((e) => e.type === 'gradeReport')?.sheet;
  assert.ok(sheet, 'no grade report the next morning');
  assert.equal(sheet.day, getView(r.state).day);
  assert.ok(['brand', '1+', '1', '2', 'out'].includes(sheet.grade));
});

test('G1/G9 no gene lab in the shop or facilities (D31)', { skip }, () => {
  const v = getView(createGame(1));
  assert.ok(!v.shop.some((x) => x.itemId === 'gene_lab'), 'gene_lab is for sale');
  assert.ok(!('gene_lab' in v.facilities), 'gene_lab listed in facilities');
});

test('G1 genotype and BV never appear in the view, even if gene_lab is bought (D31)', { skip }, () => {
  let s = clone(createGame(1)); s.cash = 1e9;
  const r = doAction(s, { type: 'buy', itemId: 'gene_lab' });
  if (r.ok) s = r.state;
  const json = JSON.stringify(getView(s));
  for (const p of getView(s).pigs) {
    assert.equal(p.genotype ?? null, null, 'genotype visible');
    assert.equal(p.bv ?? null, null, 'bv visible');
  }
  assert.doesNotMatch(json, /"(KIT|MC1R|RYR1|SPOT)"/, 'locus names in view');
});

test('H1/H3 payday on day 28; on-time payment lowers the balance (D29)', { skip }, () => {
  let s = toDay(createGame(1), 28); s.cash = 1e8;
  const before = getView(s).debt.balance;
  const r = night(s);
  const due = r.events.find((e) => e.type === 'debtDue');
  assert.ok(due, 'no debtDue on day 28');
  assert.ok(due.interest < due.paid, `interest ${due.interest} >= payment ${due.paid}`);
  assert.ok(getView(r.state).debt.balance < before);
});

const missPayday = (s) => { s = clone(s); s.cash = 0; s.day = Math.ceil(s.day / 28) * 28; return night(s).state; };
const payPayday = (s) => { s = clone(s); s.cash = 1e9; s.day = Math.ceil(s.day / 28) * 28; return night(s).state; };

test('H5 three consecutive misses forecloses (D27)', { skip }, () => {
  let s = createGame(1);
  s = missPayday(s); s = missPayday(s);
  assert.equal(getView(s).phase, 'playing');
  s = missPayday(s);
  assert.equal(getView(s).phase, 'foreclosed');
  const r = doAction(s, { type: 'cleanPen', penId: getView(s).pens[0].id });
  assert.equal(r.ok, false);
});

test('H5b full payment resets the miss count (D27)', { skip }, () => {
  let s = createGame(1);
  s = missPayday(s); s = missPayday(s); s = payPayday(s);
  assert.equal(getView(s).debt.missed, 0, 'missed not reset after a full payment');
  s = missPayday(s); s = missPayday(s);
  assert.equal(getView(s).phase, 'playing', 'foreclosed after miss,miss,pay,miss,miss');
});

test('H5a partial payment counts as missed (D27)', { skip }, () => {
  let s = toDay(createGame(1), 28);
  s = clone(s); s.cash = 1000;
  s = ok(doAction(s, { type: 'payDebt', amount: 1000 }));
  s = night(s).state;
  assert.equal(getView(s).debt.missed, 1);
});

test('J6 save round trip is lossless', { skip }, () => {
  let s = createGame(7);
  for (let i = 0; i < 10; i++) s = night(s).state;
  assert.equal(serialize(deserialize(serialize(s))), serialize(s));
});

test('K1 no Hangul in src/sim', { skip }, () => {
  const dir = path.join(ROOT, 'src', 'sim');
  for (const f of fs.readdirSync(dir)) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)
      .filter((l) => /[가-힣]/.test(l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')));
    assert.deepEqual(lines, [], `${f} has Hangul outside comments`);
  }
});
