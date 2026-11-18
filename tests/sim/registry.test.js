import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getView, endDay, serialize, deserialize, speciesModule, speciesIds, SAVE_VERSION, MIGRATIONS } from '../../src/sim/index.js';
import { species, breeds, lociFor } from '../../src/sim/data.js';

const CONTRACT = ['newAnimal', 'weightForAge', 'ageOf', 'stageOf', 'canShip', 'inMarketWindow', 'ration', 'tick', 'slaughter', 'grade', 'appearance'];

test('every registered species implements the module contract and has data', () => {
  for (const id of speciesIds()) {
    const m = speciesModule(id);
    assert.equal(m.id, id);
    for (const fn of CONTRACT) assert.equal(typeof m[fn], 'function', `${id}.${fn}`);
    assert.ok(Array.isArray(m.gradeCodes) && m.gradeCodes.length);
    assert.ok(species[id], `data/species.json has ${id}`);
    assert.ok(lociFor(id).length > 0, `data/loci.json has loci for ${id}`);
    assert.ok(Object.values(breeds).some((b) => b.species === id), `data/breeds.json has a ${id} breed`);
  }
  assert.throws(() => speciesModule('dragon'), /species.unknown/);
});

test('every breed names a registered species and covers its loci', () => {
  for (const [id, b] of Object.entries(breeds)) {
    assert.ok(speciesIds().includes(b.species), id);
    for (const L of lociFor(b.species)) assert.ok(b.alleleFreq[L.locus], `${id} ${L.locus}`);
  }
});

test('animals carry their species into state and view', () => {
  const s = createGame(1);
  assert.ok(s.pigs.every((p) => p.species === 'pig' && p.genome.species === 'pig'));
  assert.ok(getView(s).pigs.every((p) => p.species === 'pig'));
});

test('save version and migrations: a v1 save loads and plays on', () => {
  assert.equal(SAVE_VERSION, 2);
  assert.ok(MIGRATIONS.every((m, i) => m.from === i + 1), 'migrations are a contiguous chain from v1');
  const s = endDay(createGame(3)).state;
  // Build a v1-shaped save: no species, no arrears, gene_lab in facilities.
  const v1 = JSON.parse(serialize(s));
  v1.saveVersion = 1;
  for (const p of v1.pigs) { delete p.species; delete p.genome.species; }
  delete v1.debt.arrears;
  v1.facilities.gene_lab = false;
  const up = deserialize(JSON.stringify(v1));
  assert.equal(up.saveVersion, SAVE_VERSION);
  assert.ok(up.pigs.every((p) => p.species === 'pig'));
  assert.equal(up.debt.arrears, 0);
  assert.ok(!('gene_lab' in up.facilities));
  assert.deepEqual(JSON.parse(serialize(endDay(up).state)), JSON.parse(serialize(endDay(s).state)));
});
