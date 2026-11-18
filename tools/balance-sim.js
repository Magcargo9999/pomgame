#!/usr/bin/env node
// Balance simulator (decision 26): plays N seeded years per strategy through the public sim API
// and prints how often each strategy makes the 4 debt payments.
// Usage: node tools/balance-sim.js [--runs 200] [--seed 1] [--set debt.initial=12000000] [--json] [--trace average]
import { createGame, getView, doAction, endDay } from '../src/sim/index.js';
import { config, items } from '../src/sim/data.js';
import { makeRng } from '../src/sim/rng.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const RUNS = Number(opt('runs', 200));
const SEED0 = Number(opt('seed', 1));
for (let i = 0; i < args.length; i++) if (args[i] === '--set') {
  const [path, raw] = args[i + 1].split('=');
  const keys = path.split('.'); let o = config;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = JSON.parse(raw);
}

// ---------- strategies ----------
// feedSkip: chance to forget a pen's feeding; cleanAt: clean below this hygiene; inspectEvery: days (0 = never)
// cycleCost: cash set aside per bought piglet for its feed; debtHorizon: start saving for payday this many days ahead
export const STRATEGIES = {
  careless: { feedSkip: 0.15, cleanAt: 25, inspectEvery: 0, treatVisible: 0.5, vaccinate: false, breeds: ['yorkshire_landrace'],
    stageFeeds: false, shipAge: [36, 50], shipRandom: 0.25, fast: 'none', gentle: false, cycleCost: 60000, feedPlan: 0.3, debtHorizon: 0,
    breedOwn: false, payEarly: false },
  average: { feedSkip: 0.03, cleanAt: 45, inspectEvery: 0, treatVisible: 1, vaccinate: false, breeds: ['yorkshire_landrace', 'duroc'],
    stageFeeds: true, shipAge: [38, 46], shipWeight: 112, fast: 'normal', gentle: false, cycleCost: 150000, feedPlan: 1, debtHorizon: 35,
    breedOwn: false, payEarly: false, rescueSale: true },
  skilled: { feedSkip: 0, cleanAt: 60, inspectEvery: 3, treatVisible: 1, vaccinate: true, breeds: ['duroc'],
    stageFeeds: true, shipAge: [36, 46], shipWeight: 113, fast: 'normal', gentle: true, cycleCost: 150000, feedPlan: 1, debtHorizon: 21,
    breedOwn: false, payEarly: true, forecast: true, fillPartial: true, rescueSale: true },
};

const FEED_FOR = (stage) => stage === 'suckling' || stage === 'nursery' ? 'feed_starter'
  : stage === 'finisher' ? 'feed_finisher' : 'feed_grower';
const tryDo = (s, a) => { const r = doAction(s, a); return r.ok ? r.state : s; };

