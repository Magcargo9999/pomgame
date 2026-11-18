// Pig species module. game.js only calls the functions listed in species/index.js (the registry contract).
import { newPig, weightForAge, ageOf, stageOf, canShip, inMarketWindow, rationKg, tickPig, slaughter } from './animal.js';
import { gradePig } from './grading.js';
import { appearance } from './appearance.js';

export default {
  id: 'pig',
  newAnimal: newPig,
  weightForAge,
  ageOf,
  stageOf,
  canShip,
  inMarketWindow,
  ration: rationKg,
  tick: tickPig,
  slaughter,
  grade: gradePig,
  appearance,
  gradeCodes: ['brand', '1+', '1', '2', 'out'],
};
