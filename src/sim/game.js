// Game state, actions and the night (endDay). Public surface is re-exported by index.js. See docs/tech/SIM-API.md.
import { config, items, breeds } from './data.js';
import { makeRng, seedFrom } from './rng.js';
import { randomGenome, breedGenome, mixBreeds, breedIdOf, breedParam, inbreeding, kinship, fRisk, phenotype } from './genetics.js';
import { newPig, weightForAge, ageOf, stageOf, conditionOf, canShip, inMarketWindow, rationKg, tickPig, slaughter } from './pig.js';
import { gradePig } from './grading.js';
import { feedProps, normaliseShares, resolveFeed } from './feed.js';

export const SIM_VERSION = 1;
const SAVE_VERSION = 1;
const DPS = config.time.daysPerSeason;
const YEAR_DAYS = DPS * config.time.seasons;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;

// ---------- creation ----------
export function createGame(seed = 1) {
  const seedNum = seedFrom(seed);
  const rng = makeRng(seedNum);
  const st = config.start;
  const s = {
    saveVersion: SAVE_VERSION, seed: seedNum, rngState: 0, day: 1, phase: 'playing',
    ap: { left: config.ap.base, max: config.ap.base },
    cash: st.cash,
    debt: { balance: config.debt.initial, paidThisSeason: 0, arrears: 0, missed: 0 },
    market: { mult: 1, trend: 0 },
    pens: [], pigs: [], pedigree: {}, nextSerial: 1, nextPen: 1, nextRecipe: 1,
    inventory: { feeds: { ...st.feeds }, ingredients: {}, vaccine: 0 },
    recipes: [], facilities: { piggery: false, feed_mixer: false, lairage: false },
    workers: [], shipments: [], reports: [],
    stats: { shipped: 0, revenue: 0, gradeCounts: { brand: 0, '1+': 0, '1': 0, '2': 0, out: 0 }, deaths: 0, births: 0, soldPiglets: 0 },
  };
  for (let i = 0; i < st.pens; i++) addPen(s, st.penCapacity);
  for (const p of st.piglets) {
    const pig = addFounder(s, rng, p.breedId, p.sex, p.ageDays, s.pens[0].id);
    if (p.role) pig.role = p.role;
  }
  s.pens[0].feed = { kind: 'commercial', id: 'feed_starter' };
  s.rngState = rng.state();
  return s;
}

function addPen(s, capacity) {
  const id = `pen-${s.nextPen++}`;
  s.pens.push({ id, capacity, hygiene: 80, feed: { kind: 'commercial', id: 'feed_grower' }, fedToday: false, fed: null });
  return id;
}

function nextId(s) { const n = s.nextSerial++; return { id: `PIG-${String(n).padStart(4, '0')}`, serial: n }; }

function addFounder(s, rng, breedId, sex, ageDays, penId) {
  const { id, serial } = nextId(s);
  const pig = newPig({
    id, serial, sex, breedMix: { [breedId]: 1 }, genome: randomGenome(breedId, rng),
    bornDay: s.day - ageDays, penId, weightKg: weightForAge(ageDays) * (0.95 + rng() * 0.1),
  });
  s.pigs.push(pig);
  s.pedigree[id] = { sire: null, dam: null, serial };
  return pig;
}

// ---------- helpers ----------
const herdCount = (s) => s.pigs.length;
const penById = (s, id) => s.pens.find((p) => p.id === id);
const pigById = (s, id) => s.pigs.find((p) => p.id === id);
const penPigs = (s, penId) => s.pigs.filter((p) => p.penId === penId);
const freeSpace = (s, pen) => pen.capacity - penPigs(s, pen.id).length;
const totalPlaces = (s) => Math.min(config.herdMax, s.pens.reduce((t, p) => t + p.capacity, 0));
const apMax = (s) => config.ap.base + s.workers.reduce((a, w) => a + items.workers[w.id].apBonus, 0);
const seasonOf = (day) => Math.floor((day - 1) / DPS);
const seasonMin = (s) => config.debt.minPerSeason[seasonOf(s.day) % config.debt.minPerSeason.length];
// Due this season = this season's minimum + unpaid minimums from earlier seasons (arrears).
const minDue = (s) => Math.min(seasonMin(s) + s.debt.arrears, s.debt.balance);
const pricePerKg = (s) => Math.round(config.market.carcassPricePerKg * s.market.mult);

class ActionError extends Error { constructor(code, extra) { super(code); this.code = code; this.extra = extra; } }
const fail = (code, extra) => { throw new ActionError(code, extra); };