function playDay(s, P, rng) {
  let v = getView(s);

  // Skilled: keep the inherited pair as a breeding unit.
  if (P.breedOwn && v.day === 1) {
    for (const p of v.pigs) s = tryDo(s, { type: 'setRole', pigId: p.id, role: 'breeder' });
    v = getView(s);
  }

  // 1. Ship finishers that are ready.
  const ship = v.pigs.filter((p) => p.shippable && p.role === 'finisher' && p.ageDays >= P.shipAge[0]
    && (p.ageDays >= P.shipAge[1] || (P.shipWeight ? p.weightKg >= P.shipWeight : rng() < P.shipRandom)));
  // Out of money: sell anything heavy enough.
  if (v.cash < 15000) for (const p of v.pigs) if (p.shippable && p.role === 'finisher' && p.weightKg >= 85 && !ship.includes(p)) ship.push(p);
  // Payday is tonight and cash is short: sell the heaviest pigs early (sales land before the debt check).
  const dueNow = Math.max(0, v.debt.minDue - v.debt.paidThisSeason);
  if (P.rescueSale && v.dayOfSeason === 28 && v.cash < dueNow) {
    let gap = dueNow - v.cash;
    for (const p of v.pigs.filter((x) => x.shippable && x.role === 'finisher' && x.weightKg >= 80 && !ship.includes(x)).sort((a, b) => b.weightKg - a.weightKg)) {
      if (gap <= 0) break; ship.push(p); gap -= p.weightKg * 0.77 * v.market.carcassPricePerKg * 0.95;
    }
  }
  if (ship.length) {
    s = tryDo(s, { type: 'shipPigs', pigIds: ship.map((p) => p.id), fast: P.fast, gentle: P.gentle && v.ap.left >= 6, useLairage: v.facilities.lairage });
    v = getView(s);
  }
  // Non-breeding strategies sell the inherited pair for the first payday.
  if (!P.breedOwn) for (const p of v.pigs) if (p.role === 'breeder' && p.stage !== 'pregnant' && p.stage !== 'lactating') s = tryDo(s, { type: 'setRole', pigId: p.id, role: 'finisher' });

  // 2. Breeding (skilled).
  if (P.breedOwn) {
    v = getView(s);
    const boar = v.pigs.find((p) => p.sex === 'M' && !p.castrated && p.role === 'breeder' && p.stage === 'breeder');
    for (const dam of v.pigs.filter((p) => p.sex === 'F' && p.role === 'breeder' && p.stage === 'breeder')) {
      if (boar) s = tryDo(s, { type: 'breed', sireId: boar.id, damId: dam.id });
    }
    // Wean: move nursery piglets out of the breeders' pen and mark them finishers.
    v = getView(s);
    for (const p of v.pigs) if (p.damId && p.role === 'breeder' && p.ageDays >= 5) s = tryDo(s, { type: 'setRole', pigId: p.id, role: 'finisher' });
    v = getView(s);
    const breederPens = new Set(v.pigs.filter((p) => p.role === 'breeder').map((p) => p.penId));
    for (const penId of breederPens) {
      const kids = v.pigs.filter((p) => p.penId === penId && p.role === 'finisher' && p.ageDays >= 5);
      if (!kids.length) continue;
      let left = kids.map((p) => p.id);
      for (const pen of getView(s).pens) {
        if (breederPens.has(pen.id) || !left.length) continue;
        const space = pen.capacity - pen.pigIds.length;
        if (space <= 0) continue;
        const batch = left.slice(0, space);
        const before = s; s = tryDo(s, { type: 'movePig', pigIds: batch, penId: pen.id });
        if (s !== before) left = left.slice(batch.length);
      }

    }
  }

  // 3. Restock empty pens with piglets, keeping money for payday and feed.
  v = getView(s);
  const daysToPay = v.debt.nextDueDay - v.day;
  const due = Math.max(0, v.debt.minPerSeason - v.debt.paidThisSeason);
  // Skilled players count pigs that will be sold before payday.
  const expected = P.forecast ? v.pigs.filter((p) => p.role === 'finisher' && p.ageDays + daysToPay - 2 >= 40).length * 380000 : 0;
  const debtReserve = daysToPay <= P.debtHorizon ? Math.max(0, due - expected) : 0;
  // Feed still owed to pigs already on the farm (about 3,800 G a day each until market age).
  const feedOwed = v.pigs.reduce((t, p) => t + (p.role === 'finisher' ? Math.max(0, 42 - p.ageDays) : 20) * 4200, 0) * P.feedPlan;
  let spare = v.cash - debtReserve - feedOwed;
  const breedId = P.breeds[rng.int(P.breeds.length)];
  const price = items.piglets[breedId];
  {
    for (const pen of v.pens) {
      const ages = v.pigs.filter((p) => p.penId === pen.id).map((p) => p.ageDays);
      if (pen.pigIds.length && !(P.fillPartial && Math.max(...ages) <= 12)) continue;
      const room = Math.min(pen.capacity - pen.pigIds.length, getView(s).herd.places - getView(s).herd.count);
      const n = Math.min(room, Math.floor(spare / (price + P.cycleCost)));
      if (n >= 1) {
        const before = getView(s).cash;
        s = tryDo(s, { type: 'buy', itemId: 'piglet', breedId, qty: n, penId: pen.id, asFinisher: true });
        spare -= before - getView(s).cash;
      }
    }
    v = getView(s);
    if (!v.facilities.piggery && spare > items.facilities.piggery.price + 4 * (price + P.cycleCost) && daysToPay > 10) {
      s = tryDo(s, { type: 'buy', itemId: 'piggery' });
    }
  }

  // 4. Feed each pen with the feed for its main stage; top up stock.
  v = getView(s);
  for (const pen of v.pens) {
    const pigs = v.pigs.filter((p) => p.penId === pen.id && p.stage !== 'suckling');
    if (!pigs.length || rng() < P.feedSkip) continue;
    const growers = pigs.filter((p) => p.role === 'finisher');
    const main = (growers.length ? growers : pigs)[0].stage;
    const want = P.stageFeeds ? FEED_FOR(main) : (main === 'nursery' ? 'feed_starter' : 'feed_grower');
    if (pen.feed.id !== want) s = tryDo(s, { type: 'setPenFeed', penId: pen.id, feed: { kind: 'commercial', id: want } });
    const stock = getView(s).inventory.feeds[want] ?? 0;
    const need = pigs.length * 10;
    if (stock < need) {
      const afford = Math.floor(getView(s).cash / items.commercialFeeds[want].price);
      if (afford > 0) s = tryDo(s, { type: 'buy', itemId: want, qty: Math.min(Math.max(need * 3 - stock, 50), afford) });
    }
    s = tryDo(s, { type: 'feedPen', penId: pen.id });
  }

  // 5. Health and hygiene.
  v = getView(s);
  if (P.inspectEvery && v.day % P.inspectEvery === 0) for (const pen of v.pens) if (pen.pigIds.length) s = tryDo(s, { type: 'inspectPen', penId: pen.id });
  v = getView(s);
  for (const p of v.pigs) if (p.condition === 'sick' && rng() < P.treatVisible) s = tryDo(s, { type: 'treatPig', pigId: p.id });
  if (P.vaccinate) {
    v = getView(s);
    for (const pen of v.pens) {
      const n = v.pigs.filter((p) => p.penId === pen.id && !p.vaccinated && p.stage !== 'suckling').length;
      if (n >= 2 && v.cash > 300000) { if (getView(s).inventory.vaccine < n) s = tryDo(s, { type: 'buy', itemId: 'vaccine', qty: n }); s = tryDo(s, { type: 'vaccinatePen', penId: pen.id }); }
    }
  }
  v = getView(s);
  for (const pen of [...v.pens].sort((a, b) => a.hygiene - b.hygiene)) if (pen.pigIds.length && pen.hygiene < P.cleanAt) s = tryDo(s, { type: 'cleanPen', penId: pen.id });

  // 6. A helper once the farm outgrows one person's day.
  v = getView(s);
  if (v.pens.filter((p) => p.pigIds.length).length >= 4 && !v.workers.length && v.cash > 500000) s = tryDo(s, { type: 'hireWorker', workerId: 'helper_kim' });

  // 7. Skilled pays the minimum as soon as the cash is there in the last week.
  v = getView(s);
  if (P.payEarly && daysToPay <= 3 && due > 0 && v.cash > due) s = tryDo(s, { type: 'payDebt', amount: due });
  return endDay(s);
}

