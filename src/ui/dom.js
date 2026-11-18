// Small DOM helpers: element builder, modal dialog with focus trap, popup menu.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';
let current = null;

export const isModalOpen = () => !!current;

export function openModal({ title, body, wide = false, onClose, closeLabel = '×', returnFocus }) {
  closeModal(true);
  const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  const box = h('section', { class: `dialog${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('header', { class: 'dialog-head' },
      h('h2', { id: titleId, text: title }),
      h('button', { class: 'icon-btn', 'aria-label': closeLabel, title: closeLabel, onclick: () => closeModal() }, '×')),
    h('div', { class: 'dialog-body' }, body));
  const back = h('div', { class: 'backdrop', onmousedown: (e) => { if (e.target === back) closeModal(); } }, box);
  back.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); }
    if (e.key === 'Tab') {
      const f = [...box.querySelectorAll(FOCUSABLE)];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  document.getElementById('modal-root').append(back);
  current = { back, onClose, returnFocus: returnFocus || document.activeElement };
  const first = box.querySelector('.dialog-body ' + FOCUSABLE) || box.querySelector(FOCUSABLE);
  first?.focus();
  return box;
}

export function closeModal(silent = false) {
  if (!current) return;
  const c = current;
  current = null;
  c.back.remove();
  if (!silent) {
    c.onClose?.();
    if (!current) (c.returnFocus && document.contains(c.returnFocus) ? c.returnFocus : document.getElementById('world'))?.focus();
  }
}

// Popup menu near a screen point. Arrow keys move, Esc closes.
let popup = null;
export const isPopupOpen = () => !!popup;
export function openPopup({ x, y, title, items }) {
  closePopup();
  const host = document.getElementById('popup');
  host.replaceChildren(
    h('div', { class: 'popup-title', id: 'popup-title', text: title }),
    ...items.map((it) => h('button', { role: 'menuitem', class: 'popup-item', disabled: it.disabled, onclick: () => { closePopup(); it.run(); } },
      h('span', { text: it.label }), it.hint ? h('small', { text: it.hint }) : null)));
  host.hidden = false;
  const r = host.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
  host.style.left = `${Math.max(8, Math.min(x + 8, vw - r.width - 8))}px`;
  host.style.top = `${Math.max(8, Math.min(y + 8, vh - r.height - 8))}px`;
  popup = { host, back: document.activeElement };
  const btns = () => [...host.querySelectorAll('button:not([disabled])')];
  host.onkeydown = (e) => {
    const b = btns(), i = b.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); b[(i + 1) % b.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); b[(i - 1 + b.length) % b.length]?.focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closePopup(true); }
  };
  btns()[0]?.focus();
}
export function closePopup(restore = false) {
  if (!popup) return;
  const p = popup;
  popup = null;
  p.host.hidden = true;
  p.host.replaceChildren();
  if (restore) (p.back && document.contains(p.back) ? p.back : document.getElementById('world'))?.focus();
}
document.addEventListener('mousedown', (e) => { if (popup && !popup.host.contains(e.target)) closePopup(); });

export function toast(msg, kind = 'info') {
  const host = document.getElementById('toasts');
  const el = h('div', { class: `toast ${kind}`, text: msg });
  host.append(el);
  while (host.children.length > 4) host.firstChild.remove();
  setTimeout(() => el.remove(), 3500);
}