function spendAp(s, n) { if (s.ap.left < n) fail('ap.notEnough'); s.ap.left -= n; }
function spendCash(s, n) { if (s.cash < n) fail('cash.notEnough'); s.cash -= n; }
function needPig(s, id) { return pigById(s, id) ?? fail('pig.notFound'); }
function needPen(s, id) { return penById(s, id) ?? fail('pen.notFound'); }

// ---------- actions ----------
const ACTIONS = {
  feedPen(s, a, ev) {
    const pen = needPen(s, a.penId);
    if (pen.fedToday) fail('pen.alreadyFed');
    const res = resolveFeed(s, pen.feed) ?? fail('param.invalid');
    const pigs = penPigs(s, pen.id);
    const need = pigs.reduce((t, p) => t + rationKg(p, s.day), 0);
    if (need <= 0) fail('pen.empty');
    // How much of the ration the stock covers.
    let fraction = 1;
    for (const part of res.stock) {
      const have = s.inventory[part.pool][part.id] ?? 0;
      const want = need * part.share;
      if (want > 0) fraction = Math.min(fraction, have / want);
    }
    if (fraction <= 0) fail('stock.notEnough');
    spendAp(s, 1);
    for (const part of res.stock) {
      const pool = s.inventory[part.pool];
      pool[part.id] = r1(Math.max(0, (pool[part.id] ?? 0) - need * part.share * fraction));
    }
    pen.fedToday = true;
    pen.fed = { fraction: Math.round(fraction * 100) / 100, props: feedProps(res.shares) };
    ev('fed', { penId: pen.id, kg: r1(need * fraction), partial: fraction < 1 });
  },
  setPenFeed(s, a) {
    const pen = needPen(s, a.penId);
    if (!resolveFeed(s, a.feed)) fail('param.invalid');
    pen.feed = { ...a.feed };
  },
  cleanPen(s, a, ev) {
    const pen = needPen(s, a.penId); spendAp(s, 2); pen.hygiene = 100; ev('cleaned', { penId: pen.id });
  },
  inspectPen(s, a, ev) {
    const pen = needPen(s, a.penId); spendAp(s, 1);
    const found = penPigs(s, pen.id).filter((p) => p.disease.state === 'subclinical');
    for (const p of found) p.disease.detected = true;
    ev('sickFound', { penId: pen.id, pigIds: found.map((p) => p.id) });
  },
  treatPig(s, a, ev) {
    const pig = needPig(s, a.pigId);
    const d = pig.disease;
    if (!((d.state === 'subclinical' && d.detected) || d.state === 'clinical')) fail('pig.notSick');
    spendAp(s, 1); spendCash(s, items.services.vetFee);
    d.state = 'recovering'; d.days = 0;
    pig.withdrawalDays = config.disease.withdrawalDays;
    ev('treated', { pigId: pig.id, fee: items.services.vetFee });
  },
  vaccinatePen(s, a, ev) {
    const pen = needPen(s, a.penId);
    const pigs = penPigs(s, pen.id).filter((p) => p.vaccinatedUntil < s.day);
    if (!pigs.length) fail('pen.empty');
    if (s.inventory.vaccine < pigs.length) fail('stock.notEnough');
    spendAp(s, 1);
    s.inventory.vaccine -= pigs.length;
    for (const p of pigs) p.vaccinatedUntil = s.day + config.disease.vaccineDays;
    ev('vaccinated', { penId: pen.id, count: pigs.length });
  },
  petPig(s, a, ev) {
    const pig = needPig(s, a.pigId);
    if (pig.pettedDay === s.day) fail('pig.alreadyPetted');
    spendAp(s, 1);
    pig.pettedDay = s.day; pig.stress = r1(Math.max(0, pig.stress - 15)); pig.affinity = Math.min(100, pig.affinity + 5);
    ev('petted', { pigId: pig.id });
  },
  movePig(s, a, ev) {
    // One pig (pigId) or a group (pigIds) to one pen for 1 AP.
    const ids = a.pigIds ? [...new Set(a.pigIds)] : [a.pigId];
    const pen = needPen(s, a.penId);
    const pigs = ids.map((id) => needPig(s, id));
    if (!pigs.length || pigs.some((p) => p.penId === pen.id)) fail('param.invalid');
    if (freeSpace(s, pen) < pigs.length) fail('pen.full');
    spendAp(s, 1);
    for (const p of pigs) p.penId = pen.id;
    ev('moved', { pigIds: ids, penId: pen.id });
  },
  setRole(s, a, ev) {
    const pig = needPig(s, a.pigId);
    if (!['breeder', 'finisher'].includes(a.role) || pig.role === a.role) fail('param.invalid');
    if (pig.pregnantDueDay != null || pig.lactatingUntil >= s.day) fail('pig.busy');
    if (a.role === 'breeder' && pig.castrated) fail('pig.castrated');
    pig.role = a.role;
    if (a.role === 'finisher' && pig.sex === 'M') pig.castrated = true;
    ev('roleSet', { pigId: pig.id, role: pig.role });
  },
  breed(s, a, ev) {
    const sire = needPig(s, a.sireId); const dam = needPig(s, a.damId);
    const ok = sire.sex === 'M' && dam.sex === 'F' && !sire.castrated
      && stageOf(sire, s.day) === 'breeder' && stageOf(dam, s.day) === 'breeder'
      && sire.disease.state !== 'clinical' && dam.disease.state !== 'clinical' && !dam.matingPending;
    if (!ok) fail('breed.invalid');
    spendAp(s, 2);
    dam.matingPending = sire.id;
    ev('mated', { sireId: sire.id, damId: dam.id, expectedF: Math.round(kinship(s.pedigree, sire.id, dam.id) * 1000) / 1000 });
  },
  shipPigs(s, a, ev) {
    const ids = Array.isArray(a.pigIds) ? [...new Set(a.pigIds)] : fail('param.invalid');
    if (!ids.length) fail('param.invalid');
    if (!['none', 'normal', 'long'].includes(a.fast ?? 'normal')) fail('param.invalid');
    if (a.useLairage && !s.facilities.lairage) fail('facility.missing');
    for (const id of ids) {
      const p = needPig(s, id);
      if (!canShip(p, s.day) || s.shipments.some((x) => x.pigId === id)) fail('pig.notShippable', { pigId: id });
    }
    spendAp(s, 2 + (a.gentle ? 2 : 0));
    const fee = items.services.truckFeePerPig * ids.length; // taken from the sale tonight
    const pens = new Set(ids.map((id) => pigById(s, id).penId));
    const batch = s.shipments.length ? Math.max(...s.shipments.map((x) => x.batch)) + 1 : 1;
    for (const id of ids) s.shipments.push({ pigId: id, fast: a.fast ?? 'normal', gentle: !!a.gentle, useLairage: !!a.useLairage, mixed: pens.size > 1, batch });
    ev('shipQueued', { pigIds: ids, fee });
  },
  cancelShipment(s, a, ev) {
    const i = s.shipments.findIndex((x) => x.pigId === a.pigId);
    if (i < 0) fail('param.invalid');
    s.shipments.splice(i, 1);
    ev('shipCancelled', { pigIds: [a.pigId] });
  },
  buy(s, a, ev) {
    const qty = a.qty ?? 1;
    const bulk = a.itemId in items.commercialFeeds || a.itemId in items.ingredients;
    if (!(qty > 0) || (!bulk && !Number.isInteger(qty))) fail('param.invalid');
    if (a.itemId === 'piglet') {
      const price = items.piglets[a.breedId] ?? fail('param.invalid');
      if (herdCount(s) + qty > totalPlaces(s)) fail('herd.full');
      const pen = a.penId ? needPen(s, a.penId) : s.pens.find((p) => freeSpace(s, p) >= qty);
      if (!pen || freeSpace(s, pen) < qty) fail('pen.full');
      spendCash(s, price * qty);
      const rng = s._rng; const ids = [];
      for (let i = 0; i < qty; i++) {
        const sex = rng.chance(0.5) ? 'F' : 'M';
        const p = addFounder(s, rng, a.breedId, sex, items.pigletAgeDays, pen.id);
        if (sex === 'M') p.castrated = true; // shop boars come castrated; females stay breeder-eligible
        ids.push(p.id);
      }
      ev('bought', { itemId: 'piglet', breedId: a.breedId, qty, cost: price * qty, pigIds: ids });
      return;
    }
    if (a.itemId === 'boar') {
      const price = Math.round(items.piglets[a.breedId] * 2.5) || fail('param.invalid');
      if (herdCount(s) + 1 > totalPlaces(s)) fail('herd.full');
      const pen = s.pens.find((p) => freeSpace(s, p) >= 1) ?? fail('pen.full');
      spendCash(s, price);
      const p = addFounder(s, s._rng, a.breedId, 'M', config.life.matureAt, pen.id);
      p.role = 'breeder';
      ev('bought', { itemId: 'boar', breedId: a.breedId, qty: 1, cost: price, pigIds: [p.id] });
      return;
    }
    if (items.commercialFeeds[a.itemId]) {
      spendCash(s, Math.round(items.commercialFeeds[a.itemId].price * qty));
      s.inventory.feeds[a.itemId] = r1((s.inventory.feeds[a.itemId] ?? 0) + qty);
    } else if (items.ingredients[a.itemId]) {
      if (!s.facilities.feed_mixer) fail('facility.missing');
      spendCash(s, Math.round(items.ingredients[a.itemId].price * qty));
      s.inventory.ingredients[a.itemId] = r1((s.inventory.ingredients[a.itemId] ?? 0) + qty);
    } else if (a.itemId === 'vaccine') {
      spendCash(s, items.vaccine.price * qty); s.inventory.vaccine += qty;
    } else if (a.itemId === 'piggery') {
      if (s.facilities.piggery) fail('facility.owned');
      spendCash(s, items.facilities.piggery.price); s.facilities.piggery = true; addPen(s, items.facilities.piggery.capacity);
    } else if (items.facilities[a.itemId]) {
      if (s.facilities[a.itemId]) fail('facility.owned');
      spendCash(s, items.facilities[a.itemId].price); s.facilities[a.itemId] = true;
    } else fail('param.invalid');
    ev('bought', { itemId: a.itemId, qty, cost: null });
  },
  saveRecipe(s, a, ev) {
    if (!s.facilities.feed_mixer) fail('facility.missing');
    const shares = normaliseShares(a.shares ?? {}) ?? fail('param.invalid');
    if (!Object.keys(shares).some((k) => !items.ingredients[k].additive)) fail('param.invalid');
    let r = a.recipeId && s.recipes.find((x) => x.id === a.recipeId);
    if (!r) { r = { id: `mix-${s.nextRecipe++}`, shares }; s.recipes.push(r); } else r.shares = shares;
    ev('recipeSaved', { recipeId: r.id, props: feedProps(shares) });
  },
  hireWorker(s, a, ev) {
    if (!items.workers[a.workerId] || s.workers.some((w) => w.id === a.workerId)) fail('param.invalid');
    s.workers.push({ id: a.workerId });
    const max = apMax(s); s.ap.left += max - s.ap.max; s.ap.max = max;
    ev('hired', { workerId: a.workerId });
  },
  fireWorker(s, a, ev) {
    const i = s.workers.findIndex((w) => w.id === a.workerId);
    if (i < 0) fail('param.invalid');
    s.workers.splice(i, 1);
    s.ap.max = apMax(s); s.ap.left = Math.min(s.ap.left, s.ap.max);
    ev('fired', { workerId: a.workerId });
  },
  payDebt(s, a, ev) {
    const amt = Math.min(Math.floor(a.amount), s.debt.balance);
    if (!(amt > 0)) fail('param.invalid');
    spendCash(s, amt);
    s.debt.balance -= amt; s.debt.paidThisSeason += amt;
    ev('debtPaid', { amount: amt, balance: s.debt.balance });
  },
  renamePig(s, a) {
    const pig = needPig(s, a.pigId);
    const name = String(a.name ?? '').trim().slice(0, 12);
    pig.name = name || null;
  },
};

