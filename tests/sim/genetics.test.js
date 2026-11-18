import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../../src/sim/rng.js';
import { breedGenome, kinship, inbreeding, fRisk, dominantAllele, randomGenome } from '../../src/sim/genetics.js';
import { appearance as phenotype } from '../../src/sim/species/pig/appearance.js';

const bv = { growth: 0, lean: 0, imf: 0, litter: 0 };
const g = (KIT, MC1R, RYR1, SPOT) => ({ loci: { KIT, MC1R, RYR1, SPOT }, bv: { ...bv } });
const N = 20000;
const near = (x, p, tol = 0.015) => assert.ok(Math.abs(x - p) < tol, `${x} not near ${p}`);

test('rng is deterministic per seed', () => {
  const a = makeRng(123), b = makeRng(123);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  assert.notEqual(makeRng(1)(), makeRng(2)());
});

test('dominance follows loci.json order', () => {
  assert.equal(dominantAllele('KIT', ['i', 'I']), 'I');
  assert.equal(dominantAllele('MC1R', ['e', 'EP']), 'EP');
  assert.equal(dominantAllele('MC1R', ['EP', 'ED']), 'ED');
});

test('monohybrid Ss x Ss gives 1:2:1 genotypes and 3:1 phenotype', () => {
  const rng = makeRng(1);
  const p = g(['i', 'i'], ['e', 'e'], ['N', 'N'], ['S', 's']);
  let ss = 0, het = 0;
  for (let i = 0; i < N; i++) {
    const c = breedGenome(p, p, 0, rng, { mutationRate: 0 });
    const k = c.loci.SPOT.join('');
    if (k === 'ss') ss++; else if (k !== 'SS') het++;
  }
  near(ss / N, 0.25); near(het / N, 0.5);
});

test('testcross Nn x nn gives 1:1 for RYR1', () => {
  const rng = makeRng(2);
  const a = g(['i', 'i'], ['e', 'e'], ['N', 'n'], ['S', 'S']);
  const b = g(['i', 'i'], ['e', 'e'], ['n', 'n'], ['S', 'S']);
  let nn = 0;
  for (let i = 0; i < N; i++) if (breedGenome(a, b, 0, rng, { mutationRate: 0 }).loci.RYR1.join('') === 'nn') nn++;
  near(nn / N, 0.5);
});

test('Berkshire x Duroc F2 gives red spotted at 1/16 (GDD 2.6)', () => {
  const rng = makeRng(3);
  const berk = g(['i', 'i'], ['ED', 'ED'], ['N', 'N'], ['s', 's']);
  const duroc = g(['i', 'i'], ['e', 'e'], ['N', 'N'], ['S', 'S']);
  const f1 = breedGenome(berk, duroc, 0, rng, { mutationRate: 0 });
  assert.deepEqual(phenotype(f1), { coat: 'black', pattern: 'none', rare: false });
  let red = 0;
  for (let i = 0; i < N; i++) {
    const f2 = breedGenome(f1, f1, 0, rng, { mutationRate: 0 });
    const ph = phenotype(f2);
    if (ph.coat === 'red' && ph.pattern === 'white_spots') { red++; assert.equal(ph.rare, true); }
  }
  near(red / N, 1 / 16, 0.01);
});

test('phenotypes: white masks, Berkshire points, spotted breed, patchwork, belt', () => {
  assert.equal(phenotype(g(['I', 'i'], ['ED', 'ED'], ['N', 'N'], ['s', 's'])).coat, 'white');
  assert.equal(phenotype(g(['i', 'i'], ['ED', 'e'], ['N', 'N'], ['s', 's'])).pattern, 'points');
  assert.deepEqual(phenotype(g(['i', 'i'], ['EP', 'EP'], ['N', 'N'], ['S', 's'])), { coat: 'white', pattern: 'black_spots', rare: false });
  assert.deepEqual(phenotype(g(['i', 'i'], ['EP', 'e'], ['N', 'N'], ['s', 's'])), { coat: 'white', pattern: 'patchwork', rare: true });
  assert.equal(phenotype(g(['Be', 'i'], ['ED', 'ED'], ['N', 'N'], ['S', 'S'])).pattern, 'belt');
});

