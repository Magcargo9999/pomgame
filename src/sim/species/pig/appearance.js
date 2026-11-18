// Pig coat and pattern from the genotype (GDD 2.7). Feeds the sprite palette swap + pattern layer (SPRITE-SPEC §3).
import { dominantAllele } from '../../genetics.js';

/** -> { coat: 'white'|'black'|'red', pattern: 'none'|'belt'|'points'|'white_spots'|'black_spots'|'patchwork', rare } */
export function appearance(genome) {
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
    if (mc1r === 'EP') { pattern = 'patchwork'; rare = true; }   // spotted breed x Berkshire F2
    else if (coat === 'black') pattern = 'points';               // Berkshire
    else { pattern = 'white_spots'; rare = true; }               // red + spots: GDD 2.6 "적반점"
  }
  if (kit === 'Be' && pattern === 'none') pattern = 'belt';
  return { coat, pattern, rare };
}