const AP_COST = { feedPen: 1, cleanPen: 2, inspectPen: 1, treatPig: 1, vaccinatePen: 1, petPig: 1, movePig: 1, breed: 2, shipPigs: 2 };

/** doAction(state, action) -> { ok, state, events, error? } */
export function doAction(state, action) {
  if (state.phase !== 'playing') return { ok: false, state, events: [], error: { code: 'game.over' } };
  const handler = action && Object.hasOwn(ACTIONS, action.type) ? ACTIONS[action.type] : null;
  if (!handler) return { ok: false, state, events: [], error: { code: 'action.unknown' } };
  const s = structuredClone(state);
  const rng = makeRng(s.rngState);
  Object.defineProperty(s, '_rng', { value: rng, enumerable: false, configurable: true });
  const events = [];
  const ev = (type, data = {}) => events.push({ type, day: s.day, ...data });
  const apBefore = s.ap.left;
  try {
    handler(s, action, ev);
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, state, events: [], error: { code: e.code, ...(e.extra ?? {}) } };
    throw e;
  }
  delete s._rng;
  s.rngState = rng.state();
  events.push({ type: 'actionDone', day: s.day, action: action.type, apSpent: apBefore - s.ap.left });
  return { ok: true, state: s, events };
}

// ---------- listActions ----------
export function listActions(state, target = { kind: 'farm' }) {
  const cands = [];
  const s = state;
  if (target.kind === 'pen') {
    const pen = penById(s, target.id); if (!pen) return [];
    cands.push({ type: 'feedPen', penId: pen.id }, { type: 'cleanPen', penId: pen.id }, { type: 'inspectPen', penId: pen.id },
      { type: 'vaccinatePen', penId: pen.id });
    cands.push({ type: 'setPenFeed', penId: pen.id, _params: { feed: feedOptions(s) }, feed: pen.feed });
  } else if (target.kind === 'pig') {
    const pig = pigById(s, target.id); if (!pig) return [];
    cands.push({ type: 'petPig', pigId: pig.id }, { type: 'treatPig', pigId: pig.id },
      { type: 'setRole', pigId: pig.id, role: pig.role === 'breeder' ? 'finisher' : 'breeder' },
      { type: 'renamePig', pigId: pig.id, name: pig.name ?? 'x' });
    const queued = s.shipments.some((x) => x.pigId === pig.id);
    cands.push(queued ? { type: 'cancelShipment', pigId: pig.id }
      : { type: 'shipPigs', pigIds: [pig.id], fast: 'normal', gentle: false, useLairage: false, _params: { fast: ['none', 'normal', 'long'], gentle: [false, true], useLairage: s.facilities.lairage ? [false, true] : [false] } });
    const pens = s.pens.filter((p) => p.id !== pig.penId);
    cands.push({ type: 'movePig', pigId: pig.id, penId: pens.find((p) => freeSpace(s, p) > 0)?.id ?? pens[0]?.id, _params: { penId: pens.map((p) => p.id) } });
    if (pig.sex === 'F') {
      const sires = s.pigs.filter((p) => p.sex === 'M' && !p.castrated && stageOf(p, s.day) === 'breeder');
      cands.push({ type: 'breed', sireId: sires[0]?.id, damId: pig.id,
        _params: { sireId: sires.map((p) => ({ id: p.id, expectedF: Math.round(kinship(s.pedigree, p.id, pig.id) * 1000) / 1000, risk: fRisk(kinship(s.pedigree, p.id, pig.id)) })), warning: herdCount(s) >= totalPlaces(s) ? 'herd.full' : null } });
    }
  } else if (target.kind === 'shop') {
    return shopList(s).map((x) => ({ type: 'buy', apCost: 0, cost: x.price, enabled: x.enabled, reason: x.reason, params: { itemId: x.itemId, breedId: x.breedId } }));
  } else {
    cands.push({ type: 'payDebt', amount: Math.max(1, minDue(s) - s.debt.paidThisSeason), _params: { amount: 'number' } });
    for (const id of Object.keys(items.workers)) {
      cands.push(s.workers.some((w) => w.id === id) ? { type: 'fireWorker', workerId: id } : { type: 'hireWorker', workerId: id });
    }
    cands.push({ type: 'saveRecipe', shares: { barley: 0.5, corn: 0.3, soybean_meal: 0.2 }, _params: { shares: Object.keys(items.ingredients) } });
  }
  return cands.map((c) => {
    const { _params, ...action } = c;
    const r = doAction(state, action);
    const info = { type: c.type, apCost: AP_COST[c.type] ?? 0, enabled: r.ok, params: { ...action } };
    delete info.params.type;
    if (_params) info.options = _params;
    if (c.type === 'shipPigs') info.apCost = 2;
    if (!r.ok) info.reason = r.error.code;
    return info;
  });
}

