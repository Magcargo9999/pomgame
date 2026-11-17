// Boot: load strings, load or start a game, wire HUD, world and screens.
import { loadStrings, t, list, money } from './i18n.js';
import * as sim from './sim.js';
import { createWorld } from './world.js';
import { makeScreens } from './screens.js';
import { h, isModalOpen, isPopupOpen, closePopup, closeModal, toast } from './dom.js';
import { makePigSheets, recolorPixels, slotMap, CELL } from './sprites.js';
import { rampsFor } from './palettes.js';

const SAVE_KEY = 'bitdeomi-ranch-save-v1';

const app = {
  state: null,
  pigName(p) { return this.pigNameByIndex(p.nameIndex); },
  pigNameByIndex(i) {
    const names = list('pigNames');
    if (!names.length) return `#${i + 1}`;
    const round = Math.floor(i / names.length);
    return names[i % names.length] + (round ? ` ${round + 1}` : '');
  },
  eventText(e) {
    const pig = e.pigId ? sim.findPig(this.state, e.pigId) : null;
    const nm = pig ? this.pigName(pig) : e.nameIndex != null ? this.pigNameByIndex(e.nameIndex) : '';
    switch (e.type) {
      case 'born': case 'sick': case 'petted': case 'vetOk': case 'vetCured': case 'boughtPiglet': case 'died':
        return t(`event.${e.type}`, { name: nm, n: e.n });
      case 'bred': {
        const s = sim.findPig(this.state, e.sireId), d = sim.findPig(this.state, e.damId);
        return t('event.bred', { sire: s ? this.pigName(s) : '', dam: d ? this.pigName(d) : '' });
      }
      case 'debtOk': case 'debtMissed': return t(`event.${e.type}`, { n: e.n, interest: money(e.interest) });
      case 'yearEnd': return t('event.yearEnd', { balance: money(e.balance) });
      case 'bornSold': return t('event.bornSold', { n: e.n, amount: money(e.amount) });
      case 'paid': return t('event.paid', { amount: money(e.amount) });
      case 'bought': return t('event.bought', { item: t(`feed.item.${e.item}`), kg: e.kg });
      case 'cleaned': return t('event.cleaned');
      default: return t(`event.${e.type}`, e);
    }
  },
  act(action) {
    const res = sim.act(this.state, action);
    if (!res.ok) toast(t(`err.${res.error}`, { cap: sim.capacity(this.state) }), 'warn');
    for (const e of res.events) {
      if (e.type === 'petted') world?.cheer(e.pigId);
      toast(this.eventText(e), e.type === 'paid' || e.type === 'mixer' ? 'good' : 'info');
    }
    refresh();
    if (res.ok) this.save(false);
    return res;
  },
  endDay() {
    closePopup();
    closeModal(true);
    const { events, report } = sim.endDay(this.state);
    this.save(false);
    refresh();
    screens.morning(events, report);
  },
  save(announce) {
    try {
      localStorage.setItem(SAVE_KEY, sim.serialize(this.state));
      if (announce) toast(t('save.saved'), 'good');
    } catch { /* storage blocked: export still works */ }
  },
  exportFile() {
    const blob = new Blob([sim.serialize(this.state)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `bitdeomi-ranch-day${this.state.day}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importText(text) {
    try {
      this.state = sim.deserialize(text);
      this.save(false);
      closeModal();
      refresh();
      toast(t('save.loaded'), 'good');
    } catch { toast(t('save.bad'), 'warn'); }
  },
  newGame() {
    this.state = sim.newGame({ seed: (Math.random() * 2 ** 31) >>> 0 });
    this.save(false);
    closeModal();
    refresh();
  },
  toast,
  paintPortrait(canvas, pig) {
    if (!canvas) return;
    portraitSheets[pig.ageDays < 13 ? 1 : 0] ||= makePigSheets(pig.ageDays < 13 ? 0.6 : 1);
    const g = portraitSheets[pig.ageDays < 13 ? 1 : 0];
    const map = slotMap(rampsFor(pig.look));
    const img = new ImageData(CELL, CELL);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const si = (y * g.base.w + x) * 4, di = (y * CELL + x) * 4;
      const layer = g.layers[pig.look.pattern];
      const src = layer && layer.data[si + 3] ? layer.data : g.base.data;
      for (let k = 0; k < 4; k++) img.data[di + k] = src[si + k];
    }
    recolorPixels(img.data, map);
    canvas.getContext('2d').putImageData(img, 0, 0);
  },
};
const portraitSheets = [];
let world = null;
let screens = null;

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
function refresh() {
  const st = app.state;
  const d = sim.dateOf(st.day), di = sim.debtInfo(st), due = sim.dateOf(di.dueDay);
  $('hud-date').textContent = t('hud.date', { year: d.year, season: t(`season.${d.season}`), day: d.dayOfSeason });
  $('hud-ap').textContent = t('hud.apValue', { ap: st.ap, max: sim.rules.apMax });
  $('hud-ap-pips').replaceChildren(...Array.from({ length: sim.rules.apMax }, (_, i) => h('i', { class: i < st.ap ? 'on' : '' })));
  $('hud-ap-wrap').setAttribute('aria-label', `${t('hud.ap')} ${t('hud.apValue', { ap: st.ap, max: sim.rules.apMax })}`);
  $('hud-cash').textContent = money(st.cash);
  $('hud-debt').textContent = di.remaining
    ? t('hud.debtValue', { season: t(`season.${due.season}`), day: due.dayOfSeason, amount: money(di.remaining), left: di.daysLeft })
    : t('hud.debtPaid');
  $('hud-debt').parentElement.classList.toggle('urgent', !!di.remaining && di.daysLeft <= 3);
  $('hud-pigs').textContent = t('hud.pigs', { n: st.pigs.length, cap: sim.capacity(st) });
  world?.setState(st);
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
  } catch { /* fresh game */ }
  return sim.newGame({ seed: 20261118 });
}

async function boot() {
  await loadStrings();
  staticText();
  app.state = loadSaved();
  screens = makeScreens(app);
  const canvas = $('world');
  world = await createWorld(canvas, {
    isBlocked: () => isModalOpen() || isPopupOpen(),
    onInteract: (target, pos) => screens.objectMenu(target, pos),
  });
  refresh();
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
  // read-only debug hooks for e2e tests (QA): window.__game.player -> {x, y} in tiles
  window.__ranch = { app, sim, screens };
  window.__game = Object.freeze({ get player() { return world.playerPos(); }, get state() { return app.state; } });
  document.body.dataset.ready = 'true';
}

boot().catch((err) => {
  const el = $('loading');
  if (el) el.textContent = t('loadError', { msg: err.message });
  console.error(err);
});
