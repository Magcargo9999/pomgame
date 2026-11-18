// Feed properties from ingredient shares (GDD 1.1 feed table).
import { items } from './data.js';

export function normaliseShares(shares) {
  const out = {}; let total = 0;
  for (const [k, v] of Object.entries(shares)) {
    if (!items.ingredients[k] || !(v > 0)) continue;
    out[k] = v; total += v;
  }
  if (total <= 0) return null;
  for (const k of Object.keys(out)) out[k] = out[k] / total;
  return out;
}

/** { energy, protein, unsat, barley, vitE } of a mix. Additives count by share but add no energy. */
export function feedProps(shares) {
  const p = { energy: 0, protein: 0, unsat: 0, barley: 0, vitE: 0 };
  let bulk = 0;
  for (const [k, s] of Object.entries(shares)) {
    const ing = items.ingredients[k];
    if (ing.additive) { if (k === 'vitamin_e') p.vitE += s; continue; }
    bulk += s;
    p.energy += s * ing.energy; p.protein += s * ing.protein;
    p.unsat += s * ing.unsat; p.barley += s * ing.barley;
  }
  if (bulk > 0) { p.energy /= bulk; p.protein /= bulk; p.unsat /= bulk; p.barley /= bulk; }
  return p;
}

/** Resolve a pen's feed setting to { shares, stock: [{pool, id, share}] }. */
export function resolveFeed(state, feed) {
  if (!feed) return null;
  if (feed.kind === 'commercial') {
    const f = items.commercialFeeds[feed.id];
    if (!f) return null;
    return { shares: f.shares, stock: [{ pool: 'feeds', id: feed.id, share: 1 }] };
  }
  if (feed.kind === 'mix') {
    const r = state.recipes.find((x) => x.id === feed.recipeId);
    if (!r) return null;
    return { shares: r.shares, stock: Object.entries(r.shares).map(([id, share]) => ({ pool: 'ingredients', id, share })) };
  }
  return null;
}
