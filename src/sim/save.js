// Save files: JSON with saveVersion. Old saves are upgraded step by step through MIGRATIONS.
// To change the state shape: bump SAVE_VERSION and append { from: <old version>, up(state) } that edits in place.
export const SAVE_VERSION = 2;

export const MIGRATIONS = [
  {
    from: 1, // v1 (before the species registry): animals had no species, gene lab existed, debt had no arrears
    up(s) {
      for (const p of s.pigs ?? []) { p.species ??= 'pig'; if (p.genome) p.genome.species ??= 'pig'; }
      s.debt.arrears ??= 0;
      if (s.facilities) { delete s.facilities.gene_lab; s.facilities.piggery ??= false; }
    },
  },
];

export function serialize(s) { return JSON.stringify(s); }

export function deserialize(str) {
  let s;
  try { s = JSON.parse(str); } catch { throw new Error('save.invalid'); }
  if (!s || typeof s !== 'object' || !Array.isArray(s.pigs) || typeof s.day !== 'number' || typeof s.saveVersion !== 'number') throw new Error('save.invalid');
  if (s.saveVersion > SAVE_VERSION) throw new Error('save.version');
  while (s.saveVersion < SAVE_VERSION) {
    const m = MIGRATIONS.find((x) => x.from === s.saveVersion);
    if (!m) throw new Error('save.version');
    m.up(s);
    s.saveVersion = m.from + 1;
  }
  return s;
}
