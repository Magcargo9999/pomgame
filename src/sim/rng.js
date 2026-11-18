// Seeded RNG (mulberry32). State is one uint32 kept in the game state, so saves replay exactly.
export function seedFrom(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed);
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

export function makeRng(state) {
  let a = state >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = () => next();
  rng.state = () => a;
  rng.int = (n) => Math.floor(next() * n);
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.chance = (p) => next() < p;
  rng.gauss = () => { // Box-Muller
    let u = 0; while (u === 0) u = next();
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  rng.weighted = (obj) => { // {key: weight}
    const keys = Object.keys(obj); let total = 0;
    for (const k of keys) total += obj[k];
    let r = next() * total;
    for (const k of keys) { r -= obj[k]; if (r < 0) return k; }
    return keys[keys.length - 1];
  };
  return rng;
}