function feedOptions(s) {
  return [...Object.keys(items.commercialFeeds).map((id) => ({ kind: 'commercial', id })),
    ...s.recipes.map((r) => ({ kind: 'mix', recipeId: r.id }))];
}

function shopList(s) {
  const out = [];
  const full = herdCount(s) >= totalPlaces(s);
  for (const [breedId, price] of Object.entries(items.piglets)) {
    out.push({ itemId: 'piglet', breedId, price, unit: 'head', enabled: !full && s.cash >= price, reason: full ? 'herd.full' : s.cash < price ? 'cash.notEnough' : undefined });
    const bp = Math.round(price * 2.5);
    out.push({ itemId: 'boar', breedId, price: bp, unit: 'head', enabled: !full && s.cash >= bp, reason: full ? 'herd.full' : s.cash < bp ? 'cash.notEnough' : undefined });
  }
  for (const [id, f] of Object.entries(items.commercialFeeds)) out.push({ itemId: id, price: f.price, unit: 'kg', enabled: true });
  for (const [id, f] of Object.entries(items.ingredients)) out.push({ itemId: id, price: f.price, unit: 'kg', enabled: s.facilities.feed_mixer, reason: s.facilities.feed_mixer ? undefined : 'facility.missing' });
  out.push({ itemId: 'vaccine', price: items.vaccine.price, unit: 'dose', enabled: true });
  for (const [id, f] of Object.entries(items.facilities)) {
    const owned = s.facilities[id];
    out.push({ itemId: id, price: f.price, unit: 'unit', enabled: !owned && s.cash >= f.price, reason: owned ? 'facility.owned' : s.cash < f.price ? 'cash.notEnough' : undefined });
  }
  return out;
}

