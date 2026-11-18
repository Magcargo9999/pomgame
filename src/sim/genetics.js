// Species-agnostic genetics: Mendelian loci (GDD 2.2), breeding values (2.3), pedigree inbreeding (2.4).
// A genome is { species, loci: {LOCUS: [a, b]}, bv: {trait: number} }. Loci and traits come from data.
import { species as SPECIES, breeds, config, lociFor } from './data.js';

const speciesOf = (g) => g.species ?? 'pig';
const locusDef = (sp, name) => lociFor(sp).find((l) => l.locus === name);

/** Allele expressed by a 'dominant'-mode pair: the one listed first in loci.json wins. */
export function dominantAllele(name, pair, sp = 'pig') {
  const order = locusDef(sp, name).alleles;
  return order.indexOf(pair[0]) <= order.indexOf(pair[1]) ? pair[0] : pair[1];
}

/** Effect entry of an 'additive' locus, keyed like 'NN' / 'Nn' / 'nn' (alleles in loci.json order). */
export function additiveEffect(genome, name) {
  const L = locusDef(speciesOf(genome), name);
  const pair = [...genome.loci[name]].sort((a, b) => L.alleles.indexOf(a) - L.alleles.indexOf(b));
  return L.effects[pair.join('')];
}

/** Random founder genome for a breed (shop or start). */
export function randomGenome(breedId, rng) {
  const b = breeds[breedId];
  const sp = b.species;
  const loci = {};
  for (const L of lociFor(sp)) {
    const freq = b.alleleFreq[L.locus];
    loci[L.locus] = [rng.weighted(freq), rng.weighted(freq)];
  }
  const bv = {};
  for (const t of SPECIES[sp].bvTraits) bv[t] = round3((b.bvMean[t] ?? 0) + rng.gauss() * SPECIES[sp].sigmaA[t] * 0.6);
  return { species: sp, loci, bv };
}

/** Child genome from two parents. opts.mutationRate overrides config (tests use 0). */
export function breedGenome(sire, dam, Fbar, rng, opts = {}) {
  const sp = speciesOf(sire);
  const mu = opts.mutationRate ?? config.mutationRate;
  const loci = {};
  for (const L of lociFor(sp)) {
    let a = rng.pick(sire.loci[L.locus]);
    const b = rng.pick(dam.loci[L.locus]);
    if (mu > 0 && rng() < mu) a = rng.pick(L.alleles.filter((x) => x !== a));
    loci[L.locus] = [a, b];
  }
  // Infinitesimal model: parent mean + Mendelian sampling, shrunk by parental inbreeding.
  const bv = {};
  for (const t of SPECIES[sp].bvTraits) {
    const sd = Math.sqrt(0.5 * (1 - Fbar)) * SPECIES[sp].sigmaA[t];
    bv[t] = round3((sire.bv[t] + dam.bv[t]) / 2 + rng.gauss() * sd);
  }
  return { species: sp, loci, bv };
}

/** Breed composition of a child: average of the parents. */
export function mixBreeds(a, b) {
  const out = {};
  for (const [k, v] of Object.entries(a)) out[k] = (out[k] ?? 0) + v / 2;
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v / 2;
  return out;
}

/** Breed id shown to the player: a breed with at least 87.5% share, else 'crossbred'. */
export function breedIdOf(mix) {
  let best = null, bestV = 0;
  for (const [k, v] of Object.entries(mix)) if (v > bestV) { best = k; bestV = v; }
  return bestV >= 0.875 ? best : 'crossbred';
}

/** Weighted breed parameter (any numeric field of breeds.json). */
export function breedParam(mix, name) {
  let s = 0;
  for (const [k, v] of Object.entries(mix)) s += breeds[k][name] * v;
  return s;
}

// ---- Pedigree / inbreeding (recursive kinship = tabular method, about 8 generations) ----
// ped: { id: { sire, dam, serial } }; serial grows with birth order, so parents have smaller serials.
const MAX_DEPTH = 16;

export function kinship(ped, a, b, depth = 0) {
  if (!a || !b || depth > MAX_DEPTH) return 0;
  if (a === b) return 0.5 * (1 + inbreeding(ped, a, depth + 1));
  const pa = ped[a], pb = ped[b];
  if (!pa || !pb) return 0;
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

/** Inbreeding depression multiplier for a trait: 1 - F * depression[trait] (data/species.json). */
export function depression(sp, F, trait) {
  return 1 - F * (SPECIES[sp].inbreedingDepression[trait] ?? 0);
}

const round3 = (x) => Math.round(x * 1000) / 1000;
