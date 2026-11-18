// Runtime colours for the marker slots (SPRITE-SPEC §3), keyed by the sim's
// phenotype view (pig.appearance), never by genotype (ruling O5).
// Placeholder ramps until docs/art/breeds.json arrives; then load it and pass
// it to setRamps() without touching the rest of the UI.
let COAT = {
  white: ['#f7e4dc', '#eac2b8', '#c99a92', '#8e5f5c'],
  red: ['#ee8856', '#ca5b33', '#a94024', '#6a2a17'],
  black: ['#5b5263', '#3f3848', '#2b2633', '#1c1822'],
};
let SNOUT = {
  white: ['#f4b0b0', '#d98a8e', '#a8606a'],
  red: ['#f0a080', '#c9745a', '#8f4a3a'],
  black: ['#8a7484', '#665663', '#463a45'],
};
let LIGHT = ['#f7f0ea', '#e2d6cf', '#bfb0a8', '#8e7f7a'];

export function setRamps({ coat, snout, light } = {}) {
  if (coat) COAT = { ...COAT, ...coat };
  if (snout) SNOUT = { ...SNOUT, ...snout };
  if (light) LIGHT = light;
}

// pattern code (sim) -> which pattern layer of the sheet to draw
const LAYER = { none: null, belt: 'belt', points: 'points', white_spots: 'spots', black_spots: 'spots', patchwork: 'spots' };
export const layerFor = (pattern) => LAYER[pattern] ?? (pattern && pattern !== 'none' ? 'spots' : null);

export function rampsFor(look) {
  const coat = COAT[look.coat] ? look.coat : 'white';
  const darkSpots = look.pattern === 'black_spots' || look.pattern === 'patchwork' || (look.pattern === 'spots' && coat === 'white');
  return { coat: COAT[coat], snout: SNOUT[coat], spot: darkSpots ? COAT.black : LIGHT };
}
export const lookKey = (look) => `${look.coat}:${look.pattern}`;