// ---------- the night ----------
export function endDay(state) {
  if (state.phase !== 'playing') return { state, events: [] };
  const s = structuredClone(state);
  const rng = makeRng(s.rngState);
  const events = [];
  const ev = (type, data = {}) => events.push({ type, day: s.day, ...data });
  const day = s.day;

  // Worker slips.
  for (const w of s.workers) {
    if (rng.chance(items.workers[w.id].mistakeRate)) {
      const feeds = Object.keys(s.inventory.feeds).filter((k) => s.inventory.feeds[k] > 0);
      if (feeds.length) { const k = rng.pick(feeds); const lost = r1(s.inventory.feeds[k] * 0.1); s.inventory.feeds[k] = r1(s.inventory.feeds[k] - lost); ev('workerMistake', { workerId: w.id, kind: 'spilledFeed', itemId: k, kg: lost }); }
    }
  }

  // Shipments: truck leaves tonight, grade sheet in the morning.
  const price = pricePerKg(s);
  for (const sh of s.shipments) {
    const pig = pigById(s, sh.pigId); if (!pig) continue;
    const c = slaughter(pig, sh, rng);
    const g = gradePig({ ...c });
    const mult = config.grades[g.grade];
    const truckFee = items.services.truckFeePerPig;
    const revenue = Math.round(c.carcassKg * price * mult) - truckFee;
    s.cash += revenue;
    const sheet = { pigId: pig.id, name: pig.name, breedId: breedIdOf(pig.breedMix), day: day + 1, liveKg: c.liveKg, carcassKg: c.carcassKg,
      backfatMm: c.backfat, imf: c.imf, meatColor: c.meatColor, fatColor: c.fatColor, bellyScore: c.bellyScore, PSE: c.PSE, DFD: c.DFD,
      defect: c.defect, grade1: g.grade1, grade2: g.grade2, grade: g.grade, pricePerKg: Math.round(price * mult), truckFee, revenue };
    s.reports.unshift(sheet);
    s.stats.shipped++; s.stats.revenue += revenue; s.stats.gradeCounts[g.grade]++;
    s.pigs = s.pigs.filter((p) => p.id !== pig.id);
    ev('gradeReport', { sheet });
  }
  if (s.shipments.length) ev('shipped', { pigIds: s.shipments.map((x) => x.pigId) });
  s.shipments = [];
  s.reports = s.reports.slice(0, 20);

  // Matings → conception.
  for (const dam of s.pigs) {
    if (!dam.matingPending) continue;
    const sireId = dam.matingPending; dam.matingPending = null;
    const p = config.conception * (1 - dam.F * config.inbreedingDepression.litter);
    if (pigById(s, sireId) && rng.chance(p)) {
      dam.pregnantDueDay = day + config.life.gestation; dam.pregnantBy = sireId;
      ev('conception', { sireId, damId: dam.id, dueDay: dam.pregnantDueDay });
    } else ev('conceptionFailed', { sireId, damId: dam.id });
  }

  // Daily tick per pen.
  const dead = [];
  for (const pen of s.pens) {
    const pigs = penPigs(s, pen.id);
    const bodies = pigs.reduce((t, p) => t + (stageOf(p, day) === 'suckling' ? 0.3 : 1), 0);
    const density = bodies / pen.capacity;
    const needsFeed = pigs.some((p) => rationKg(p, day) > 0);
    if (needsFeed && !pen.fedToday) ev('unfed', { penId: pen.id });
    for (const pig of pigs) {
      const damNursing = !!(pig.damId && pigById(s, pig.damId)?.lactatingUntil >= day);
      const res = tickPig(pig, { day, pen: { hygiene: pen.hygiene, density }, fed: pen.fedToday ? pen.fed : null, damNursing }, rng);
      for (const r of res) {
        if (r === 'died') dead.push({ pig, cause: pig.disease.state === 'clinical' ? 'disease' : 'health' });
        else if (r === 'clinical') ev('sickVisible', { pigId: pig.id });
        else if (r === 'recovered') ev('recovered', { pigId: pig.id });
        else if (r === 'chronic') ev('chronic', { pigId: pig.id });
      }
    }
    pen.hygiene = Math.round(clamp(pen.hygiene - 2 - 2.5 * bodies, 0, 100));
    pen.fedToday = false; pen.fed = null;
  }
  for (const d of dead) { s.pigs = s.pigs.filter((p) => p !== d.pig); s.stats.deaths++; ev('death', { pigId: d.pig.id, cause: d.cause }); }

  // Births (due tonight).
  for (const dam of [...s.pigs]) {
    if (dam.pregnantDueDay == null || dam.pregnantDueDay > day) continue;
    const sire = { id: dam.pregnantBy, ...(s.pedigree[dam.pregnantBy] ?? {}) };
    const sirePig = pigById(s, dam.pregnantBy);
    const sireGenome = sirePig?.genome ?? s.pedigree[dam.pregnantBy]?.genome ?? dam.genome;
    const sireMix = sirePig?.breedMix ?? s.pedigree[dam.pregnantBy]?.breedMix ?? dam.breedMix;
    const sireF = sirePig?.F ?? 0;
    dam.pregnantDueDay = null; dam.pregnantBy = null;
    dam.lactatingUntil = day + 1 + config.life.weanAt;
    const mix = mixBreeds(sireMix, dam.breedMix);
    const litterBv = ((sireGenome?.bv.litter ?? 0) + dam.genome.bv.litter) / 2;
    const n = Math.max(1, Math.round(breedParam(dam.breedMix, 'litterBase') * (1 + litterBv * 0.05) * (1 - dam.F * config.inbreedingDepression.litter) + rng.gauss() * 1.5));
    const ids = []; let stillborn = 0, soldExtra = 0;
    for (let i = 0; i < n; i++) {
      const { id, serial } = nextId(s);
      s.pedigree[id] = { sire: sire.id, dam: dam.id, serial };
      const F = inbreeding(s.pedigree, id);
      if (!rng.chance(0.95 * (1 - F * config.inbreedingDepression.survival))) { stillborn++; delete s.pedigree[id]; continue; }
      const home = [penById(s, dam.penId), ...s.pens].find((p) => p && freeSpace(s, p) > 0);
      if (!home || herdCount(s) >= config.herdMax) { soldExtra++; delete s.pedigree[id]; continue; }
      const genome = breedGenome(sireGenome, dam.genome, (sireF + dam.F) / 2, rng);
      const pig = newPig({ id, serial, sex: rng.chance(0.5) ? 'F' : 'M', breedMix: mix, genome, F: Math.round(F * 10000) / 10000,
        sireId: sire.id, damId: dam.id, bornDay: day + 1, penId: home.id, weightKg: config.life.birthKg * (0.85 + rng() * 0.3) });
      s.pigs.push(pig); ids.push(id);
    }
    const extraCash = soldExtra * items.weanedPigletSalePrice;
    s.cash += extraCash;
    s.stats.births += ids.length; s.stats.soldPiglets += soldExtra;
    ev('birth', { damId: dam.id, pigIds: ids, stillborn, soldExtra, extraCash });
  }

  // Keep genome/breed of breeders in the pedigree so offspring of sold sires still work.
  for (const p of s.pigs) if (!p.castrated && p.sex === 'M' && stageOf(p, day) === 'breeder') {
    s.pedigree[p.id].genome = p.genome; s.pedigree[p.id].breedMix = p.breedMix;
  }

  // Stage changes and weaning, seen from tomorrow.
  for (const p of s.pigs) {
    const a = stageOf(p, day), b = stageOf(p, day + 1);
    if (a !== b && ageOf(p, day + 1) > 0) {
      if (a === 'lactating') ev('weaned', { damId: p.id });
      ev('stageChange', { pigId: p.id, from: a, to: b });
    }
  }

  // Wages.
  let wages = 0;
  for (const w of [...s.workers]) {
    const wage = items.workers[w.id].wage;
    if (s.cash >= wage) { s.cash -= wage; wages += wage; }
    else { s.workers = s.workers.filter((x) => x !== w); ev('workerQuit', { workerId: w.id }); }
  }
  if (wages) ev('wages', { amount: wages });

  // Market.
  const M = config.market;
  const old = s.market.mult;
  s.market.mult = clamp(old - M.meanRevert * (old - 1) + rng.gauss() * M.dailyVol, M.minMult, M.maxMult);
  s.market.trend = s.market.mult > old + 0.004 ? 1 : s.market.mult < old - 0.004 ? -1 : 0;
  ev('marketMove', { carcassPricePerKg: pricePerKg(s), trend: s.market.trend });

  // Debt day.
  if (day % DPS === 0) payday(s, ev);

  // Next day.
  s.day = day + 1;
  s.ap.max = apMax(s); s.ap.left = s.ap.max;
  if (s.phase === 'playing' && day >= YEAR_DAYS) {
    s.phase = 'yearComplete';
    ev('yearComplete', { summary: { cash: s.cash, debt: s.debt.balance, missed: s.debt.missed, ...s.stats } });
  }
  s.rngState = rng.state();
  events.push({ type: 'dayStart', day: s.day });
  return { state: s, events };
}

