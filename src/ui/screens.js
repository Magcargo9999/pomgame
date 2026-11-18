// All dialogs and menus. They read app.view (sim.getView) and offer what
// sim.listActions says is possible; every button sends one sim action.
import { h, openModal, closeModal, openPopup } from './dom.js';
import { t, money, fmtNum } from './i18n.js';
import * as sim from './sim.js';

export function makeScreens(app) {
  const V = () => app.view;
  const name = (idOrPig) => app.pigName(idOrPig);
  const breedName = (id) => t(`breed.${id}`);
  const lookName = (a) => t(`coat.${a.coat}`) + t(`pattern.${a.pattern}`) + (a.rare ? t('look.rare') : '');
  const sexName = (p) => t(p.sex === 'M' && p.castrated ? 'sex.Mc' : `sex.${p.sex}`);
  const find = (list, type, pred = () => true) => list.find((a) => a.type === type && pred(a));
  const hint = (info) => [info?.apCost ? t('apCost', { n: info.apCost }) : null, info?.cost ? money(info.cost) : null].filter(Boolean).join(' · ');
  const whyNot = (info) => (info && !info.enabled && info.reason ? t(`error.${info.reason}`) : null);

  // One button for one sim action. `extra` overrides params; `after` runs on success.
  function actBtn(info, label, { extra = {}, after, cls = 'btn' } = {}) {
    const hn = hint(info);
    return h('button', {
      class: cls, disabled: !info || !info.enabled, title: whyNot(info),
      onclick: () => { const r = app.act({ type: info.type, ...info.params, ...extra }); if (r.ok) after?.(r); },
    }, label, hn ? h('small', { class: 'cost', text: ` · ${hn}` }) : null);
  }
  const menuItem = (info, label, after) => ({
    label, hint: info ? (info.enabled ? hint(info) : whyNot(info)) : '', disabled: !info || !info.enabled,
    run: () => { const r = app.act({ type: info.type, ...info.params }); if (r.ok) after?.(r); },
  });
  const bar = (v, warnHigh = false) => h('span', { class: 'meter' },
    h('span', { class: `bar${(warnHigh ? v > 60 : v < 40) ? ' warn' : ''}`, role: 'meter', 'aria-valuenow': Math.round(v), 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('span', { class: 'fill', style: `width:${Math.round(v)}%` })),
    h('span', { class: 'num', text: Math.round(v) }));
  const modal = (opts) => openModal({ closeLabel: t('close'), ...opts });

  // ---------- context menus ----------
  function objectMenu(target, pos) {
    if (target.kind === 'pig') {
      const p = app.pig(target.pigId);
      if (!p) return;
      const acts = app.actions({ kind: 'pig', id: p.id });
      const breedInfo = find(acts, 'breed');
      return openPopup({ ...pos, title: `${name(p)} · ${breedName(p.breedId)}`, items: [
        { label: t('menu.pig.detail'), run: () => pigDetail(p.id) },
        menuItem(find(acts, 'petPig'), t('action.petPig')),
        menuItem(find(acts, 'treatPig'), t('action.treatPig')),
        ...(p.sex === 'F' ? [{ label: t('menu.pig.breed'), hint: breedInfo && !breedInfo.enabled ? whyNot(breedInfo) : '', disabled: !breedInfo?.enabled, run: () => breeding(p.id) }] : []),
        { label: t('menu.pig.ship'), disabled: !find(acts, 'shipPigs')?.enabled, run: () => shipping([p.id]) },
      ] });
    }
    if (target.kind === 'pen') {
      if (!target.penId) return openPopup({ ...pos, title: t('pen.name', { n: target.slot + 1 }), items: [{ label: t('pen.locked'), disabled: true, run() {} }] });
      const pen = V().pens.find((q) => q.id === target.penId);
      const acts = app.actions({ kind: 'pen', id: pen.id });
      return openPopup({ ...pos,
        title: `${app.penName(pen.id)} · ${t('pen.places', { n: pen.pigIds.length, cap: pen.capacity })} · ${t('pen.hygiene', { n: Math.round(pen.hygiene) })} · ${t(pen.fedToday ? 'pen.fed' : 'pen.notFed')}`,
        items: [
          menuItem(find(acts, 'feedPen'), t('action.feedPen')),
          menuItem(find(acts, 'cleanPen'), t('action.cleanPen')),
          menuItem(find(acts, 'inspectPen'), t('action.inspectPen')),
          menuItem(find(acts, 'vaccinatePen'), t('action.vaccinatePen')),
          { label: t('action.setPenFeed'), run: () => feedScreen() },
          { label: t('pen.pigs'), run: () => pigList(pen.id) },
        ] });
    }
    const items = {
      house: [
        { label: t('menu.house.sleep'), run: () => app.endDay() },
        { label: t('menu.house.save'), run: () => saveMenu() },
        { label: t('menu.house.workers'), run: () => town('workers') },
      ],
      shed: [
        { label: t('menu.shed.feedAll'), hint: t('apCost', { n: hungryPens().length }), disabled: !hungryPens().length, run: feedAll },
        { label: t('menu.shed.feedScreen'), run: () => feedScreen() },
      ],
      dock: [{ label: t('menu.dock.ship'), run: () => shipping() }],
      gate: [{ label: t('menu.gate.town'), run: () => town('feed') }],
    }[target.kind];
    if (items) openPopup({ ...pos, title: t(`obj.${target.kind}`), items });
  }
  const hungryPens = () => V().pens.filter((p) => find(app.actions({ kind: 'pen', id: p.id }), 'feedPen')?.enabled);
  function feedAll() { for (const p of hungryPens()) if (!app.act({ type: 'feedPen', penId: p.id }).ok) break; }

  // ---------- pig list / detail ----------
  function pigList(penId) {
    const pigs = V().pigs.filter((p) => !penId || p.penId === penId);
    const body = pigs.length ? h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, ['name', 'breed', 'age', 'weight', 'stage', 'health'].map((c) => h('th', { scope: 'col', text: t(`pigs.col.${c}`) })))),
      h('tbody', {}, pigs.map((p) => h('tr', {},
        h('td', {}, h('button', { class: 'link', onclick: () => pigDetail(p.id) }, `${p.sex === 'F' ? '♀' : '♂'} ${name(p)}`),
          p.marketWindow ? h('span', { class: 'badge good', text: t('pigs.marketReady') }) : null,
          p.shipQueued ? h('span', { class: 'badge', text: t('pigs.queued') }) : null,
          p.condition === 'sick' ? h('span', { class: 'badge bad', text: t('pigs.sick') }) : null),
        h('td', { text: breedName(p.breedId) }),
        h('td', { text: t('pigs.ageDays', { n: p.ageDays }) }),
        h('td', { class: 'num', text: t('kg', { n: p.weightKg.toFixed(1) }) }),
        h('td', { text: t(`stage.${p.stage}`) }),
        h('td', {}, bar(p.health))))))
      : h('p', { text: t('pigs.empty') });
    modal({ title: penId ? `${t('pigs.title')} · ${app.penName(penId)}` : t('pigs.title'), body, wide: true });
  }

  function pigDetail(id) {
    const p = app.pig(id);
    if (!p) return;
    const acts = app.actions({ kind: 'pig', id });
    const again = () => pigDetail(id);
    const parent = (pid) => (pid ? name(pid) : t('pig.unknown'));
    const mw = sim.config.life.marketWindow;
    const rows = [
      ['pig.breed', `${breedName(p.breedId)} · ${lookName(p.appearance)}`],
      ['pig.sex', sexName(p)],
      ['pig.age', t('pigs.ageDays', { n: p.ageDays })],
      ['pig.stage', t(`stage.${p.stage}`)],
      ['pig.role', t(`role.${p.role}`)],
      ['pig.pen', app.penName(p.penId)],
      ['pig.weight', t('kg', { n: p.weightKg.toFixed(1) })],
      ['pig.backfat', t('mm', { n: p.backfatMm.toFixed(1) })],
      ['pig.condition', t(`condition.${p.condition}`)],
      ['pig.health', bar(p.health)],
      ['pig.stress', bar(p.stress, true)],
      ['pig.hygiene', bar(p.hygiene)],
      ['pig.hunger', bar(p.hunger, true)],
      ['pig.affinity', bar(p.affinity)],
      ['pig.F', h('span', {}, `${(p.F * 100).toFixed(1)}% `, h('span', { class: `badge risk-${p.fRisk}`, text: t(`breed.risk.${p.fRisk}`) }))],
      ['pig.parents', p.sireId || p.damId ? `${parent(p.sireId)} × ${parent(p.damId)}` : t('pig.parentsUnknown')],
      ['pig.genes', t('pig.genesHidden')],
    ];
    const roleInfo = find(acts, 'setRole');
    const breedInfo = find(acts, 'breed');
    const body = h('div', { class: 'detail' },
      h('canvas', { class: 'portrait', width: 32, height: 32, 'aria-hidden': 'true' }),
      h('dl', {}, rows.map(([k, v]) => [h('dt', { text: t(k) }), h('dd', {}, v)])),
      p.pregnantDueDay ? h('p', { class: 'note', text: t('pig.pregnant', { n: p.pregnantDueDay - V().day }) }) : null,
      p.withdrawalDays ? h('p', { class: 'note warn', text: t('pig.withdrawal', { n: p.withdrawalDays }) }) : null,
      h('p', { class: 'note', text: t('pig.window', { from: mw[0], to: mw[1] }) }),
      roleInfo && p.sex === 'M' && !p.castrated && roleInfo.params.role === 'finisher' ? h('p', { class: 'note', text: t('action.setRole.castrateNote') }) : null,
      h('div', { class: 'actions' },
        actBtn(find(acts, 'petPig'), t('action.petPig'), { after: again }),
        actBtn(find(acts, 'treatPig'), t('action.treatPig'), { after: again }),
        roleInfo ? actBtn(roleInfo, t(`action.setRole.${roleInfo.params.role}`), { after: again }) : null,
        p.sex === 'F' ? h('button', { class: 'btn', disabled: !breedInfo?.enabled, title: whyNot(breedInfo), onclick: () => breeding(p.id) }, t('menu.pig.breed')) : null,
        h('button', { class: 'btn', disabled: !find(acts, 'shipPigs')?.enabled, onclick: () => shipping([p.id]) }, t('menu.pig.ship')),
        h('button', { class: 'btn', disabled: !find(acts, 'movePig')?.enabled, onclick: () => moveDialog(p.id) }, t('menu.pig.move')),
        h('button', { class: 'btn', onclick: () => renameDialog(p.id) }, t('menu.pig.rename'))));
    const box = modal({ title: name(p), body });
    app.paintPortrait(box.querySelector('canvas.portrait'), p);
  }

  function moveDialog(id) {
    const info = find(app.actions({ kind: 'pig', id }), 'movePig');
    const sel = h('select', { id: 'move-to' }, (info?.options?.penId || []).map((pid) => h('option', { value: pid }, app.penName(pid))));
    modal({ title: t('move.title'), body: h('div', { class: 'form' },
      h('label', { for: 'move-to', text: t('move.to') }), sel,
      h('div', { class: 'actions' }, actBtn(info, t('action.movePig'), { after: () => pigDetail(id), extra: { get penId() { return sel.value; } } }))) });
  }
  function renameDialog(id) {
    const inp = h('input', { id: 'rename', maxlength: 12, value: name(id) });
    modal({ title: t('menu.pig.rename'), body: h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      if (app.act({ type: 'renamePig', pigId: id, name: inp.value.trim().slice(0, 12) }).ok) pigDetail(id);
    } }, h('label', { for: 'rename', text: t('pig.renameLabel') }), inp,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'submit' }, t('action.renamePig')))) });
  }

  // ---------- breeding (ruling O5: phenotype, 2-gen pedigree, expected F; no genotype) ----------
  function breeding(preId) {
    const dams = V().pigs.filter((p) => p.sex === 'F').map((p) => ({ p, info: find(app.actions({ kind: 'pig', id: p.id }), 'breed') }))
      .filter((d) => d.info?.options?.sireId?.length);
    if (!dams.length) return modal({ title: t('breed.title'), body: h('p', { text: t('breed.none') }) });
    const dSel = h('select', { id: 'dam' }, dams.map(({ p }) => h('option', { value: p.id, selected: p.id === preId }, `${name(p)} · ${breedName(p.breedId)} · ${t('kg', { n: p.weightKg.toFixed(0) })}`)));
    const sSel = h('select', { id: 'sire' });
    const out = h('div', { class: 'preview', 'aria-live': 'polite' });
    const go = h('button', { class: 'btn primary' }, t('action.breed'));
    const ped = (p) => {
      const g = p.pedigree || {};
      const up = (side, label) => {
        const node = g[side];
        return h('li', {}, `${label} ${node ? name(node.id) : t('pig.unknown')}`,
          node ? h('small', { class: 'muted', text: ` (${node.sireId ? name(node.sireId) : t('pig.unknown')} × ${node.damId ? name(node.damId) : t('pig.unknown')})` }) : null);
      };
      return h('div', { class: 'ped' },
        h('strong', { text: name(p) }), h('small', { class: 'muted', text: ` · ${breedName(p.breedId)} · ${t('breed.look')}: ${lookName(p.appearance)}` }),
        !g.sire && !g.dam ? h('p', { class: 'muted small', text: t('pig.parentsUnknown') }) : h('ul', {}, up('sire', '♂'), up('dam', '♀')));
    };
    const cur = () => dams.find((d) => d.p.id === dSel.value) || dams[0];
    const fillSires = () => {
      sSel.replaceChildren(...cur().info.options.sireId.map((s) => h('option', { value: s.id }, `${name(s.id)} · ${breedName(app.pig(s.id)?.breedId)}`)));
    };
    const upd = () => {
      const { p, info } = cur();
      const s = info.options.sireId.find((x) => x.id === sSel.value) || info.options.sireId[0];
      const sire = app.pig(s.id);
      out.replaceChildren(...[
        h('p', { class: 'muted small', text: t('breed.pedigree') }),
        h('div', { class: 'peds' }, sire ? ped(sire) : null, ped(p)),
        h('p', {}, `${t('breed.F')}: ${(s.expectedF * 100).toFixed(2)}% `, h('span', { class: `badge risk-${s.risk}`, text: t(`breed.risk.${s.risk}`) })),
        info.options.warning ? h('p', { class: 'warn', text: info.options.warning === 'herd.full' ? t('breed.fullWarn') : t(`error.${info.options.warning}`) }) : null,
        h('p', { class: 'muted small', text: t('breed.result') }),
      ].filter(Boolean));
      go.disabled = V().ap.left < info.apCost;
      go.replaceChildren(t('action.breed'), h('small', { class: 'cost', text: ` · ${t('apCost', { n: info.apCost })}` }));
    };
    dSel.onchange = () => { fillSires(); upd(); };
    sSel.onchange = upd;
    go.onclick = () => { if (app.act({ type: 'breed', damId: dSel.value, sireId: sSel.value }).ok) closeModal(); };
    modal({ title: t('breed.title'), wide: true, body: h('div', { class: 'form' },
      h('label', { for: 'dam', text: t('breed.dam') }), dSel,
      h('label', { for: 'sire', text: t('breed.sire') }), sSel, out, h('div', { class: 'actions' }, go)) });
    fillSires(); upd();
  }

  // ---------- feed & mixing ----------
  function feedLabel(f) {
    if (!f) return '';
    if (f.kind === 'commercial') return t(`item.${f.id}`);
    const i = V().recipes.findIndex((r) => r.id === f.recipeId);
    return t('feed.recipe', { n: i + 1 });
  }
  function mixProps(shares) {
    const ing = sim.items.ingredients;
    let e = 0, p = 0, unsat = 0, barley = 0, total = 0;
    for (const [k, v] of Object.entries(shares)) { total += v; const s = v / 100; e += s * ing[k].energy; p += s * ing[k].protein; unsat += s * ing[k].unsat; barley += s * ing[k].barley; }
    const k = total ? 100 / total : 0;
    return { total, energy: e * k, protein: p * k, fatColor: Math.min(7, Math.max(1, 1 + 4 * unsat * k - 1.5 * barley * k)) };
  }
  function feedScreen() {
    const v = V();
    const stock = (id, kg) => h('small', { class: 'muted', text: ` ${t('feed.stock')} ${t('kg', { n: fmtNum(kg || 0) })}` });
    const penRows = v.pens.map((pen) => {
      const acts = app.actions({ kind: 'pen', id: pen.id });
      const setInfo = find(acts, 'setPenFeed');
      const opts = setInfo?.options?.feed || [];
      const key = (f) => JSON.stringify(f);
      const sel = h('select', { 'aria-label': `${app.penName(pen.id)} ${t('pen.feed')}`,
        onchange: (e) => { app.act({ type: 'setPenFeed', penId: pen.id, feed: JSON.parse(e.target.value) }, { quiet: true }); feedScreen(); } },
        opts.map((f) => h('option', { value: key(f), selected: key(f) === key(pen.feed) }, feedLabel(f))));
      return h('div', { class: 'shoprow' },
        h('span', { class: 'grow' }, h('strong', { text: app.penName(pen.id) }), h('small', { class: 'muted', text: ` · ${t('pen.places', { n: pen.pigIds.length, cap: pen.capacity })} · ${t(pen.fedToday ? 'pen.fed' : 'pen.notFed')}` })),
        sel, actBtn(find(acts, 'feedPen'), t('action.feedPen'), { after: () => feedScreen(), cls: 'btn small' }));
    });
    const stocks = h('p', {}, Object.keys(sim.items.commercialFeeds).map((id) => h('span', { class: 'chip' }, t(`item.${id}`), stock(id, v.inventory.feeds[id]))),
      Object.keys(sim.items.ingredients).filter((id) => v.inventory.ingredients[id]).map((id) => h('span', { class: 'chip' }, t(`item.${id}`), stock(id, v.inventory.ingredients[id]))));
    let mixer;
    if (!v.facilities.feed_mixer) mixer = h('fieldset', {}, h('legend', { text: t('feed.mixer') }), h('p', { class: 'muted', text: t('feed.mixerLocked') }));
    else {
      const ids = Object.keys(sim.items.ingredients);
      const mix = Object.fromEntries(ids.map((k) => [k, { corn: 50, barley: 30, soybean_meal: 20 }[k] || 0]));
      const pv = h('div', { class: 'preview', 'aria-live': 'polite' });
      const save = h('button', { class: 'btn' }, t('action.saveRecipe'));
      const upd = () => {
        const m = mixProps(mix);
        const fc = m.fatColor <= 2 ? 'good' : m.fatColor <= 4 ? 'ok' : 'bad';
        pv.replaceChildren(h('p', {}, `${t('feed.total', { n: Math.round(m.total) })} · ${t('feed.energy')} ${m.energy.toFixed(2)} · ${t('feed.protein')} ${m.protein.toFixed(2)} · ${t('feed.fatColor')}: `,
          h('span', { class: `badge ${fc === 'bad' ? 'bad' : fc === 'good' ? 'good' : ''}`, text: t(`feed.fatColor.${fc}`) })), h('p', { class: 'muted small', text: t('feed.hint') }));
        save.disabled = !m.total;
      };
      save.onclick = () => {
        const total = Object.values(mix).reduce((a, b) => a + b, 0);
        const shares = Object.fromEntries(Object.entries(mix).filter(([, x]) => x > 0).map(([k, x]) => [k, x / total]));
        if (app.act({ type: 'saveRecipe', shares }).ok) feedScreen();
      };
      mixer = h('fieldset', {}, h('legend', { text: t('feed.mixer') }),
        ids.map((k) => {
          const id = `mix-${k}`, max = sim.items.ingredients[k].additive ? 5 : 100;
          const num = h('input', { type: 'number', min: 0, max, step: 1, value: mix[k], id, class: 'pct' });
          const rng = h('input', { type: 'range', min: 0, max, step: 1, value: mix[k], 'aria-label': t(`item.${k}`) });
          const set = (x) => { mix[k] = Math.max(0, Math.min(max, Math.round(+x || 0))); num.value = mix[k]; rng.value = mix[k]; upd(); };
          num.oninput = () => set(num.value); rng.oninput = () => set(rng.value);
          return h('div', { class: 'mixrow' }, h('label', { for: id }, t(`item.${k}`), stock(k, v.inventory.ingredients[k])), rng, num, h('span', { text: '%' }));
        }),
        pv, h('div', { class: 'actions' }, save),
        h('p', { class: 'muted small', text: v.recipes.length ? `${t('feed.recipes')}: ${v.recipes.map((r, i) => `${t('feed.recipe', { n: i + 1 })} (${Object.entries(r.shares).map(([k, x]) => `${t(`item.${k}`)} ${Math.round(x * 100)}%`).join(', ')})`).join(' / ')}` : t('feed.noRecipes') }));
      setTimeout(upd);
    }
    modal({ title: t('feed.title'), wide: true, body: h('div', { class: 'form' },
      h('h3', { text: t('feed.pens') }), penRows, stocks, mixer) });
  }

  // ---------- shipping ----------
  function shipping(preIds = []) {
    const v = V();
    const pigs = v.pigs.filter((p) => p.shippable && !p.shipQueued);
    const queued = v.pigs.filter((p) => p.shipQueued);
    const chosen = new Set(preIds.length ? preIds : pigs.filter((p) => p.marketWindow).map((p) => p.id));
    const info0 = pigs[0] ? find(app.actions({ kind: 'pig', id: pigs[0].id }), 'shipPigs') : null;
    const fastSel = h('select', { id: 'fast' }, (info0?.options?.fast || ['none', 'normal', 'long']).map((f) => h('option', { value: f, selected: f === 'normal' }, t(`ship.fast.${f}`))));
    const gentle = h('input', { type: 'checkbox', id: 'gentle' });
    const lair = h('input', { type: 'checkbox', id: 'lair', disabled: !v.facilities.lairage, checked: !!v.facilities.lairage });
    const count = h('p', { 'aria-live': 'polite' });
    const fee = sim.items.services.truckFeePerPig;
    const go = h('button', { class: 'btn primary' }, t('action.shipPigs'));
    go.onclick = () => {
      const r = app.act({ type: 'shipPigs', pigIds: [...chosen], fast: fastSel.value, gentle: gentle.checked, useLairage: lair.checked });
      if (r.ok) { closeModal(); app.toast(t('ship.truck')); }
    };
    const upd = () => {
      const ap = (info0?.apCost || 2) + (gentle.checked ? 2 : 0);
      count.textContent = `${t('ship.selected', { n: chosen.size })} · ${t('ship.fee', { fee: money(fee * chosen.size) })} · ${t('apCost', { n: ap })}`;
      go.disabled = !chosen.size || v.ap.left < ap;
    };
    gentle.onchange = upd;
    const list = pigs.length ? h('ul', { class: 'checklist' }, pigs.map((p) => h('li', {}, h('label', {},
      h('input', { type: 'checkbox', checked: chosen.has(p.id), onchange: (e) => { e.target.checked ? chosen.add(p.id) : chosen.delete(p.id); upd(); } }),
      ` ${name(p)} · ${breedName(p.breedId)} · ${t('pigs.ageDays', { n: p.ageDays })} · ${t('kg', { n: p.weightKg.toFixed(1) })} · ${app.penName(p.penId)} `,
      p.marketWindow ? h('span', { class: 'badge good', text: t('pigs.marketReady') }) : null))))
      : h('p', { class: 'muted', text: t('ship.none') });
    const qList = queued.length ? [h('h3', { text: t('ship.queued') }), h('ul', { class: 'checklist' }, queued.map((p) => h('li', {}, `${name(p)} `,
      h('button', { class: 'btn small', onclick: () => { if (app.act({ type: 'cancelShipment', pigId: p.id }).ok) shipping(); } }, t('action.cancelShipment')))))] : null;
    modal({ title: t('ship.title'), wide: true, body: h('div', { class: 'form' },
      h('p', { class: 'note', text: t('ship.hint') }), list,
      pigs.length ? [
        h('div', { class: 'payrow' }, h('label', { for: 'fast', text: t('ship.fast') }), fastSel),
        h('label', { class: 'radio', for: 'gentle' }, gentle, t('ship.gentle')),
        h('label', { class: 'radio', for: 'lair' }, lair, t('ship.lairage')),
        count, h('div', { class: 'actions' }, go)] : null,
      qList) });
    if (pigs.length) upd();
  }

  // ---------- grade report card ----------
  function report(sheets, onClose) {
    const total = sheets.reduce((s, r) => s + r.revenue, 0);
    const best = sheets.find((r) => r.grade === 'brand') || sheets.find((r) => r.grade === '1+') || sheets[0];
    const anyOut = sheets.some((r) => r.grade === 'out');
    const body = h('div', { class: 'report' },
      h('p', { class: 'stamp', text: t('report.date', { date: app.dateText(sheets[0].day) }) }),
      h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, ['name', 'carcass', 'backfat', 'imf', 'grade', 'price'].map((c) => h('th', { scope: 'col', text: t(`report.col.${c}`) })))),
        h('tbody', {}, sheets.map((r) => h('tr', {},
          h('td', {}, r.name || name(r.pigId), r.PSE || r.DFD ? h('small', { class: 'warn', text: ` ${t('report.defect', { kind: t(r.PSE ? 'report.PSE' : 'report.DFD') })}` }) : null),
          h('td', { class: 'num', text: t('kg', { n: r.carcassKg.toFixed(1) }) }),
          h('td', { class: 'num', text: t('mm', { n: r.backfatMm.toFixed(1) }) }),
          h('td', { class: 'num', text: t('pct', { n: r.imf.toFixed(1) }) }),
          h('td', {}, h('span', { class: `grade g-${r.grade.replace('+', 'p')}`, text: t(`grade.${r.grade}`) })),
          h('td', { class: 'num', text: money(r.revenue) }))))),
      h('p', { class: 'total', text: t('report.total', { amount: money(total) }) }),
      h('blockquote', { class: 'line', text: anyOut ? t('line.report.2') : t('line.report.1', { name: best.name || name(best.pigId), grade: t(`gradeLong.${best.grade}`) }) }),
      h('p', { class: 'muted small', text: t('report.brandNote') }));
    modal({ title: t('report.title'), body, wide: true, onClose });
  }

  // ---------- town ----------
  const TABS = ['feed', 'auction', 'facility', 'vet', 'creditor', 'workers'];
  function town(tab = 'feed', justPaid = false) {
    const v = V();
    const lines = { feed: ['line.feed.1', 'line.feed.2', 'line.feed.3'], vet: ['line.vet.1', 'line.vet.2'], creditor: ['line.creditor.1', 'line.creditor.2'] };
    const shop = v.shop;
    const back = () => town(tab);
    const buyRow = (s, qtys) => h('div', { class: 'shoprow' },
      h('span', { class: 'grow' }, app.itemName(s.itemId, s.breedId),
        h('small', { class: 'muted', text: ` ${t(`unit.${s.unit}`, { price: money(s.price) })}` }),
        s.unit === 'kg' ? h('small', { class: 'muted', text: ` · ${t('feed.stock')} ${t('kg', { n: fmtNum(v.inventory.feeds[s.itemId] ?? v.inventory.ingredients[s.itemId] ?? 0) })}` }) : null,
        s.itemId === 'vaccine' ? h('small', { class: 'muted', text: ` · ${t('feed.stock')} ${v.inventory.vaccine}` }) : null),
      !s.enabled && s.reason && s.reason !== 'cash.notEnough' ? h('small', { class: 'muted', text: t(s.reason === 'facility.owned' ? 'shop.owned' : `error.${s.reason}`) }) : null,
      qtys.map((q) => h('button', { class: 'btn small', disabled: !s.enabled || v.cash < s.price * q.n,
        onclick: () => { if (app.act({ type: 'buy', itemId: s.itemId, breedId: s.breedId, qty: q.n }).ok) back(); } }, q.label)));
    const kgQty = [10, 50, 100].map((n) => ({ n, label: t('shop.buyQty', { qty: t('shop.qtyKg', { n }) }) }));
    let content;
    if (tab === 'feed') {
      content = h('div', {}, shop.filter((s) => s.unit === 'kg').map((s) => buyRow(s, kgQty)),
        shop.filter((s) => s.itemId === 'vaccine').map((s) => buyRow(s, [1, 5, 10].map((n) => ({ n, label: t('shop.buyQty', { qty: t('shop.qtyDose', { n }) }) })))));
    } else if (tab === 'auction') {
      content = h('div', {}, h('p', { class: 'muted', text: t('auction.soon') }),
        shop.filter((s) => s.unit === 'head').map((s) => buyRow(s, [{ n: 1, label: t('action.buy') }])));
    } else if (tab === 'facility') {
      content = h('div', {}, shop.filter((s) => s.unit === 'unit').map((s) => buyRow(s, s.reason === 'facility.owned' ? [] : [{ n: 1, label: t('action.buy') }])));
    } else if (tab === 'vet') {
      const sick = v.pigs.filter((p) => p.condition === 'sick');
      content = h('div', {}, sick.length
        ? sick.map((p) => h('div', { class: 'shoprow' }, h('span', { class: 'grow', text: `${name(p)} · ${app.penName(p.penId)}` }),
          actBtn(find(app.actions({ kind: 'pig', id: p.id }), 'treatPig'), t('action.treatPig'), { after: back, cls: 'btn small' })))
        : h('p', { class: 'muted', text: t('vet.noneSick') }),
        h('p', { class: 'muted small', text: t('vet.fee', { fee: money(sim.items.services.vetFee) }) }));
    } else if (tab === 'creditor') {
      const d = v.debt, due = d.minDue ?? d.minPerSeason, remaining = Math.max(0, due - d.paidThisSeason);
      const payInfo = find(app.actions({ kind: 'farm' }), 'payDebt');
      const amt = h('input', { type: 'number', id: 'payamt', min: 1, step: 10000, value: Math.min(remaining || 100000, v.cash) });
      content = h('div', {},
        h('dl', { class: 'kv' },
          h('dt', { text: t('creditor.balance') }), h('dd', { class: 'num', text: money(d.balance) }),
          h('dt', { text: t('creditor.rate') }), h('dd', { class: 'num', text: t('pct', { n: (d.ratePerSeason * 100).toFixed(1) }) }),
          h('dt', { text: t('creditor.due') }), h('dd', { class: 'num', text: `${money(due)} · ${app.seasonDayText(d.nextDueDay)} (D-${d.nextDueDay - v.day})` }),
          d.arrears ? [h('dt', { text: t('creditor.arrears') }), h('dd', { class: 'num warn', text: money(d.arrears) })] : null,
          h('dt', { text: t('creditor.paid') }), h('dd', { class: 'num', text: money(d.paidThisSeason) })),
        d.missed ? h('p', { class: 'warn', text: t('creditor.missed', { n: d.missed, max: d.maxMissed }) }) : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', 'data-testid': 'pay-due', disabled: !remaining || v.cash < remaining || (payInfo && payInfo.reason === 'game.over'),
            onclick: () => { if (app.act({ type: 'payDebt', amount: remaining }).ok) town('creditor', true); } }, `${t('creditor.payDue')} (${money(remaining)})`)),
        h('div', { class: 'payrow' }, h('label', { for: 'payamt', text: t('creditor.amountLabel') }), amt,
          h('button', { class: 'btn', onclick: () => { if (app.act({ type: 'payDebt', amount: Math.floor(+amt.value) }).ok) town('creditor', true); } }, t('action.payDebt'))));
    } else {
      content = h('div', {}, (v.workerOffers || []).map((w) => h('div', { class: 'shoprow' },
        h('span', { class: 'grow' }, t(`worker.${w.id}`), h('small', { class: 'muted', text: ` · ${t('workers.row', { wage: money(w.wage), ap: w.apBonus })}` }),
          w.hired ? h('span', { class: 'badge good', text: t('workers.hired') }) : null),
        h('button', { class: 'btn small', onclick: () => { if (app.act({ type: w.hired ? 'fireWorker' : 'hireWorker', workerId: w.id }).ok) back(); } },
          t(w.hired ? 'action.fireWorker' : 'action.hireWorker')))));
    }
    let line = lines[tab] ? lines[tab][v.day % lines[tab].length] : null;
    if (tab === 'creditor' && justPaid && v.debt.paidThisSeason >= (v.debt.minDue ?? v.debt.minPerSeason)) line = 'line.creditor.3';
    const tabBtns = TABS.map((k) => h('button', { role: 'tab', class: `tab${k === tab ? ' on' : ''}`, 'aria-selected': k === tab ? 'true' : 'false', tabindex: k === tab ? 0 : -1,
      onclick: () => town(k),
      onkeydown: (e) => {
        const i = TABS.indexOf(k);
        if (e.key === 'ArrowRight') town(TABS[(i + 1) % TABS.length]);
        if (e.key === 'ArrowLeft') town(TABS[(i + TABS.length - 1) % TABS.length]);
      } }, t(`town.${k}`)));
    const box = modal({ title: t('town.title'), wide: true, body: h('div', { class: 'town' },
      h('div', { role: 'tablist', class: 'tabs' }, tabBtns),
      h('div', { role: 'tabpanel', class: 'tabpanel' },
        line ? h('blockquote', { class: 'line' }, h('strong', { text: `${t(`town.${tab}`)}: ` }), t(line, { days: v.debt.nextDueDay - v.day, balance: money(v.debt.balance) })) : null,
        content),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => closeModal() }, t('town.back')))) });
    box.querySelector('.tab.on')?.focus();
  }

  // ---------- save menu ----------
  function saveMenu() {
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'importfile', 'data-testid': 'import-file',
      onchange: async (e) => { const f = e.target.files[0]; if (f) app.importText(await f.text()); } });
    const reports = V().reports;
    modal({ title: t('save.title'), body: h('div', { class: 'menu-list' },
      h('button', { class: 'btn', onclick: () => app.save(true) }, t('save.save')),
      h('button', { class: 'btn', 'data-testid': 'export-save', onclick: () => app.exportFile() }, t('save.export')),
      h('button', { class: 'btn', 'data-testid': 'import-save', onclick: () => file.click() }, t('save.import')), file,
      h('button', { class: 'btn', disabled: !reports.length, onclick: () => report(reports) }, t('report.history')),
      h('button', { class: 'btn danger', onclick: () => { if (confirm(t('save.newConfirm'))) app.newGame(); } }, t('save.new')),
      h('p', { class: 'muted small', text: t('save.auto') })) });
  }

  // ---------- morning summary ----------
  function morning(events) {
    const sheets = events.filter((e) => e.type === 'gradeReport').map((e) => e.sheet);
    const lines = events.filter((e) => e.type !== 'gradeReport').map((e) => app.eventText(e)).filter(Boolean);
    const yearEv = events.find((e) => e.type === 'yearComplete');
    const ends = events.some((e) => e.type === 'foreclosed') ? ['gameover'] : yearEv ? ['yearend', yearEv.summary] : null;
    const after = () => {
      if (sheets.length) report(sheets, () => ends && endScreen(...ends));
      else if (ends) endScreen(...ends);
    };
    modal({ title: t('day.summary', { date: app.dateText(V().day) }), onClose: after, body: h('div', {},
      lines.length ? h('ul', { class: 'events' }, lines.map((l) => h('li', { text: l }))) : h('p', { text: t('day.nothing') }),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => closeModal() }, sheets.length ? t('report.title') : t('confirm')))) });
  }
  function endScreen(kind, summary = {}) {
    const gc = summary.gradeCounts || {};
    modal({ title: t(`${kind}.title`), body: h('div', {},
      h('p', { text: t(`${kind}.body`, { debt: money(summary.debt ?? 0), cash: money(summary.cash ?? 0), shipped: summary.shipped ?? 0, revenue: money(summary.revenue ?? 0),
        brand: gc.brand ?? 0, g1p: gc['1+'] ?? 0, g1: gc['1'] ?? 0, g2: gc['2'] ?? 0, out: gc.out ?? 0 }) }),
      h('button', { class: 'btn primary', onclick: () => app.newGame() }, t('save.new'))) });
  }

  return { objectMenu, pigList, pigDetail, breeding, feedScreen, shipping, report, town, saveMenu, morning };
}