test('buyable breeds express their look', () => {
  const rng = makeRng(4);
  for (let i = 0; i < 50; i++) {
    assert.equal(phenotype(randomGenome('yorkshire_landrace', rng)).coat, 'white');
    assert.equal(phenotype(randomGenome('duroc', rng)).coat, 'red');
    assert.equal(phenotype(randomGenome('berkshire', rng)).pattern, 'points');
    assert.equal(phenotype(randomGenome('spotted', rng)).pattern, 'black_spots');
  }
});

test('mutation happens at roughly the set rate', () => {
  const rng = makeRng(5);
  const p = g(['i', 'i'], ['e', 'e'], ['N', 'N'], ['S', 'S']);
  let changed = 0; const n = 50000;
  for (let i = 0; i < n; i++) if (breedGenome(p, p, 0, rng, { mutationRate: 0.01 }).loci.RYR1[0] !== 'N') changed++;
  near(changed / n, 0.01, 0.003);
});

test('breeding values: mean is parent average, Mendelian sampling sd shrinks with F', () => {
  const rng = makeRng(6);
  const a = { loci: g(['i', 'i'], ['e', 'e'], ['N', 'N'], ['S', 'S']).loci, bv: { growth: 2, lean: 0, imf: 0, litter: 0 } };
  const b = { loci: a.loci, bv: { growth: 0, lean: 0, imf: 0, litter: 0 } };
  const stat = (F) => {
    let s = 0, s2 = 0;
    for (let i = 0; i < N; i++) { const x = breedGenome(a, b, F, rng).bv.growth; s += x; s2 += x * x; }
    const m = s / N; return { m, sd: Math.sqrt(s2 / N - m * m) };
  };
  const o = stat(0), inb = stat(0.5);
  near(o.m, 1, 0.03); near(o.sd, Math.sqrt(0.5), 0.02); near(inb.sd, 0.5, 0.02);
});

test('inbreeding coefficients from the pedigree (tabular method)', () => {
  // A,B founders; C,D full sibs (A x B); E = C x D  -> F = 0.25
  // G = A x C (parent-offspring) -> F = 0.25 ; H = half sibs: X = A x Y, Z = A x W, H = X x Z -> 0.125
  const ped = {
    A: { serial: 1 }, B: { serial: 2 }, Y: { serial: 3 }, W: { serial: 4 },
    C: { sire: 'A', dam: 'B', serial: 5 }, D: { sire: 'A', dam: 'B', serial: 6 },
    E: { sire: 'C', dam: 'D', serial: 7 }, G: { sire: 'A', dam: 'C', serial: 8 },
    X: { sire: 'A', dam: 'Y', serial: 9 }, Z: { sire: 'A', dam: 'W', serial: 10 }, H: { sire: 'X', dam: 'Z', serial: 11 },
    U: { sire: 'A', dam: 'B', serial: 12 }, // unrelated cross check
  };
  assert.equal(inbreeding(ped, 'C'), 0);
  assert.equal(inbreeding(ped, 'E'), 0.25);
  assert.equal(inbreeding(ped, 'G'), 0.25);
  assert.equal(inbreeding(ped, 'H'), 0.125);
  assert.equal(kinship(ped, 'Y', 'W'), 0);
  assert.equal(kinship(ped, 'E', 'E'), 0.5 * 1.25);
  // E x E offspring would carry F = 0.625; E x C: kinship(E, C)
  ped.K = { sire: 'E', dam: 'C', serial: 13 };
  assert.equal(inbreeding(ped, 'K'), 0.375);
});

test('F risk bands (GDD 2.4)', () => {
  assert.equal(fRisk(0), 'safe'); assert.equal(fRisk(0.04), 'caution');
  assert.equal(fRisk(0.1), 'danger'); assert.equal(fRisk(0.25), 'inbred');
});
