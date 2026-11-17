// All dialogs and menus. Each screen reads app.state and calls app.act(...).
import { h, openModal, closeModal, openPopup } from './dom.js';
import { t, money, fmtNum } from './i18n.js';
import * as sim from './sim.js';

export function makeScreens(app) {
  const S = () => app.state;
  const name = (p) => app.pigName(p);
  const stageName = (p) => t(`stage.${sim.stageOf(p)}`);
  const breedName = (b) => t(`breed.${b}`);
  const lookName = (l) => t(`look.${l.coat}`) + t(`pattern.${l.pattern}`);
  const apBtn = (label, cost, onclick, extra = {}) =>
    h('button', { class: 'btn', onclick, disabled: S().ap < cost || extra.disabled }, label, cost ? h('small', { class: 'cost', text: ` · ${t('apCost', { n: cost })}` }) : null);
  const bar = (v, warnHigh = false) => h('span', { class: 'meter' },
    h('span', { class: `bar${(warnHigh ? v > 60 : v < 40) ? ' warn' : ''}`, role: 'meter', 'aria-valuenow': Math.round(v), 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('span', { class: 'fill', style: `width:${Math.round(v)}%` })),
    h('span', { class: 'num', text: Math.round(v) }));

  // ---------- context menus ----------
  function objectMenu(target, pos) {
    const r = sim.rules;
    if (target.kind === 'pig') {
      const p = sim.findPig(S(), target.pigId);
      if (!p) return;
      return openPopup({ ...pos, title: `${name(p)} · ${breedName(p.breed)}`, items: [
        { label: t('menu.pig.detail'), run: () => pigDetail(p.id) },
        { label: t('menu.pig.pet'), hint: t('apCost', { n: r.ap.pet }), disabled: S().ap < r.ap.pet, run: () => app.act({ type: 'pet', pigId: p.id }) },
        { label: t('menu.pig.vet'), hint: t('apCost', { n: r.ap.vetCheck }), disabled: S().ap < r.ap.vetCheck, run: () => app.act({ type: 'vetCheck', pigId: p.id }) },
        { label: t('menu.pig.breed'), disabled: !sim.canBreed(p), run: () => breeding(p.id) },
        { label: t('menu.pig.ship'), disabled: !sim.canShip(p), run: () => shipping([p.id]) },
      ] });
    }
    const items = {
      house: [
        { label: t('menu.house.sleep'), run: () => app.endDay() },
        { label: t('menu.house.save'), run: () => saveMenu() },
      ],
      shed: [
        { label: t('menu.shed.feedAll'), hint: t('apCost', { n: r.ap.feed }), disabled: S().ap < r.ap.feed, run: () => app.act({ type: 'feed' }) },
        { label: t('menu.shed.mix'), run: () => feedScreen() },
      ],
      pen: !sim.penCapacity(S(), target.penId) ? [{ label: t('pen.locked'), disabled: true, run: () => {} }] : [
        { label: t('menu.pen.feed'), hint: t('apCost', { n: r.ap.feedPen }), disabled: S().ap < r.ap.feedPen, run: () => app.act({ type: 'feed', penId: target.penId }) },
        { label: t('menu.pen.clean'), hint: t('apCost', { n: r.ap.clean }), disabled: S().ap < r.ap.clean, run: () => app.act({ type: 'clean', penId: target.penId }) },
        { label: t('menu.pen.list'), run: () => pigList(target.penId) },
      ],
      dock: [{ label: t('menu.dock.ship'), run: () => shipping() }],
      gate: [{ label: t('menu.gate.town'), run: () => town('feed') }],
    }[target.kind];
    const penCount = target.kind === 'pen' ? S().pigs.filter((p) => p.penId === target.penId).length : 0;
    const title = target.kind === 'pen'
      ? `${t('obj.pen', { name: t(`pen.${target.penId}`) })} · ${t('pen.places', { n: penCount, cap: sim.penCapacity(S(), target.penId) })} · ${t('pig.hygiene')} ${Math.round(S().pens[target.penId].hygiene)}`
      : t(`obj.${target.kind}`);
    if (items) openPopup({ ...pos, title, items });
  }

  // ---------- pig list / detail ----------
  function pigList(penId) {
    const pigs = S().pigs.filter((p) => !penId || p.penId === penId);
    const body = pigs.length ? h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, ['name', 'breed', 'age', 'weight', 'stage', 'health'].map((c) => h('th', { scope: 'col', text: t(`pigs.col.${c}`) })))),
      h('tbody', {}, pigs.map((p) => h('tr', {},
        h('td', {}, h('button', { class: 'link', onclick: () => pigDetail(p.id) }, `${p.sex === 'F' ? '♀' : '♂'} ${name(p)}`),
          sim.inMarketWindow(p) ? h('span', { class: 'badge good', text: t('pigs.marketReady') }) : null,
          p.sick ? h('span', { class: 'badge bad', text: t('pigs.sick') }) : null),
        h('td', { text: breedName(p.breed) }),
        h('td', { text: t('pigs.ageDays', { n: p.ageDays }) }),
        h('td', { class: 'num', text: t('kg', { n: p.weightKg.toFixed(1) }) }),
        h('td', { text: stageName(p) }),
        h('td', {}, bar(p.health))))))
      : h('p', { text: t('pigs.empty') });
    openModal({ title: penId ? `${t('pigs.title')} · ${t('obj.pen', { name: t(`pen.${penId}`) })}` : t('pigs.title'), body, wide: true, closeLabel: t('close') });
  }

  function pigDetail(id) {
    const p = sim.findPig(S(), id);
    if (!p) return;
    const r = sim.rules;
    const parent = (pid) => { const q = sim.findPig(S(), pid); return q ? name(q) : pid; };
    const rows = [
      ['pig.breed', `${breedName(p.breed)} · ${lookName(p.look)}`],
      ['pig.sex', t(`sex.${p.sex}`)],
      ['pig.age', t('pigs.ageDays', { n: p.ageDays })],
      ['pig.stage', stageName(p)],
      ['pig.pen', t(`pen.${p.penId}`)],
      ['pig.weight', t('kg', { n: p.weightKg.toFixed(1) })],
      ['pig.backfat', t('mm', { n: p.backfatMm.toFixed(1) })],
      ['pig.health', bar(p.health)],
      ['pig.stress', bar(p.stress, true)],
      ['pig.hygiene', bar(S().pens[p.penId].hygiene)],
      ['pig.hunger', bar(p.hunger, true)],
      ['pig.affinity', bar(p.affinity)],
      ['pig.parents', p.sire || p.dam ? `${parent(p.sire)} × ${parent(p.dam)}` : t('pig.parentsUnknown')],
      ['pig.genotype', S().unlocks.geneLab ? '' : t('pig.genotypeLocked')],
    ];
    const body = h('div', { class: 'detail' },
      h('canvas', { class: 'portrait', width: 32, height: 32, 'aria-hidden': 'true', 'data-pig': p.id }),
      h('dl', {}, rows.map(([k, v]) => [h('dt', { text: t(k) }), h('dd', {}, v)])),
      p.pregnancy ? h('p', { class: 'note', text: t('pig.pregnant', { n: p.pregnancy.dueDay - S().day }) }) : null,
      h('p', { class: 'note', text: t('pig.window', { from: r.marketWindow[0], to: r.marketWindow[1] }) }),
      h('div', { class: 'actions' },
        apBtn(t('menu.pig.pet'), r.ap.pet, () => { app.act({ type: 'pet', pigId: p.id }); pigDetail(p.id); }),
        apBtn(t('menu.pig.vet'), r.ap.vetCheck, () => { app.act({ type: 'vetCheck', pigId: p.id }); pigDetail(p.id); }),
        h('button', { class: 'btn', disabled: !sim.canBreed(p), onclick: () => breeding(p.id) }, t('menu.pig.breed')),
        h('button', { class: 'btn', disabled: !sim.canShip(p), onclick: () => shipping([p.id]) }, t('menu.pig.ship'))));
    const box = openModal({ title: t('pig.title', { name: name(p) }), body, closeLabel: t('close') });
    app.paintPortrait(box.querySelector('canvas.portrait'), p);
  }

  // ---------- breeding ----------
  function breeding(preId) {
    const ready = S().pigs.filter(sim.canBreed);
    const sires = ready.filter((p) => p.sex === 'M'), dams = ready.filter((p) => p.sex === 'F');
    if (!sires.length || !dams.length) return openModal({ title: t('breed.title'), body: h('p', { text: t('breed.none') }), closeLabel: t('close') });
    const pre = sim.findPig(S(), preId);
    const opt = (p) => h('option', { value: p.id, selected: pre && pre.id === p.id }, `${name(p)} · ${breedName(p.breed)} · ${t('kg', { n: p.weightKg.toFixed(0) })}`);
    const sSel = h('select', { id: 'sire' }, sires.map(opt));
    const dSel = h('select', { id: 'dam' }, dams.map(opt));
    const out = h('div', { class: 'preview', 'aria-live': 'polite' });
    const go = apBtn(t('breed.go'), sim.rules.ap.breed, () => {
      const res = app.act({ type: 'breed', sireId: sSel.value, damId: dSel.value });
      if (res.ok) closeModal();
    });
    // ruling O5: phenotype + 2-generation pedigree + expected F; genotype never shown
    const nameOf = (id) => { const q = id && sim.findPig(S(), id); return q ? name(q) : id ? id : t('breed.unknownParent'); };
    const parentOf = (id, k) => sim.findPig(S(), id)?.[k] || null;
    const ped = (p) => h('div', { class: 'ped' },
      h('strong', { text: name(p) }), h('small', { class: 'muted', text: ` · ${breedName(p.breed)} · ${t('breed.look')}: ${lookName(p.look)}` }),
      !p.sire && !p.dam ? h('p', { class: 'muted small', text: t('pig.parentsUnknown') }) : h('ul', {},
        h('li', {}, `♂ ${nameOf(p.sire)}`, h('small', { class: 'muted', text: ` (${nameOf(parentOf(p.sire, 'sire'))} × ${nameOf(parentOf(p.sire, 'dam'))})` })),
        h('li', {}, `♀ ${nameOf(p.dam)}`, h('small', { class: 'muted', text: ` (${nameOf(parentOf(p.dam, 'sire'))} × ${nameOf(parentOf(p.dam, 'dam'))})` }))));
    const upd = () => {
      const pv = sim.previewBreeding(S(), sSel.value, dSel.value);
      const sp = sim.findPig(S(), sSel.value), dp = sim.findPig(S(), dSel.value);
      out.replaceChildren(...[
        h('p', { class: 'muted small', text: t('breed.pedigree') }),
        h('div', { class: 'peds' }, sp ? ped(sp) : null, dp ? ped(dp) : null),
        pv.ok
          ? h('p', {}, `${t('breed.F')}: ${(pv.F * 100).toFixed(2)}% `, h('span', { class: `badge risk-${pv.risk}`, text: t(`breed.risk.${pv.risk}`) }), h('br'), t('breed.gestation', { n: pv.gestationDays }))
          : h('p', { class: 'warn', text: t(`err.${pv.error}`) }),
        sim.freePlaces(S()) ? null : h('p', { class: 'warn', text: t('breed.fullWarn') })].filter(Boolean));
      go.disabled = !pv.ok || S().ap < sim.rules.ap.breed;
    };
    sSel.onchange = upd; dSel.onchange = upd;
    openModal({ title: t('breed.title'), closeLabel: t('close'), body: h('div', { class: 'form' },
      h('label', { for: 'sire', text: t('breed.sire') }), sSel,
      h('label', { for: 'dam', text: t('breed.dam') }), dSel, out, h('div', { class: 'actions' }, go)) });
    upd();
  }

  // ---------- feed mixing ----------
  function feedScreen() {
    const st = S(), f = st.feed;
    const stock = (k) => h('small', { class: 'muted', text: ` ${t('feed.stock')} ${t('kg', { n: fmtNum(f.stock[k]) })}` });
    const need = h('p', { class: 'note', text: t('feed.daily', { kg: sim.dailyFeedKg(st) }) });
    const commercial = h('fieldset', {}, h('legend', { text: t('feed.commercial') }),
      sim.COMMERCIAL.map((k) => h('label', { class: 'radio' },
        h('input', { type: 'radio', name: 'com', value: k, checked: f.mode === 'commercial' && f.commercial === k,
          onchange: () => { app.act({ type: 'setFeed', mode: 'commercial', commercial: k }); feedScreen(); } }),
        t(`feed.item.${k}`), stock(k))));
    let mixer;
    if (!st.unlocks.mixer) mixer = h('fieldset', {}, h('legend', { text: t('feed.mixer') }), h('p', { class: 'muted', text: t('feed.mixerLocked') }));
    else {
      const mix = { ...f.mix };
      const pv = h('div', { class: 'preview', 'aria-live': 'polite' });
      const apply = h('button', { class: 'btn' }, t('feed.apply'));
      const upd = () => {
        const m = sim.previewMix(mix);
        const fc = m.fatColor <= 2 ? 'good' : m.fatColor <= 4 ? 'ok' : 'bad';
        pv.replaceChildren(
          h('p', {}, `${t('feed.total', { n: Math.round(m.total) })} · ${t('feed.energy')} ${m.energy.toFixed(2)} · ${t('feed.protein')} ${m.protein.toFixed(2)} · ${t('feed.fatColor')}: `,
            h('span', { class: `badge ${fc === 'bad' ? 'bad' : fc === 'good' ? 'good' : ''}`, text: t(`feed.fatColor.${fc}`) })),
          m.ok ? '' : h('p', { class: 'warn', text: t('feed.mustBe100') }));
        apply.disabled = !m.ok;
      };
      apply.onclick = () => { app.act({ type: 'setFeed', mode: 'mix', mix }); feedScreen(); };
      mixer = h('fieldset', {}, h('legend', { text: t('feed.mixer') }),
        sim.MIX_ITEMS.map((k) => {
          const id = `mix-${k}`;
          const num = h('input', { type: 'number', min: 0, max: 100, step: 1, value: mix[k], id, class: 'pct', 'aria-label': t(`feed.item.${k}`) });
          const rng = h('input', { type: 'range', min: 0, max: k === 'vitE' ? 10 : 100, step: 1, value: mix[k], 'aria-label': t(`feed.item.${k}`) });
          const set = (v) => { mix[k] = Math.max(0, Math.min(100, Math.round(+v || 0))); num.value = mix[k]; rng.value = mix[k]; upd(); };
          num.oninput = () => set(num.value); rng.oninput = () => set(rng.value);
          return h('div', { class: 'mixrow' }, h('label', { for: id }, t(`feed.item.${k}`), stock(k)), rng, num, h('span', { text: '%' }));
        }),
        pv, h('div', { class: 'actions' }, apply));
      setTimeout(upd);
    }
    const cur = f.mode === 'mix' ? t('feed.mixer') : t(`feed.item.${f.commercial}`);
    openModal({ title: t('feed.title'), wide: true, closeLabel: t('close'), body: h('div', { class: 'form' },
      h('p', {}, h('strong', { text: `${t('feed.current')}: ` }), cur), need, commercial, mixer,
      h('div', { class: 'actions' }, apBtn(t('menu.shed.feedAll'), sim.rules.ap.feed, () => { app.act({ type: 'feed' }); feedScreen(); }))) });
  }

  // ---------- shipping ----------
  function shipping(preIds = []) {
    const pigs = S().pigs.filter(sim.canShip);
    if (!pigs.length) return openModal({ title: t('ship.title'), body: h('p', { text: t('ship.none') }), closeLabel: t('close') });
    const chosen = new Set(preIds.length ? preIds : pigs.filter(sim.inMarketWindow).map((p) => p.id));
    const count = h('p', { 'aria-live': 'polite' });
    const fast = h('input', { type: 'checkbox', id: 'fast', checked: true });
    const go = apBtn(t('ship.go'), sim.rules.ap.ship, () => {
      const res = app.act({ type: 'ship', pigIds: [...chosen], fast: fast.checked });
      if (res.ok) { closeModal(); app.toast(t('ship.truck')); }
    });
    const upd = () => { count.textContent = t('ship.selected', { n: chosen.size }); go.disabled = !chosen.size || S().ap < sim.rules.ap.ship; };
    const list = h('ul', { class: 'checklist' }, pigs.map((p) => h('li', {}, h('label', {},
      h('input', { type: 'checkbox', checked: chosen.has(p.id), onchange: (e) => { e.target.checked ? chosen.add(p.id) : chosen.delete(p.id); upd(); } }),
      ` ${name(p)} · ${breedName(p.breed)} · ${t('pigs.ageDays', { n: p.ageDays })} · ${t('kg', { n: p.weightKg.toFixed(1) })} · ${t('pig.pen')} ${t(`pen.${p.penId}`)} `,
      sim.inMarketWindow(p) ? h('span', { class: 'badge good', text: t('pigs.marketReady') }) : null))));
    openModal({ title: t('ship.title'), wide: true, closeLabel: t('close'), body: h('div', { class: 'form' },
      h('p', { class: 'note', text: t('ship.hint') }), list,
      h('label', { class: 'radio', for: 'fast' }, fast, t('ship.fast')), count, h('div', { class: 'actions' }, go)) });
    upd();
  }

  // ---------- grade report card ----------
  function report(rep, onClose) {
    const d = sim.dateOf(rep.day);
    const date = t('hud.date', { year: d.year, season: t(`season.${d.season}`), day: d.dayOfSeason });
    const best = rep.rows.find((r) => r.grade === 'brand' || r.grade === '1+') || rep.rows[0];
    const anyOut = rep.rows.some((r) => r.grade === 'out');
    const nm = (r) => app.pigNameByIndex(r.nameIndex);
    const body = h('div', { class: 'report' },
      h('p', { class: 'stamp', text: t('report.date', { date }) }),
      h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, ['name', 'carcass', 'backfat', 'imf', 'grade', 'price'].map((c) => h('th', { scope: 'col', text: t(`report.col.${c}`) })))),
        h('tbody', {}, rep.rows.map((r) => h('tr', {},
          h('td', {}, nm(r), r.PSE || r.DFD ? h('small', { class: 'warn', text: ` ${t('report.defect', { kind: t(r.PSE ? 'report.PSE' : 'report.DFD') })}` }) : null),
          h('td', { class: 'num', text: t('kg', { n: r.carcassKg.toFixed(1) }) }),
          h('td', { class: 'num', text: t('mm', { n: r.backfat.toFixed(1) }) }),
          h('td', { class: 'num', text: t('pct', { n: r.imf.toFixed(1) }) }),
          h('td', {}, h('span', { class: `grade g-${r.grade.replace('+', 'p')}`, text: t(`grade.${r.grade}`) })),
          h('td', { class: 'num', text: money(r.price) }))))),
      h('p', { class: 'total', text: t('report.total', { amount: money(rep.total) }) }),
      h('blockquote', { class: 'line', text: anyOut ? t('line.report.2') : t('line.report.1', { name: nm(best), grade: t(`gradeLong.${best.grade}`) }) }),
      h('p', { class: 'muted small', text: t('report.brandNote') }));
    openModal({ title: t('report.title'), body, wide: true, onClose, closeLabel: t('close') });
  }

  // ---------- town ----------
  function town(tab = 'feed', justPaid = false) {
    const st = S(), tabs = ['feed', 'vet', 'creditor', 'auction'];
    const lines = { feed: ['line.feed.1', 'line.feed.2', 'line.feed.3'], vet: ['line.vet.1', 'line.vet.2'], creditor: ['line.creditor.1', 'line.creditor.2'] };
    const di = sim.debtInfo(st);
    const pick = (arr) => arr[(st.day + arr.length) % arr.length];
    let content;
    if (tab === 'feed') {
      const buyRow = (k) => h('div', { class: 'shoprow' },
        h('span', { class: 'grow' }, t(`feed.item.${k}`), h('small', { class: 'muted', text: ` ${t('shop.price', { price: fmtNum(sim.rules.feedPrice[k]) })} · ${t('feed.stock')} ${t('kg', { n: fmtNum(st.feed.stock[k]) })}` })),
        [10, 50, 100].map((kg) => h('button', { class: 'btn small', disabled: st.cash < kg * sim.rules.feedPrice[k] || (!st.unlocks.mixer && sim.MIX_ITEMS.includes(k)),
          onclick: () => { app.act({ type: 'buyFeed', item: k, kg }); town('feed'); } }, t('shop.buy', { kg }))));
      content = h('div', {}, sim.COMMERCIAL.map(buyRow),
        st.unlocks.mixer ? [h('h3', { text: t('feed.mixer') }), sim.MIX_ITEMS.map(buyRow)] : null,
        h('div', { class: 'shoprow' }, h('span', { class: 'grow', text: st.unlocks.mixer ? t('shop.mixerOwned') : t('shop.mixer') }),
          st.unlocks.mixer ? null : h('button', { class: 'btn', disabled: st.cash < sim.rules.cost.mixer, onclick: () => { app.act({ type: 'buyMixer' }); town('feed'); } }, t('shop.buyMixer'))));
    } else if (tab === 'vet') {
      const n = sim.sickCount(st);
      content = h('div', {}, h('p', { text: t('vet.sickCount', { n }) }),
        h('button', { class: 'btn', disabled: !n || st.cash < sim.rules.cost.vetVisit, onclick: () => { app.act({ type: 'vetVisit' }); town('vet'); } }, t('vet.visit')));
    } else if (tab === 'creditor') {
      const amt = h('input', { type: 'number', id: 'payamt', min: 1, step: 10000, value: Math.min(di.remaining || 100000, st.cash), class: 'money' });
      const d = sim.dateOf(di.dueDay);
      content = h('div', {},
        h('dl', { class: 'kv' },
          h('dt', { text: t('creditor.balance') }), h('dd', { class: 'num', text: money(di.balance) }),
          h('dt', { text: t('creditor.due') }), h('dd', { class: 'num', text: `${money(di.minPayment)} · ${t('date.seasonDay', { season: t(`season.${d.season}`), day: d.dayOfSeason })} (D-${di.daysLeft})` }),
          di.arrears ? [h('dt', { text: t('creditor.arrears') }), h('dd', { class: 'num warn', text: money(di.arrears) })] : null,
          h('dt', { text: t('creditor.paid') }), h('dd', { class: 'num', text: money(di.paid) })),
        di.missed ? h('p', { class: 'warn', text: t('creditor.missed', { n: di.missed }) }) : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', disabled: !di.remaining || st.cash < di.remaining, onclick: () => { app.act({ type: 'payDebt', amount: di.remaining }); town('creditor', true); } }, `${t('creditor.payMin')} (${money(di.remaining)})`)),
        h('div', { class: 'payrow' }, h('label', { for: 'payamt', text: t('creditor.amountLabel') }), amt,
          h('button', { class: 'btn', onclick: () => { app.act({ type: 'payDebt', amount: +amt.value }); town('creditor', true); } }, t('creditor.pay'))));
    } else {
      content = h('div', {}, h('p', { class: 'muted', text: t('auction.soon') }),
        sim.BREED_IDS.map((b) => h('div', { class: 'shoprow' }, h('span', { class: 'grow', text: t('auction.buyPiglet', { breed: breedName(b), price: fmtNum(sim.rules.piglet[b]) }) }),
          h('button', { class: 'btn small', disabled: st.cash < sim.rules.piglet[b] || !sim.freePlaces(st), onclick: () => { app.act({ type: 'buyPiglet', breed: b }); town('auction'); } }, t('confirm')))));
    }
    let line = tab === 'auction' ? null : pick(lines[tab]);
    if (tab === 'creditor' && justPaid && !di.remaining) line = 'line.creditor.3';
    const tabBtns = tabs.map((k) => h('button', { role: 'tab', class: `tab${k === tab ? ' on' : ''}`, 'aria-selected': k === tab ? 'true' : 'false', tabindex: k === tab ? 0 : -1,
      onclick: () => town(k),
      onkeydown: (e) => { const i = tabs.indexOf(k); if (e.key === 'ArrowRight') town(tabs[(i + 1) % 4]); if (e.key === 'ArrowLeft') town(tabs[(i + 3) % 4]); } }, t(`town.${k}`)));
    const box = openModal({ title: t('town.title'), wide: true, closeLabel: t('close'), body: h('div', { class: 'town' },
      h('div', { role: 'tablist', class: 'tabs' }, tabBtns),
      h('div', { role: 'tabpanel', class: 'tabpanel' },
        line ? h('blockquote', { class: 'line' }, h('strong', { text: `${t(`town.${tab}`)}: ` }), t(line, { days: di.daysLeft, balance: money(di.balance) })) : null,
        content),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => closeModal() }, t('town.back')))) });
    box.querySelector('.tab.on')?.focus();
  }

  // ---------- save menu ----------
  function saveMenu() {
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'importfile', 'data-testid': 'import-file',
      onchange: async (e) => { const f = e.target.files[0]; if (f) app.importText(await f.text()); } });
    openModal({ title: t('save.title'), closeLabel: t('close'), body: h('div', { class: 'menu-list' },
      h('button', { class: 'btn', onclick: () => app.save(true) }, t('save.save')),
      h('button', { class: 'btn', 'data-testid': 'export-save', onclick: () => app.exportFile() }, t('save.export')),
      h('button', { class: 'btn', 'data-testid': 'import-save', onclick: () => file.click() }, t('save.import')), file,
      h('button', { class: 'btn danger', onclick: () => { if (confirm(t('save.newConfirm'))) app.newGame(); } }, t('save.new')),
      h('p', { class: 'muted small', text: t('save.auto') })) });
  }

  // ---------- morning summary ----------
  function morning(events, rep) {
    const d = sim.dateOf(S().day);
    const date = t('hud.date', { year: d.year, season: t(`season.${d.season}`), day: d.dayOfSeason });
    const lines = events.map((e) => app.eventText(e)).filter(Boolean);
    const ends = events.find((e) => e.type === 'foreclosed') ? 'gameover' : events.find((e) => e.type === 'yearEnd') ? 'yearend' : null;
    const after = () => {
      if (rep) report(rep, () => ends && endScreen(ends));
      else if (ends) endScreen(ends);
    };
    openModal({ title: t('day.summary', { date }), closeLabel: t('close'), onClose: after, body: h('div', {},
      lines.length ? h('ul', { class: 'events' }, lines.map((l) => h('li', { text: l }))) : h('p', { text: t('day.nothing') }),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => closeModal() }, rep ? t('report.title') : t('confirm')))) });
  }
  function endScreen(kind) {
    const st = S();
    openModal({ title: t(`${kind}.title`), closeLabel: t('close'), body: h('div', {},
      h('p', { text: t(`${kind}.body`, { balance: money(st.debt.balance), missed: st.debt.missed }) }),
      kind === 'gameover' ? h('button', { class: 'btn primary', onclick: () => app.newGame() }, t('save.new')) : null) });
  }

  return { objectMenu, pigList, pigDetail, breeding, feedScreen, shipping, report, town, saveMenu, morning };
}
