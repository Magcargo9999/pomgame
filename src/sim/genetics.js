// Genetics: Mendelian loci (GDD 2.2), quantitative breeding values (2.3), pedigree inbreeding (2.4).
import { PIG_LOCI, BV_TRAITS, breeds, config } from './data.js';

const locus = (name) => PIG_LOCI.find((l) => l.locus === name);

/** Allele expressed by a 'dominant'-mode pair: the one listed first in loci.json wins. */
export function dominantAllele(name, pair) {
  const order = locus(name).alleles;
  return order.indexOf(pair[0]) <= order.indexOf(pair[1]) ? pair[0] : pair[1];
}

const key = (pair) => [...pair].sort().reverse().join(''); // 'Nn', 'NN', 'nn', 'Ss'...
const ryrKey = (pair) => (pair[0] === 'N' && pair[1] === 'N') ? 'NN'
  : (pair[0] === 'n' && pair[1] === 'n') ? 'nn' : 'Nn';

export function ryr1Effect(genome) {
  return locus('RYR1').effects[ryrKey(genome.loci.RYR1)];
}

/** Coat and pattern from the genotype. Feeds the sprite palette swap + pattern layer. */
export function phenotype(genome) {
  const L = genome.loci;
  const kit = dominantAllele('KIT', L.KIT);
  const mc1r = dominantAllele('MC1R', L.MC1R);
  const spotted = L.SPOT[0] === 's' && L.SPOT[1] === 's';
  if (kit === 'I') return { coat: 'white', pattern: 'none', rare: false };
  let coat, pattern = 'none', rare = false;
  if (mc1r === 'ED') coat = 'black';
  else if (mc1r === 'EP') { coat = 'white'; pattern = 'black_spots'; }
  else coat = 'red';
  if (spotted) {
    if (mc1r === 'EP') { pattern = 'patchwork'; rare = true; }
    else if (coat === 'black') pattern = 'points';
    else { pattern = 'white_spots'; rare = true; } // red + spots: GDD 2.6 "적반점"
  }
  if (kit === 'Be') { pattern = pattern === 'none' ? 'belt' : pattern; }
  return { coat, pattern, rare };
}

/** Random founder (shop / start) genome for a breed. */
export function randomGenome(breedId, rng) {
  const b = breeds[breedId];
  const loci = {};
  for (const L of PIG_LOCI) {
    const freq = b.alleleFreq[L.locus];
    loci[L.locus] = [rng.weighted(freq), rng.weighted(freq)];
  }
  const bv = {};
  for (const t of BV_TRAITS) bv[t] = round3(b.bvMean[t] + rng.gauss() * config.sigmaA[t] * 0.6);
  return { loci, bv };
}

/** Child genome from two parents. opts.mutationRate overrides config (tests use 0). */
export function breedGenome(sire, dam, Fbar, rng, opts = {}) {
  const mu = opts.mutationRate ?? config.mutationRate;
  const loci = {};
  for (const L of PIG_LOCI) {
    let a = rng.pick(sire.loci[L.locus]);
    const b = rng.pick(dam.loci[L.locus]);
    if (mu > 0 && rng() < mu) {
      const others = L.alleles.filter((x) => x !== a);
      a = rng.pick(others);
    }
    loci[L.locus] = [a, b];
  }
  // Infinitesimal model: parent mean + Mendelian sampling, shrunk by parental inbreeding.
  const bv = {};
  for (const t of BV_TRAITS) {
    const sd = Math.sqrt(0.5 * (1 - Fbar)) * config.sigmaA[t];
    bv[t] = round3((sire.bv[t] + dam.bv[t]) / 2 + rng.gauss() * sd);
  }
  return { loci, bv };
}

/** Breed composition of a child: average of the parents. */
export function mixBreeds(a, b) {
  const out = {};
  for (const [k, v] of Object.entries(a)) out[k] = (out[k] ?? 0) + v / 2;
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v / 2;
  return out;
}

export function breedIdOf(mix) {
  let best = null, bestV = 0;
  for (const [k, v] of Object.entries(mix)) if (v > bestV) { best = k; bestV = v; }
  return bestV >= 0.875 ? best : 'crossbred';
}

/** Weighted breed parameter (growthMult, backfatMult, breedIMF, litterBase). */
export function breedParam(mix, name) {
  let s = 0;
  for (const [k, v] of Object.entries(mix)) s += breeds[k][name] * v;
  return s;
}

// ---- Pedigree / inbreeding (tabular method via recursive kinship, 8 generations) ----
// ped: { id: { sire, dam, serial } } ; serial grows with birth order, so parents have smaller serials.
const MAX_GEN = 8;

export function kinship(ped, a, b, depth = 0) {
  if (!a || !b || depth > MAX_GEN * 2) return 0;
  if (a === b) return 0.5 * (1 + inbreeding(ped, a, depth + 1));
  const pa = ped[a], pb = ped[b];
  if (!pa || !pb) return 0;
  // Recurse on the younger animal's parents.
  const [young, old] = pa.serial >= pb.serial ? [a, b] : [b, a];
  const py = ped[young];
  if (!py.sire && !py.dam) return 0;
  return 0.5 * (kinship(ped, py.sire, old, depth + 1) + kinship(ped, py.dam, old, depth + 1));
}

export function inbreeding(ped, id, depth = 0) {
  const p = ped[id];
  if (!p || !p.sire || !p.dam) return 0;
  return kinship(ped, p.sire, p.dam, depth);
}

/** GDD 2.4 risk bands. */
export function fRisk(F) {
  return F < 0.03125 ? 'safe' : F < 0.0625 ? 'caution' : F < 0.125 ? 'danger' : 'inbred';
}

const round3 = (x) => Math.round(x * 1000) / 1000;
export { key as genotypeKey };
