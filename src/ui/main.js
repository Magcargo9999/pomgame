// Boot: load strings, load or start a game, wire HUD, world and screens.
// The sim state is opaque; every change goes through sim.doAction / sim.endDay
// and the screen is drawn from sim.getView(state).
import { loadStrings, t, list, money, fmtNum } from './i18n.js';
import * as sim from './sim.js';
import { createWorld } from './world.js';
import { makeScreens } from './screens.js';
import { h, isModalOpen, isPopupOpen, closePopup, closeModal, toast } from './dom.js';
import { makePigSheets, recolorPixels, slotMap, CELL } from './sprites.js';
import { rampsFor, layerFor } from './palettes.js';

const SAVE_KEY = 'bitdeomi-ranch-save';
const QUIET_EVENTS = new Set(['actionDone', 'dayStart']);

const app = {
  state: null,
  view: null,
  names: new Map(), // pigId -> display name, kept after a pig leaves (reports, events)

  // ---------- names & labels ----------
  defaultName(id) {
    const names = list('pigNames');
    const i = Math.max(0, (parseInt(String(id).split('-').pop(), 10) || 1) - 1);
    if (!names.length) return id;
    const round = Math.floor(i / names.length);
    return names[i % names.length] + (round ? ` ${round + 1}` : '');
  },
  pigName(idOrPig) {
    const id = typeof idOrPig === 'string' ? idOrPig : idOrPig?.id;
    if (!id) return t('pig.unknown');
    const p = this.view?.pigs.find((q) => q.id === id);
    return (p && p.name) || this.names.get(id) || this.defaultName(id);
  },
  penName(penId) {
    const i = this.view?.pens.findIndex((p) => p.id === penId) ?? -1;
    return t('pen.name', { n: i >= 0 ? i + 1 : String(penId).split('-').pop() });
  },
  pig(id) { return this.view.pigs.find((p) => p.id === id); },
  dateText(day) {
    const d0 = day - 1, per = sim.config.time.daysPerSeason, seasons = sim.config.time.seasons;
    return t('date.full', { year: Math.floor(d0 / (per * seasons)) + 1, season: t(`season.${Math.floor(d0 / per) % seasons}`), day: (d0 % per) + 1 });
  },
  seasonDayText(day) {
    const d0 = day - 1, per = sim.config.time.daysPerSeason;
    return t('date.seasonDay', { season: t(`season.${Math.floor(d0 / per) % sim.config.time.seasons}`), day: (d0 % per) + 1 });
  },
  itemName(itemId, breedId) {
    return breedId ? t('auction.item', { breed: t(`breed.${breedId}`), item: t(`item.${itemId}`) }) : t(`item.${itemId}`);
  },

  eventText(e) {
    const nm = (id) => this.pigName(id);
    switch (e.type) {
      case 'birth': return [t('event.birth', { name: nm(e.damId), n: (e.pigIds?.length || 0) + (e.soldExtra || 0) }),
        e.stillborn ? t('event.birthStill', { n: e.stillborn }) : '',
        e.soldExtra ? t('event.birthSold', { n: e.soldExtra, amount: money(e.extraCash || 0) }) : ''].filter(Boolean).join(' ');
      case 'bought': return e.pigIds?.length ? t('event.boughtPigs', { item: this.itemName(e.itemId, e.breedId), n: e.pigIds.length }) : t('event.bought', { item: this.itemName(e.itemId) });
      case 'cleaned': case 'unfed': return t(`event.${e.type}`, { pen: this.penName(e.penId) });
      case 'fed': return t(e.partial ? 'event.fedPartial' : 'event.fed', { pen: this.penName(e.penId), kg: e.kg });
      case 'conception': return t('event.conception', { dam: nm(e.damId), date: this.seasonDayText(e.dueDay) });
      case 'conceptionFailed': return t('event.conceptionFailed', { dam: nm(e.damId) });
      case 'mated': return t('event.mated', { dam: nm(e.damId), sire: nm(e.sireId), f: (e.expectedF * 100).toFixed(1) });
      case 'debtDue': return t('event.debtDue', { paid: money(e.paid), interest: money(e.interest), balance: money(e.balance) });
      case 'debtMissed': return t('event.debtMissed', { n: e.missed, arrears: money(e.arrears || 0) });
      case 'debtPaid': return t('event.debtPaid', { amount: money(e.amount), balance: money(e.balance) });
      case 'hired': case 'fired': case 'workerQuit': return t(`event.${e.type}`, { worker: t(`worker.${e.workerId}`) });
      case 'workerMistake': return t('event.workerMistake', { worker: t(`worker.${e.workerId}`), item: t(`item.${e.itemId}`), kg: e.kg });
      case 'gradeReport': return t('event.gradeReport', { name: nm(e.sheet.pigId), grade: t(`gradeLong.${e.sheet.grade}`) });
      case 'marketMove': return t('event.marketMove', { price: money(e.carcassPricePerKg), trend: t(`trend.${e.trend}`) });
      case 'moved': return t('event.moved', { n: e.pigIds.length, pen: this.penName(e.penId) });
      case 'roleSet': return t('event.roleSet', { name: nm(e.pigId), role: t(`role.${e.role}`) });
      case 'shipCancelled': return t('event.shipCancelled', { name: nm(e.pigIds[0]) });
      case 'shipQueued': return t('event.shipQueued', { n: e.pigIds.length, fee: money(e.fee || 0) });
      case 'shipped': return t('event.shipped', { n: e.pigIds.length });
      case 'sickFound': return e.pigIds.length ? t('event.sickFound', { pen: this.penName(e.penId), n: e.pigIds.length }) : t('event.sickFoundNone', { pen: this.penName(e.penId) });
      case 'stageChange': return t('event.stageChange', { name: nm(e.pigId), stage: t(`stage.${e.to}`) });
      case 'treated': return t('event.treated', { name: nm(e.pigId), fee: money(e.fee) });
      case 'vaccinated': return t('event.vaccinated', { pen: this.penName(e.penId), n: e.count });
      case 'wages': return t('event.wages', { amount: money(e.amount) });
      case 'weaned': return t('event.weaned', { name: nm(e.damId) });
      case 'chronic': case 'death': case 'petted': case 'recovered': case 'sickVisible': return t(`event.${e.type}`, { name: nm(e.pigId) });
      default: return t(`event.${e.type}`, e);
    }
  },

  // ---------- sim calls ----------
  actions(target) { return sim.listActions(this.state, target); },
  act(action, { quiet = false } = {}) {
    const r = sim.doAction(this.state, action);
    if (!r.ok) { toast(t(`error.${r.error.code}`), 'warn'); return r; }
    this.state = r.state;
    if (!quiet) for (const e of r.events) {
      if (QUIET_EVENTS.has(e.type)) continue;
      if (e.type === 'petted') world?.cheer(e.pigId);
      toast(this.eventText(e), e.type === 'debtPaid' ? 'good' : 'info');
    }
    this.refresh();
    this.save(false);
    return r;
  },
  endDay() {
    closePopup();
    closeModal(true);
    const { state, events } = sim.endDay(this.state);
    this.state = state;
    this.refresh();
    this.save(false);
    screens.morning(events.filter((e) => !QUIET_EVENTS.has(e.type)));
  },
  refresh() {
    this.view = sim.getView(this.state);
    for (const p of this.view.pigs) this.names.set(p.id, p.name || this.defaultName(p.id));
    renderHud(this.view);
    world?.setView(this.view);
  },

  // ---------- save ----------
  save(announce) {
    try {
      localStorage.setItem(SAVE_KEY, sim.serialize(this.state));
      if (announce) toast(t('save.saved'), 'good');
    } catch { /* storage blocked: file export still works */ }
  },
  exportFile() {
    const blob = new Blob([sim.serialize(this.state)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `bitdeomi-ranch-day${this.view.day}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importText(text) {
    try {
      this.state = sim.deserialize(text);
      this.names.clear();
      this.save(false);
      closeModal();
      this.refresh();
      toast(t('save.loaded'), 'good');
    } catch (err) {
      toast(t(err.message === 'save.version' ? 'error.save.version' : 'error.save.invalid'), 'warn');
    }
  },
  newGame() {
    this.state = sim.createGame((Math.random() * 2 ** 31) >>> 0);
    this.names.clear();
    this.save(false);
    closeModal();
    this.refresh();
  },
  toast,
  paintPortrait(canvas, pig) {
    if (!canvas) return;
    const small = pig.stage === 'suckling' || pig.stage === 'nursery';
    const g = (portraitSheets[small ? 1 : 0] ||= makePigSheets(small ? 0.6 : 1));
    const layer = g.layers[layerFor(pig.appearance.pattern)];
    const img = new ImageData(CELL, CELL);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const si = (y * g.base.w + x) * 4, di = (y * CELL + x) * 4;
      const src = layer && layer.data[si + 3] ? layer.data : g.base.data;
      for (let k = 0; k < 4; k++) img.data[di + k] = src[si + k];
    }
    recolorPixels(img.data, slotMap(rampsFor(pig.appearance)));
    canvas.getContext('2d').putImageData(img, 0, 0);
  },
};
const portraitSheets = [];
let world = null;
let screens = null;

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
function renderHud(v) {
  $('hud-date').textContent = app.dateText(v.day);
  $('hud-ap').textContent = t('hud.apValue', { ap: v.ap.left, max: v.ap.max });
  $('hud-ap-pips').replaceChildren(...Array.from({ length: v.ap.max }, (_, i) => h('i', { class: i < v.ap.left ? 'on' : '' })));
  $('hud-ap-wrap').setAttribute('aria-label', `${t('hud.ap')} ${t('hud.apValue', { ap: v.ap.left, max: v.ap.max })}`);
  $('hud-cash').textContent = money(v.cash);
  const remaining = Math.max(0, (v.debt.minDue ?? v.debt.minPerSeason) - v.debt.paidThisSeason);
  const left = v.debt.nextDueDay - v.day;
  $('hud-debt').textContent = remaining
    ? t('hud.debtValue', { date: app.seasonDayText(v.debt.nextDueDay), amount: money(remaining), left })
    : t('hud.debtPaid');
  $('hud-debt').parentElement.classList.toggle('urgent', !!remaining && left <= 3);
  $('hud-pigs').textContent = t('hud.pigs', { n: v.herd.count, cap: v.herd.places ?? v.herd.max });
  $('hud-market').textContent = t('hud.marketValue', { price: fmtNum(v.market.carcassPricePerKg), trend: t(`trend.${v.market.trend}`) });
}

function staticText() {
  document.title = t('game.title');
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll('[data-t-label]')) el.setAttribute('aria-label', t(el.dataset.tLabel));
}

function loadSaved() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) return sim.deserialize(s);
  } catch { /* old or broken save: start fresh */ }
  return sim.createGame(20261118);
}

async function boot() {
  await loadStrings();
  staticText();
  app.state = loadSaved();
  app.view = sim.getView(app.state);
  screens = makeScreens(app);
  const canvas = $('world');
  world = await createWorld(canvas, {
    isBlocked: () => isModalOpen() || isPopupOpen(),
    onInteract: (target, pos) => screens.objectMenu(target, pos),
  });
  app.refresh();
  $('btn-end').onclick = () => app.endDay();
  $('btn-pigs').onclick = () => screens.pigList();
  $('btn-menu').onclick = () => screens.saveMenu();
  $('btn-town').onclick = () => screens.town('feed');
  window.addEventListener('keydown', (e) => {
    if (isModalOpen() || isPopupOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    const k = { KeyN: () => app.endDay(), KeyP: () => screens.pigList(), KeyM: () => screens.saveMenu(), KeyT: () => screens.town('feed') }[e.code];
    if (k) { e.preventDefault(); k(); }
  });
  $('loading').remove();
  canvas.focus();
  // read-only debug hooks for e2e tests (QA)
  window.__ranch = { app, sim, screens, world };
  window.__game = Object.freeze({ get player() { return world.playerPos(); }, get state() { return app.state; }, get view() { return app.view; } });
  document.body.dataset.ready = 'true';
}

boot().catch((err) => {
  const el = $('loading');
  if (el) el.textContent = t('loadError', { msg: err.message });
  console.error(err);
});
