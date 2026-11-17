// Temporary stand-in for src/sim until docs/tech/SIM-API.md lands.
// The UI only talks to this through src/ui/sim.js, so swapping in the real
// sim is a one-line change there. No DOM, no Korean strings: events carry
// keys and numbers, the UI translates them.
//
// Contract the UI relies on:
//   newGame({seed}) -> state (plain JSON)
//   rules -> constants (apMax, pigCap, seasonDays, costs, prices)
//   act(state, action) -> {ok, error?, events[]}   (mutates state)
//   endDay(state) -> {events[], report|null}       (mutates state)
//   previewBreeding(state, sireId, damId) -> {ok, error?, F, risk, gestationDays}
//   previewMix(mix) -> {energy, protein, fatColor, ok}
//   canBreed(pig), canShip(pig), marketWindow -> helpers
//   serialize(state) -> string, deserialize(string) -> state (throws on bad file)

export const SIM_API = 'stub-0.1';

export const rules = Object.freeze({
  apMax: 10,
  pigCap: 30,
  seasonDays: 28,
  yearDays: 112,
  penCapacity: 8,
  pens: ['A', 'B', 'C', 'D'],
  ap: { feed: 2, feedPen: 1, clean: 2, pet: 1, vetCheck: 1, breed: 2, ship: 3 },
  cost: { vetCheck: 30000, vetVisit: 80000, mixer: 500000 },
  feedPrice: { starter: 800, grower: 600, finisher: 550, corn: 400, barley: 420, soy: 700, scraps: 150, vitE: 5000 },
  piglet: { yorkshire: 120000, landrace: 120000, duroc: 140000, berkshire: 150000, native: 160000, spotted: 150000 },
  carcassBasePerKg: 5000,
  marketWindow: [36, 42],
  shipMinAge: 25,
  breedMinAge: 30,
  gestationDays: 25,
  debt: { start: 30000000, interest: 0.03, minPayment: [600000, 1500000, 3000000, 4000000], missedLimit: 3 },
});

const FEEDS = {
  starter: { e: 1.0, p: 1.25, unsat: 0.2, barley: 0 },
  grower: { e: 1.0, p: 1.0, unsat: 0.25, barley: 0 },
  finisher: { e: 1.05, p: 0.85, unsat: 0.25, barley: 0.2 },
  corn: { e: 1.15, p: 0.6, unsat: 0.3, barley: 0 },
  barley: { e: 1.0, p: 0.75, unsat: 0, barley: 1 },
  soy: { e: 0.9, p: 2.2, unsat: 0.1, barley: 0 },
  scraps: { e: 1.05, p: 0.8, unsat: 1, barley: 0 },
  vitE: { e: 0, p: 0, unsat: 0, barley: 0 },
};
export const MIX_ITEMS = ['corn', 'barley', 'soy', 'scraps', 'vitE'];
export const COMMERCIAL = ['starter', 'grower', 'finisher'];

const BREEDS = {
  yorkshire: { KIT: ['I', 'I'], MC1R: ['e', 'e'], imf: 0.9 },
  landrace: { KIT: ['I', 'I'], MC1R: ['e', 'e'], imf: 0.9 },
  duroc: { KIT: ['i', 'i'], MC1R: ['e', 'e'], imf: 1.3 },
  berkshire: { KIT: ['i', 'i'], MC1R: ['EP', 'EP'], imf: 1.25 },
  native: { KIT: ['i', 'i'], MC1R: ['ED', 'ED'], imf: 1.35 },
  spotted: { KIT: ['i', 'i'], MC1R: ['EP', 'e'], imf: 1.0 },
};
export const BREED_IDS = Object.keys(BREEDS);

// ---------- rng (mulberry32, state kept in the save) ----------
function rand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;

// ---------- phenotype ----------
const KIT_ORDER = ['I', 'Be', 'i'];
const MC1R_ORDER = ['ED', 'EP', 'e'];
const dom = (pair, order) => order.find((a) => pair.includes(a));
export function lookOf(genome) {
  const kit = dom(genome.KIT, KIT_ORDER);
  if (kit === 'I') return { coat: 'white', pattern: 'none' };
  const mc = dom(genome.MC1R, MC1R_ORDER);
  const coat = mc === 'e' ? 'red' : 'black';
  let pattern = kit === 'Be' ? 'belt' : 'none';
  if (mc === 'EP') pattern = genome.MC1R.includes('e') ? 'spots' : 'points';
  return { coat, pattern };
}

