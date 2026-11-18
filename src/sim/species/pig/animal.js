// Pig animal: creation, life stage, daily tick (GDD 0.3 order), carcass at slaughter.
// Shared rules (genetics, sickness) come from ../../; only pig biology lives here.
import { config } from '../../data.js';
import { breedParam, additiveEffect, depression } from '../../genetics.js';
import { newDisease, stepDisease, PRODUCTIVITY } from '../../disease.js';

const ryr1Effect = (genome) => additiveEffect(genome, 'RYR1');

const G = config.growth;
const LIFE = config.life;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

/** Rough live weight for a given age, used for founders that enter mid-life. */
export function weightForAge(age) {
  if (age <= 0) return LIFE.birthKg;
  if (age < 5) return LIFE.birthKg + age * 1.1;
  if (age < 13) return 7 + (age - 5) * 2.9;
  if (age < 25) return 30 + (age - 13) * 3.3;
  return Math.min(115, 70 + (age - 25) * 2.8);
}

export function newPig({ id, serial, sex, breedMix, genome, F = 0, sireId = null, damId = null, bornDay, penId, weightKg }) {
  const w = weightKg ?? LIFE.birthKg;
  return {
    id, species: 'pig', name: null, serial, sex, castrated: false,
    role: 'finisher', // every pig is raised for market unless the player keeps it as a breeder
    breedMix, genome, F, sireId, damId, bornDay, penId,
    weightKg: r1(w), backfatMm: r1(1 + w * 0.12), imf: 0, imfStarted: false,
    fatColorSum: 0, fatColorDays: 0, vitEDays: 0,
    health: 100, stress: 15, chronicStress: 15, hunger: 10, affinity: 20,
    disease: newDisease(),
    withdrawalDays: 0, vaccinatedUntil: 0,
    pregnantDueDay: null, pregnantBy: null, lactatingUntil: 0, matingPending: null, pettedDay: 0,
  };
}

export const ageOf = (pig, day) => day - pig.bornDay;

export function stageOf(pig, day) {
  if (pig.pregnantDueDay != null) return 'pregnant';
  if (pig.lactatingUntil >= day) return 'lactating';
  const a = ageOf(pig, day);
  if (a < LIFE.nurseryAt) return 'suckling';
  if (a < LIFE.growerAt) return 'nursery';
  if (a < LIFE.finisherAt) return 'grower';
  if (pig.role === 'finisher') return 'finisher';
  return a < LIFE.matureAt ? 'grower' : 'breeder';
}

export function canShip(pig, day) {
  const st = stageOf(pig, day);
  if (!['grower', 'finisher', 'breeder'].includes(st)) return false;
  if (pig.disease.state === 'clinical') return false;
  return pig.withdrawalDays <= 0;
}

export function inMarketWindow(pig, day) {
  const a = ageOf(pig, day);
  return pig.role === 'finisher' && a >= LIFE.marketWindow[0] && a <= LIFE.marketWindow[1];
}


/** Feed the pig would eat today at full ration (kg). */
export function rationKg(pig, day) {
  const st = stageOf(pig, day);
  if (st === 'suckling') return 0;
  if (G.maintenanceKg[st] != null) return G.maintenanceKg[st];
  return potentialAdg(pig, st) * G.fcr[st];
}

function potentialAdg(pig, st) {
  let adg = G.stageBase[st] * breedParam(pig.breedMix, 'growthMult') * (1 + pig.genome.bv.growth * 0.08);
  if (pig.weightKg > 115) adg *= Math.max(0.25, 1 - (pig.weightKg - 115) / 70);
  if (st === 'breeder' || st === 'pregnant') adg *= pig.weightKg > 170 ? 0 : 1;
  return adg;
}

/**
 * Daily tick for one pig.
 * env = { day, pen:{hygiene, density}, fed:{fraction, props} | null, damNursing:boolean }
 * returns list of event-ish strings handled by the caller: 'clinical','recovered','chronic','died'
 */