function payday(s, ev) {
  // Decision 27: the minimum due (this season + arrears) must be paid in full by payday, or it is a miss.
  // Full payment resets the count; 3 misses in a row = foreclosure. The sim auto-pays if cash allows.
  const d = s.debt;
  let due = Math.max(0, minDue(s) - d.paidThisSeason);
  let missedNow = false;
  if (due > 0 && s.cash >= due) { s.cash -= due; d.balance -= due; d.paidThisSeason += due; due = 0; }
  if (due > 0) { missedNow = true; d.missed++; d.arrears = due; ev('debtMissed', { missed: d.missed, arrears: due }); }
  else { d.missed = 0; d.arrears = 0; }
  const interest = Math.round(d.balance * config.debt.ratePerSeason * (missedNow ? config.debt.lateRateMult : 1));
  d.balance += interest;
  ev('debtDue', { paid: d.paidThisSeason, interest, balance: d.balance, missed: d.missed, arrears: d.arrears });
  d.paidThisSeason = 0;
  if (d.missed >= config.debt.maxMissed) { s.phase = 'foreclosed'; ev('foreclosed'); }
}

// ---------- view ----------
export function getView(s) {
  return {
    simVersion: SIM_VERSION, phase: s.phase,
    day: s.day, year: 1 + Math.floor((s.day - 1) / YEAR_DAYS), season: seasonOf(s.day) % config.time.seasons, dayOfSeason: ((s.day - 1) % DPS) + 1,
    ap: { ...s.ap }, cash: s.cash,
    debt: { balance: s.debt.balance, ratePerSeason: config.debt.ratePerSeason, minPerSeason: seasonMin(s), arrears: s.debt.arrears, minDue: minDue(s), paidThisSeason: s.debt.paidThisSeason,
      nextDueDay: Math.ceil(s.day / DPS) * DPS, missed: s.debt.missed, maxMissed: config.debt.maxMissed },
    market: { carcassPricePerKg: pricePerKg(s), trend: s.market.trend, gradeMultipliers: { ...config.grades } },
    herd: { count: s.pigs.length, max: config.herdMax, places: totalPlaces(s) },
    pens: s.pens.map((p) => ({ id: p.id, capacity: p.capacity, hygiene: p.hygiene, feed: { ...p.feed }, fedToday: p.fedToday, pigIds: penPigs(s, p.id).map((x) => x.id) })),
    pigs: s.pigs.map((p) => ({
      id: p.id, name: p.name, breedId: breedIdOf(p.breedMix), breedMix: { ...p.breedMix }, sex: p.sex, castrated: p.castrated,
      ageDays: ageOf(p, s.day), stage: stageOf(p, s.day), role: p.role, penId: p.penId,
      weightKg: p.weightKg, backfatMm: p.backfatMm, health: p.health, stress: p.stress, hunger: p.hunger,
      hygiene: penById(s, p.penId)?.hygiene ?? 0, affinity: p.affinity,
      condition: conditionOf(p), withdrawalDays: p.withdrawalDays, vaccinated: p.vaccinatedUntil >= s.day,
      pregnantDueDay: p.pregnantDueDay, marketWindow: inMarketWindow(p, s.day),
      shippable: canShip(p, s.day) && !s.shipments.some((x) => x.pigId === p.id), shipQueued: s.shipments.some((x) => x.pigId === p.id),
      appearance: phenotype(p.genome), F: p.F, fRisk: fRisk(p.F),
      // Decision 31: no gene lab in the prototype; genotype and breeding values never leave the sim.
      sireId: p.sireId, damId: p.damId, pedigree: pedigree2(s, p.id),
    })),
    inventory: structuredClone(s.inventory), recipes: structuredClone(s.recipes), facilities: { ...s.facilities },
    workers: s.workers.map((w) => ({ id: w.id, wage: items.workers[w.id].wage, apBonus: items.workers[w.id].apBonus })),
    workerOffers: Object.entries(items.workers).map(([id, w]) => ({ id, wage: w.wage, apBonus: w.apBonus, hired: s.workers.some((x) => x.id === id) })),
    shipments: s.shipments.map((x) => ({ pigId: x.pigId, fast: x.fast, gentle: x.gentle, useLairage: x.useLairage })),
    reports: structuredClone(s.reports), shop: shopList(s), stats: structuredClone(s.stats),
  };
}

/** Two generations: parents and grandparents (ids, null when unknown). */
function pedigree2(s, id) {
  const ped = s.pedigree; const me = ped[id] ?? {};
  const up = (pid) => (pid ? { id: pid, sireId: ped[pid]?.sire ?? null, damId: ped[pid]?.dam ?? null } : null);
  return { sire: up(me.sire), dam: up(me.dam) };
}

// ---------- save / load ----------
export function serialize(s) { return JSON.stringify(s); }
export function deserialize(str) {
  let s;
  try { s = JSON.parse(str); } catch { throw new Error('save.invalid'); }
  if (!s || typeof s !== 'object' || !Array.isArray(s.pigs) || typeof s.day !== 'number') throw new Error('save.invalid');
  if (s.saveVersion !== SAVE_VERSION) throw new Error('save.version');
  return s;
}

export { breeds };
