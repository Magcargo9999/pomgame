// Tiny string table: t('key', {param}) with {param} placeholders.
let table = {};

export function setStrings(obj) { table = obj || {}; }
export async function loadStrings(url = './i18n/ko.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  setStrings(await res.json());
}
export function t(key, params) {
  const s = table[key];
  if (typeof s !== 'string') return key;
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
}
export function list(key) {
  const v = table[key];
  return Array.isArray(v) ? v : [];
}
export const fmtNum = (n) => Math.round(n).toLocaleString('ko-KR');
export const money = (n) => t('money', { n: fmtNum(n) });
