// Species registry. Adding a species = data (species.json, breeds.json, loci.json, items) + one module here.
//
// Contract every species module implements (see species/pig/index.js):
//   id                                  'pig'
//   newAnimal({id, serial, sex, breedMix, genome, F, sireId, damId, bornDay, penId, weightKg}) -> animal (with species field)
//   weightForAge(ageDays) -> kg         for founders that enter mid-life
//   ageOf(a, day), stageOf(a, day)      life stage code (shown to the UI)
//   canShip(a, day), inMarketWindow(a, day)
//   ration(a, day) -> kg feed today
//   tick(a, env, rng) -> ['clinical'|'chronic'|'recovered'|'died', ...]   env = {day, pen:{hygiene, density}, fed, damNursing}
//   slaughter(a, ship, rng) -> carcass values
//   grade(carcass) -> {grade1, grade2, grade}
//   appearance(genome) -> {coat, pattern, rare}
//   gradeCodes                          grade codes, best first
import pig from './pig/index.js';

const REGISTRY = { pig };

export function speciesModule(id) {
  const m = REGISTRY[id ?? 'pig'];
  if (!m) throw new Error(`species.unknown:${id}`);
  return m;
}

export const speciesIds = () => Object.keys(REGISTRY);