export function tickPig(pig, env, rng) {
  const out = [];
  const st = stageOf(pig, env.day);
  const fed = env.fed;
  const fraction = st === 'suckling' ? (env.damNursing ? 1 : 0.4) : (fed ? fed.fraction : 0);

  // 1. Feed intake.
  pig.hunger = clamp(fraction >= 0.95 ? 10 : pig.hunger + 40 * (1 - fraction), 0, 100);
  const props = fed?.props ?? { energy: 1, protein: 1.2, unsat: 0.2, barley: 0.1, vitE: 0 };
  const need = G.proteinNeed[st] ?? 1;
  const pIdx = props.protein / need;
  const energyF = clamp(props.energy, 0.7, 1.15);
  const proteinF = Math.min(1, 0.4 + 0.6 * pIdx);
  const lysineRestrict = st === 'finisher' && pIdx >= 0.75 && pIdx < 0.92;

  // 2. Growth.
  let adg = 0;
  if (st !== 'lactating') {
    adg = potentialAdg(pig, st) * (st === 'suckling' ? 1 : energyF * proteinF)
      * (pig.health / 100) * (1 - pig.stress / 200)
      * PRODUCTIVITY[pig.disease.state] * depression('pig', pig.F, 'growth') * fraction;
    if (lysineRestrict) adg *= 0.95;
  } else {
    pig.weightKg = Math.max(100, pig.weightKg - 1.0 * (1 - fraction * 0.6));
  }
  adg = Math.max(0, adg);
  if (adg > 0 && ['nursery', 'grower', 'finisher', 'suckling'].includes(st)) {
    const lean = (pig.genome.bv.lean ?? 0) * 0.03 + ryr1Effect(pig.genome).lean;
    const fatRatio = clamp((0.18 + 0.10 * (energyF / Math.max(0.6, pIdx) - 1) - lean) * breedParam(pig.breedMix, 'backfatMult'), 0.05, 0.45);
    pig.backfatMm = r1(pig.backfatMm + adg * fatRatio * G.backfatPerKgFat);
  }
  pig.weightKg = r1(Math.min(G.maxWeight, pig.weightKg + adg));

  if (st === 'finisher') {
    if (!pig.imfStarted) { pig.imf = G.imfStart * breedParam(pig.breedMix, 'breedIMF'); pig.imfStarted = true; }
    if (fraction > 0) {
      pig.imf += G.imfPerDay * (1 + pig.genome.bv.imf * 0.15) * (lysineRestrict ? 1.25 : 1)
        * breedParam(pig.breedMix, 'breedIMF') * (1 - pig.stress / 150) * fraction;
      pig.fatColorSum += clamp(1 + 4 * props.unsat - 1.5 * props.barley, 1, 7);
      pig.fatColorDays += 1;
      if (props.vitE >= 0.005) pig.vitEDays += 1;
    }
    pig.imf = r2(pig.imf);
  }

  // 3. Stress (moves 30% toward today's target).
  const target = 10 + Math.max(0, env.pen.density - 1) * 60 + (100 - env.pen.hygiene) * 0.25
    + (fraction < 0.95 && st !== 'suckling' ? 25 * (1 - fraction) : 0)
    + (pig.disease.state === 'clinical' ? 15 : 0) - pig.affinity * 0.05;
  pig.stress = r1(clamp(pig.stress + (target - pig.stress) * 0.3, 0, 100));
  pig.chronicStress = r1(pig.chronicStress * 0.85 + pig.stress * 0.15);

  // 4. Sickness (shared state machine, GDD 0.5).
  const d = pig.disease;
  const sick = stepDisease(pig, { day: env.day, hygiene: env.pen.hygiene, density: env.pen.density, stress: pig.stress }, rng);
  if (sick === 'died') { out.push('died'); return out; }
  if (sick) out.push(sick);
  // Health.
  let dh = 3;
  if (d.state === 'clinical') dh = -6;
  if (pig.hunger > 60) dh -= 5;
  const cap = d.state === 'chronic' ? 80 : 100;
  pig.health = r1(clamp(pig.health + dh, 0, cap));
  if (pig.health <= 0) { out.push('died'); return out; }
  if (pig.withdrawalDays > 0) pig.withdrawalDays -= 1;
  return out;
}

/** Carcass values at slaughter. ship = { fast, gentle, useLairage, mixed } */
export function slaughter(pig, ship, rng) {
  const fastHours = ship.fast === 'none' ? 6 : ship.fast === 'long' ? 30 : 15;
  const preStress = 0.6 * 25 + (ship.mixed ? 20 : 0) + (ship.gentle ? 0 : 15)
    + (fastHours < 12 ? 10 : 0) + pig.stress * 0.3;
  const eff = ryr1Effect(pig.genome);
  const pPSE = eff.pPSE * (1 + preStress / 50) * (ship.useLairage ? 0.5 : 1);
  const pDFD = (fastHours > 24 ? 0.10 : 0.01) + pig.chronicStress / 400;
  const PSE = rng.chance(pPSE);
  const DFD = !PSE && rng.chance(pDFD);
  const liveKg = pig.weightKg * (fastHours > 24 ? 0.98 : 1);
  const carcassKg = r1(liveKg * G.dressing);
  const backfat = r1(pig.backfatMm);
  let meatColor = Math.round(4 + rng.gauss() * (pig.vitEDays >= 5 ? 0.4 : 0.8));
  if (PSE) meatColor = 1 + rng.int(2);
  if (DFD) meatColor = 6 + rng.int(2);
  meatColor = clamp(meatColor, 1, 7);
  const fatColor = clamp(Math.round(pig.fatColorDays ? pig.fatColorSum / pig.fatColorDays : 3), 1, 7);
  const bellyScore = r2(clamp(1 - Math.abs(backfat - 21) / 12 - Math.max(0, Math.abs(carcassKg - 88) - 5) / 25, 0, 1));
  const defect = pig.disease.state === 'subclinical' && rng.chance(0.3);
  return { liveKg: r1(liveKg), carcassKg, backfat, imf: r2(pig.imf || 1.0), meatColor, fatColor, bellyScore, PSE, DFD, defect };
}