export function playYear(strategy, seed, trace = false) {
  const P = STRATEGIES[strategy];
  const rng = makeRng(seed * 7919 + 13);
  let s = createGame(seed);
  const grades = { brand: 0, '1+': 0, '1': 0, '2': 0, out: 0 };
  let paidCount = 0, minCashAtPay = Infinity;
  while (s.phase === 'playing') {
    const out = playDay(s, P, rng);
    s = out.state;
    for (const e of out.events) {
      if (e.type === 'debtDue') { if (!out.events.some((x) => x.type === 'debtMissed')) paidCount++; minCashAtPay = Math.min(minCashAtPay, s.cash); }
      if (e.type === 'gradeReport') grades[e.sheet.grade]++;
    }
    if (trace) {
      const tv = getView(s);
      console.log(tv.day, 'cash', tv.cash, 'herd', tv.pigs.length, tv.pigs.map((p) => p.ageDays + ':' + Math.round(p.weightKg) + (p.condition !== 'healthy' ? p.condition[0] : '')).join(' '),
        out.events.filter((e) => !['marketMove', 'dayStart', 'stageChange', 'wages'].includes(e.type)).map((e) => e.type === 'gradeReport' ? 'G' + e.sheet.grade : e.type).join(','));
    }
  }
  const v = getView(s);
  const herdValue = v.pigs.reduce((t, p) => t + (p.weightKg >= 80 ? p.weightKg * 0.77 * v.market.carcassPricePerKg : p.weightKg * 3000), 0);
  return { strategy, seed, phase: s.phase, missed: s.debt.missed, paidCount, cashAfterPayday: minCashAtPay,
    cash: s.cash, debt: s.debt.balance, herd: v.pigs.length, herdValue: Math.round(herdValue),
    shipped: s.stats.shipped, deaths: s.stats.deaths, births: s.stats.births, grades, revenue: s.stats.revenue };
}