// ---------- creation ----------
function makePig(state, { breed, sex, ageDays, sire = null, dam = null, genome, penId }) {
  const id = `PIG-${String(++state.nextId).padStart(4, '0')}`;
  const g = genome || { KIT: [...BREEDS[breed].KIT], MC1R: [...BREEDS[breed].MC1R], RYR1: [rand(state) < 0.15 ? 'n' : 'N', 'N'] };
  const pig = {
    id, nameIndex: state.nextId - 1, breed, sex, ageDays,
    weightKg: weightForAge(ageDays), backfatMm: weightForAge(ageDays) * 0.16, imf: 1.0,
    health: 95, stress: 15, hunger: 20, affinity: 30, sick: false,
    penId: penId || leastFullPen(state), sire, dam, F: 0,
    bv: { growth: gauss(state) * 0.5, imf: gauss(state) * 0.5 },
    genome: g, look: lookOf(g), pregnancy: null, fedToday: false,
  };
  state.pigs.push(pig);
  return pig;
}
function gauss(state) {
  const u = Math.max(rand(state), 1e-9), v = rand(state);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function weightForAge(a) {
  const pts = [[0, 1.4], [5, 7], [13, 30], [25, 70], [41, 115], [80, 160]];
  for (let i = 1; i < pts.length; i++) {
    if (a <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((a - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 160;
}
function leastFullPen(state) {
  let best = rules.pens[0], n = Infinity;
  for (const p of rules.pens) {
    const c = state.pigs.filter((x) => x.penId === p).length;
    if (c < n) { n = c; best = p; }
  }
  return best;
}

export function newGame({ seed = 12345 } = {}) {
  const state = {
    sim: SIM_API, seed, rng: seed >>> 0, day: 1, ap: rules.apMax, cash: 300000,
    debt: { balance: rules.debt.start, paidThisSeason: 0, missed: 0 },
    pigs: [], nextId: 0,
    pens: Object.fromEntries(rules.pens.map((p) => [p, { hygiene: 70 }])),
    feed: { mode: 'commercial', commercial: 'grower', mix: { corn: 50, barley: 25, soy: 22, scraps: 0, vitE: 3 },
      stock: { starter: 0, grower: 150, finisher: 0, corn: 0, barley: 0, soy: 0, scraps: 0, vitE: 0 } },
    unlocks: { mixer: false, geneLab: false },
    truck: [], reports: [], over: null,
  };
  // decision 24: two piglets left by the previous owner, plus a little cash
  makePig(state, { breed: 'yorkshire', sex: 'F', ageDays: 14, penId: 'A' });
  makePig(state, { breed: 'duroc', sex: 'M', ageDays: 15, penId: 'A' });
  return state;
}

// ---------- queries ----------
export function dateOf(day) {
  const d0 = day - 1;
  return { year: Math.floor(d0 / rules.yearDays) + 1, season: Math.floor(d0 / rules.seasonDays) % 4, dayOfSeason: (d0 % rules.seasonDays) + 1 };
}
export function debtInfo(state) {
  const due = Math.ceil(state.day / rules.seasonDays) * rules.seasonDays;
  const year = Math.min(Math.floor((state.day - 1) / rules.yearDays), 3);
  const min = rules.debt.minPayment[year];
  return { balance: state.debt.balance, dueDay: due, daysLeft: due - state.day, minPayment: min,
    paid: state.debt.paidThisSeason, remaining: Math.max(0, min - state.debt.paidThisSeason), missed: state.debt.missed };
}
export function stageOf(p) {
  if (p.pregnancy) return 'pregnant';
  if (p.ageDays < 5) return 'piglet';
  if (p.ageDays < 13) return 'weaner';
  if (p.ageDays < 25) return 'grower';
  if (p.ageDays >= rules.breedMinAge && p.role === 'breeder') return 'breeder';
  return 'finisher';
}
export const canShip = (p) => p.ageDays >= rules.shipMinAge && !p.pregnancy;
export const canBreed = (p) => p.ageDays >= rules.breedMinAge && !p.pregnancy;
export const inMarketWindow = (p) => p.ageDays >= rules.marketWindow[0] && p.ageDays <= rules.marketWindow[1];
export const sickCount = (state) => state.pigs.filter((p) => p.sick).length;
export const findPig = (state, id) => state.pigs.find((p) => p.id === id);

function mixStats(mix) {
  let e = 0, p = 0, unsat = 0, barley = 0, total = 0;
  for (const k of Object.keys(mix)) {
    const s = (mix[k] || 0) / 100;
    total += mix[k] || 0;
    e += s * FEEDS[k].e; p += s * FEEDS[k].p; unsat += s * FEEDS[k].unsat; barley += s * FEEDS[k].barley;
  }
  const fatColor = clamp(1 + 4 * unsat - 1.5 * barley, 1, 7);
  return { energy: r1(e * 100) / 100, protein: r1(p * 100) / 100, unsat, barley, fatColor: r1(fatColor), vitE: (mix.vitE || 0) / 100, total };
}
export function previewMix(mix) {
  const s = mixStats(mix);
  return { ...s, ok: Math.round(s.total) === 100 };
}
function currentRecipe(state) {
  return state.feed.mode === 'mix' ? state.feed.mix : { [state.feed.commercial]: 100 };
}
export function dailyFeedKg(state, pigs = state.pigs) {
  return r1(pigs.reduce((s, p) => s + Math.max(0.3, p.weightKg * 0.035), 0));
}

function coancestry(state, a, b) {
  if (a.id === b.id) return 0.5;
  const sib = a.sire && a.sire === b.sire && a.dam && a.dam === b.dam;
  if (sib) return 0.25;
  if (a.sire === b.id || a.dam === b.id || b.sire === a.id || b.dam === a.id) return 0.25;
  if ((a.sire && (a.sire === b.sire)) || (a.dam && a.dam === b.dam)) return 0.125;
  return 0;
}
export function riskOf(F) {
  return F < 0.03125 ? 'safe' : F < 0.0625 ? 'caution' : F < 0.125 ? 'danger' : 'inbred';
}
export function previewBreeding(state, sireId, damId) {
  const s = findPig(state, sireId), d = findPig(state, damId);
  if (!s || !d || s.sex !== 'M' || d.sex !== 'F') return { ok: false, error: 'badPair' };
  if (!canBreed(s) || !canBreed(d)) return { ok: false, error: d.pregnancy ? 'pregnant' : 'tooYoung' };
  const F = coancestry(state, s, d);
  return { ok: true, F, risk: riskOf(F), gestationDays: rules.gestationDays };
}

// ---------- actions ----------
const fail = (error, extra) => ({ ok: false, error, events: [], ...extra });
function spendAp(state, n) {
  if (state.ap < n) return false;
  state.ap -= n;
  return true;
}

function feedPigs(state, pigs) {
  const recipe = currentRecipe(state);
  let fed = 0;
  for (const p of pigs) {
    if (p.fedToday) { fed++; continue; }
    const need = Math.max(0.3, p.weightKg * 0.035);
    const ok = Object.entries(recipe).every(([k, pct]) => state.feed.stock[k] >= (need * pct) / 100 - 1e-9);
    if (!ok) continue;
    for (const [k, pct] of Object.entries(recipe)) state.feed.stock[k] = r1(state.feed.stock[k] - (need * pct) / 100);
    p.fedToday = true;
    p.hunger = 0;
    p.lastRecipe = { ...recipe };
    fed++;
  }
  return fed;
}

export function act(state, a) {
  if (state.over === 'foreclosed') return fail('gameOver');
  switch (a.type) {
    case 'feed': {
      const pigs = a.penId ? state.pigs.filter((p) => p.penId === a.penId) : state.pigs;
      if (!pigs.length) return fail('noPigs');
      const cost = a.penId ? rules.ap.feedPen : rules.ap.feed;
      if (state.ap < cost) return fail('noAp');
      const fed = feedPigs(state, pigs);
      if (!fed) return fail('noFeed');
      state.ap -= cost;
      return { ok: true, events: [{ type: fed < pigs.length ? 'fedShort' : 'fed', n: fed }] };
    }
    case 'clean': {
      if (!spendAp(state, rules.ap.clean)) return fail('noAp');
      state.pens[a.penId].hygiene = 100;
      for (const p of state.pigs) if (p.penId === a.penId) p.stress = clamp(p.stress - 5, 0, 100);
      return { ok: true, events: [{ type: 'cleaned', penId: a.penId }] };
    }
    case 'pet': {
      const p = findPig(state, a.pigId);
      if (!p) return fail('unknown');
      if (!spendAp(state, rules.ap.pet)) return fail('noAp');
      p.affinity = clamp(p.affinity + 8, 0, 100);
      p.stress = clamp(p.stress - 6, 0, 100);
      return { ok: true, events: [{ type: 'petted', pigId: p.id }] };
    }
    case 'vetCheck': {
      const p = findPig(state, a.pigId);
      if (!p) return fail('unknown');
      if (state.cash < rules.cost.vetCheck) return fail('noCash');
      if (!spendAp(state, rules.ap.vetCheck)) return fail('noAp');
      state.cash -= rules.cost.vetCheck;
      const was = p.sick;
      p.sick = false;
      p.health = clamp(p.health + (was ? 15 : 3), 0, 100);
      return { ok: true, events: [{ type: was ? 'vetCured' : 'vetOk', pigId: p.id }] };
    }
    case 'vetVisit': {
      if (state.cash < rules.cost.vetVisit) return fail('noCash');
      state.cash -= rules.cost.vetVisit;
      let n = 0;
      for (const p of state.pigs) if (p.sick) { p.sick = false; p.health = clamp(p.health + 15, 0, 100); n++; }
      return { ok: true, events: [{ type: 'vetVisit', n }] };
    }
    case 'breed': {
      const pv = previewBreeding(state, a.sireId, a.damId);
      if (!pv.ok) return fail(pv.error);
      if (!spendAp(state, rules.ap.breed)) return fail('noAp');
      const s = findPig(state, a.sireId), d = findPig(state, a.damId);
      s.role = 'breeder'; d.role = 'breeder';
      d.pregnancy = { sire: s.id, dueDay: state.day + rules.gestationDays, F: pv.F };
      return { ok: true, events: [{ type: 'bred', sireId: s.id, damId: d.id }] };
    }
    case 'ship': {
      const pigs = (a.pigIds || []).map((id) => findPig(state, id)).filter((p) => p && canShip(p));
      if (!pigs.length) return fail('noPigs');
      if (!spendAp(state, rules.ap.ship)) return fail('noAp');
      const pens = new Set(pigs.map((p) => p.penId));
      for (const p of pigs) {
        state.truck.push({ pig: p, fast: !!a.fast, mixed: pens.size > 1, shippedDay: state.day });
        state.pigs.splice(state.pigs.indexOf(p), 1);
      }
      return { ok: true, events: [{ type: 'shipped', n: pigs.length }] };
    }
    case 'buyFeed': {
      const price = rules.feedPrice[a.item];
      if (!price || !(a.kg > 0)) return fail('unknown');
      if (!state.unlocks.mixer && MIX_ITEMS.includes(a.item)) return fail('locked');
      const cost = Math.round(price * a.kg);
      if (state.cash < cost) return fail('noCash');
      state.cash -= cost;
      state.feed.stock[a.item] = r1(state.feed.stock[a.item] + a.kg);
      return { ok: true, events: [{ type: 'bought', item: a.item, kg: a.kg }] };
    }
    case 'buyMixer': {
      if (state.unlocks.mixer) return fail('unknown');
      if (state.cash < rules.cost.mixer) return fail('noCash');
      state.cash -= rules.cost.mixer;
      state.unlocks.mixer = true;
      return { ok: true, events: [{ type: 'mixer' }] };
    }
    case 'setFeed': {
      if (a.mode === 'mix') {
        if (!state.unlocks.mixer) return fail('locked');
        if (!previewMix(a.mix).ok) return fail('unknown');
        state.feed.mode = 'mix';
        state.feed.mix = { ...a.mix };
      } else {
        if (!COMMERCIAL.includes(a.commercial)) return fail('unknown');
        state.feed.mode = 'commercial';
        state.feed.commercial = a.commercial;
      }
      return { ok: true, events: [] };
    }
    case 'buyPiglet': {
      const price = rules.piglet[a.breed];
      if (!price) return fail('unknown');
      if (state.pigs.length >= rules.pigCap) return fail('cap', { cap: rules.pigCap });
      if (state.cash < price) return fail('noCash');
      state.cash -= price;
      const p = makePig(state, { breed: a.breed, sex: rand(state) < 0.5 ? 'F' : 'M', ageDays: 12 });
      return { ok: true, events: [{ type: 'boughtPiglet', pigId: p.id }] };
    }
    case 'payDebt': {
      const amt = Math.floor(a.amount);
      if (!(amt > 0)) return fail('unknown');
      if (state.cash < amt) return fail('noCash');
      const pay = Math.min(amt, state.debt.balance);
      state.cash -= pay;
      state.debt.balance -= pay;
      state.debt.paidThisSeason += pay;
      return { ok: true, events: [{ type: 'paid', amount: pay }] };
    }
    default:
      return fail('unknown');
  }
}

// ---------- grading (GDD §1.1, decision 20) ----------
export function gradeCarcass(c) {
  const g1 = c.carcassKg >= 83 && c.carcassKg < 93 && c.backfat >= 17 && c.backfat < 25 ? 3
    : c.carcassKg >= 80 && c.carcassKg < 98 && c.backfat >= 15 && c.backfat < 28 ? 2 : 1;
  let q = 0;
  q += c.imf >= 3.0 ? 3 : c.imf >= 2.0 ? 2 : 1;
  q += c.color >= 3 && c.color <= 5 ? 3 : c.color === 2 || c.color === 6 ? 2 : 1;
  q += c.fatColor <= 2 ? 3 : c.fatColor <= 4 ? 2 : 1;
  q += c.bellyScore >= 0.7 ? 3 : c.bellyScore >= 0.4 ? 2 : 1;
  const g2 = q >= 11 ? 3 : q >= 8 ? 2 : 1;
  let g = Math.min(g1, g2);
  if (c.PSE || c.DFD) g = Math.max(0, g - 2);
  if (g === 3 && c.imf >= 4.0 && c.fatColor <= 1 && !c.PSE) return 'brand';
  return ['out', '2', '1', '1+'][g];
}
export const GRADE_MULT = { brand: 1.45, '1+': 1.15, '1': 1.0, '2': 0.85, out: 0.6 };

function judge(state, t) {
  const p = t.pig;
  const recipe = p.lastRecipe || { grower: 100 };
  const ms = mixStats(recipe);
  const carcassKg = r1(p.weightKg * 0.78);
  const pre = 25 + (t.mixed ? 20 : 0) + (t.fast ? 0 : 10) + p.stress * 0.3;
  const halo = p.genome.RYR1.filter((a) => a === 'n').length;
  const pPSE = [0.02, 0.08, 0.35][halo] * (1 + pre / 50);
  const c = {
    carcassKg, backfat: r1(p.backfatMm), imf: r1(p.imf),
    color: clamp(Math.round(4 + gauss(state) * 0.8 - ms.vitE * 20), 1, 7),
    fatColor: Math.round(clamp(ms.fatColor + gauss(state) * 0.3, 1, 7)),
    bellyScore: clamp(0.55 + (p.backfatMm - 20) * 0.03 + gauss(state) * 0.1, 0, 1),
    PSE: rand(state) < pPSE, DFD: rand(state) < 0.01 + p.stress / 400,
  };
  const grade = gradeCarcass(c);
  const price = Math.round((carcassKg * rules.carcassBasePerKg * GRADE_MULT[grade]) / 100) * 100;
  return { pigId: p.id, nameIndex: p.nameIndex, breed: p.breed, ...c, grade, price };
}

// ---------- day tick ----------
export function endDay(state) {
  const events = [];
  if (state.over === 'foreclosed') return { events, report: null };
  const today = state.day;

  // 1) shipped yesterday or today → graded overnight, paid on arrival of the report
  let report = null;
  if (state.truck.length) {
    const rows = state.truck.map((t) => judge(state, t));
    const total = rows.reduce((s, r) => s + r.price, 0);
    state.cash += total;
    report = { day: today + 1, rows, total };
    state.reports.push(report);
    state.truck = [];
    events.push({ type: 'report' });
  }

  // 2) pigs
  let hungry = 0;
  const newborn = [];
  for (const p of [...state.pigs]) {
    const pen = state.pens[p.penId];
    if (!p.fedToday) { hungry++; p.hunger = clamp(p.hunger + 40, 0, 100); }
    const recipe = p.fedToday ? (p.lastRecipe || { grower: 100 }) : null;
    const ms = recipe ? mixStats(recipe) : null;
    const before = weightForAge(p.ageDays), after = weightForAge(p.ageDays + 1);
    const feedFactor = ms ? clamp(ms.energy, 0.7, 1.15) * clamp(ms.protein, 0.7, 1.1) : 0.3;
    const adg = (after - before) * 1.1 * feedFactor * (1 + p.bv.growth * 0.08) * (p.health / 100) * (1 - p.stress / 200);
    p.weightKg = r1(p.weightKg + adg);
    const ratio = ms ? ms.energy / Math.max(ms.protein, 0.3) : 1;
    p.backfatMm = r1(p.backfatMm + Math.max(0, adg) * clamp(0.18 + 0.1 * (ratio - 1), 0.1, 0.3) * 0.9);
    if (p.ageDays >= 25 && ms) {
      const lys = ms.protein < 0.9 && ms.protein >= 0.7 ? 1.25 : 1;
      p.imf = r1(p.imf + 0.13 * (BREEDS[p.breed]?.imf || 1) * (1 + p.bv.imf * 0.15) * lys * (1 - p.stress / 150));
    }
    pen.hygiene = clamp(pen.hygiene - 2.5, 0, 100);
    p.stress = clamp(p.stress + (pen.hygiene < 40 ? 4 : -2) + (p.hunger > 50 ? 6 : 0), 0, 100);
    const pSick = 0.01 * (1 - pen.hygiene / 100) * (1 + p.stress / 100) * 3;
    if (!p.sick && rand(state) < pSick) { p.sick = true; events.push({ type: 'sick', pigId: p.id }); }
    p.health = clamp(p.health + (p.sick ? -6 : 1) - (p.hunger > 60 ? 4 : 0), 0, 100);
    p.ageDays += 1;
    p.fedToday = false;
    if (p.health <= 0) {
      state.pigs.splice(state.pigs.indexOf(p), 1);
      events.push({ type: 'died', nameIndex: p.nameIndex });
      continue;
    }
    if (p.pregnancy && p.pregnancy.dueDay <= today + 1) newborn.push(p);
  }
  if (hungry) events.push({ type: 'hungry', n: hungry });

  for (const dam of newborn) {
    const sire = findPig(state, dam.pregnancy.sire) || { genome: dam.genome, breed: dam.breed, id: dam.pregnancy.sire };
    const litter = 6 + Math.floor(rand(state) * 5);
    const room = rules.pigCap - state.pigs.length;
    const n = Math.max(0, Math.min(litter, room));
    for (let i = 0; i < n; i++) {
      const pick = (pair) => pair[rand(state) < 0.5 ? 0 : 1];
      const genome = {};
      for (const k of ['KIT', 'MC1R', 'RYR1']) genome[k] = [pick(sire.genome[k]), pick(dam.genome[k])];
      const breed = sire.breed === dam.breed ? dam.breed : 'cross';
      const kid = makePig(state, { breed, sex: rand(state) < 0.5 ? 'F' : 'M', ageDays: 0, sire: sire.id, dam: dam.id, genome, penId: dam.penId });
      kid.F = dam.pregnancy.F;
    }
    events.push({ type: 'born', pigId: dam.id, n });
    if (n < litter) events.push({ type: 'bornCapped', n: litter - n });
    dam.pregnancy = null;
  }

  // 3) debt on the last day of the season
  if (today % rules.seasonDays === 0) {
    const info = debtInfo(state);
    const interest = Math.round(state.debt.balance * rules.debt.interest);
    const missed = state.debt.paidThisSeason < info.minPayment && state.debt.balance > 0;
    state.debt.balance += missed ? interest * 2 : interest;
    if (missed) state.debt.missed++;
    events.push(missed ? { type: 'debtMissed', n: state.debt.missed, interest: interest * 2 } : { type: 'debtOk', interest });
    state.debt.paidThisSeason = 0;
    if (state.debt.missed >= rules.debt.missedLimit) { state.over = 'foreclosed'; events.push({ type: 'foreclosed' }); }
  }
  if (today % rules.yearDays === 0 && !state.over) events.push({ type: 'yearEnd', balance: state.debt.balance, missed: state.debt.missed });

  state.day += 1;
  state.ap = rules.apMax;
  return { events, report };
}

// ---------- save ----------
export function serialize(state) {
  return JSON.stringify({ kind: 'bitdeomi-ranch-save', v: 1, state });
}
export function deserialize(text) {
  const o = JSON.parse(text);
  if (!o || o.kind !== 'bitdeomi-ranch-save' || !o.state || !Array.isArray(o.state.pigs)) throw new Error('bad save');
  return o.state;
}
