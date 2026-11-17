// Placeholder runtime palettes until docs/art/breeds.json arrives from the
// pixel director. Keys follow the sim's phenotype (look.coat / look.pattern),
// not the hidden genotype (decision 6).
const COAT = {
  white: ['#f7e4dc', '#eac2b8', '#c99a92', '#8e5f5c'],
  red: ['#ee8856', '#ca5b33', '#a94024', '#6a2a17'],
  black: ['#5b5263', '#3f3848', '#2b2633', '#1c1822'],
};
const SNOUT = {
  white: ['#f4b0b0', '#d98a8e', '#a8606a'],
  red: ['#f0a080', '#c9745a', '#8f4a3a'],
  black: ['#8a7484', '#665663', '#463a45'],
};
const SPOT_ON_LIGHT = COAT.black;
const SPOT_ON_DARK = ['#f7f0ea', '#e2d6cf', '#bfb0a8', '#8e7f7a'];

export function rampsFor(look) {
  const coat = COAT[look.coat] ? look.coat : 'white';
  return { coat: COAT[coat], snout: SNOUT[coat], spot: coat === 'white' ? SPOT_ON_LIGHT : SPOT_ON_DARK };
}
export const lookKey = (look) => `${look.coat}:${look.pattern}`;