export function summarise(results) {
  const n = results.length;
  const pct = (f) => Math.round(100 * results.filter(f).length / n);
  const med = (k) => { const a = results.map((r) => r[k]).sort((x, y) => x - y); return a[Math.floor(n / 2)]; };
  const g = { brand: 0, '1+': 0, '1': 0, '2': 0, out: 0 };
  for (const r of results) for (const k in g) g[k] += r.grades[k];
  const tot = Object.values(g).reduce((a, b) => a + b, 0) || 1;
  return {
    allFourPaid: pct((r) => r.paidCount === 4), anyMiss: pct((r) => r.missed >= 1), foreclosed: pct((r) => r.phase === 'foreclosed'),
    medianCashEnd: med('cash'), medianHerdValue: med('herdValue'), medianShipped: med('shipped'), medianDeaths: med('deaths'),
    gradeMix: Object.fromEntries(Object.entries(g).map(([k, v]) => [k, Math.round(100 * v / tot)])),
  };
}

export function runAll(runs = RUNS, seed0 = SEED0) {
  const out = {};
  for (const name of Object.keys(STRATEGIES)) {
    const res = [];
    for (let i = 0; i < runs; i++) res.push(playYear(name, seed0 + i));
    out[name] = summarise(res);
  }
  return out;
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/balance-sim.js');
if (isMain) {
  if (opt('trace')) { console.log(playYear(opt('trace'), SEED0, true)); process.exit(0); }
  const out = runAll();
  if (args.includes('--json')) console.log(JSON.stringify(out, null, 2));
  else {
    const d = config.debt;
    console.log(`runs/strategy ${RUNS} | debt ${d.initial} | rate ${d.ratePerSeason}/season | min ${d.minPerSeason.join('/')} | start cash ${config.start.cash}`);
    console.log('strategy | all 4 paid | any miss | foreclosed | median cash end | median herd value | shipped | deaths | grade mix %');
    for (const [k, r] of Object.entries(out)) {
      console.log(`${k.padEnd(8)} | ${String(r.allFourPaid).padStart(9)}% | ${String(r.anyMiss).padStart(7)}% | ${String(r.foreclosed).padStart(9)}% | ${String(r.medianCashEnd).padStart(15)} | ${String(r.medianHerdValue).padStart(17)} | ${String(r.medianShipped).padStart(7)} | ${String(r.medianDeaths).padStart(6)} | ${JSON.stringify(r.gradeMix)}`);
    }
  }
}
