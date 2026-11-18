// Carcass grading (GDD 1.1). Real grades stop at 1+; 'brand' = 1+ plus the farm cert (decision 20).
import { config } from '../../data.js';

/** Primary grade from carcass weight and backfat: 3 = 1+, 2 = 1, 1 = 2. */
export function grade1(carcassKg, backfat) {
  if (carcassKg >= 83 && carcassKg < 93 && backfat >= 17 && backfat < 25) return 3;
  if (carcassKg >= 80 && carcassKg < 98 && backfat >= 15 && backfat < 28) return 2;
  return 1;
}

/** Quality grade from IMF, meat colour, fat colour, belly score. */
export function grade2(c) {
  let q = 0;
  q += c.imf >= 3.0 ? 3 : c.imf >= 2.0 ? 2 : 1;
  q += (c.meatColor >= 3 && c.meatColor <= 5) ? 3 : (c.meatColor === 2 || c.meatColor === 6) ? 2 : 1;
  q += c.fatColor <= 2 ? 3 : c.fatColor <= 4 ? 2 : 1;
  q += c.bellyScore >= 0.7 ? 3 : c.bellyScore >= 0.4 ? 2 : 1;
  return q >= 11 ? 3 : q >= 8 ? 2 : 1;
}

const CODES = ['out', '2', '1', '1+'];

/**
 * c = { carcassKg, backfat, imf, meatColor, fatColor, bellyScore, PSE, DFD, defect }
 * returns { grade1, grade2, grade: 'brand'|'1+'|'1'|'2'|'out' }
 */
export function gradePig(c, cert = config.brandCert) {
  const g1 = grade1(c.carcassKg, c.backfat);
  const g2 = grade2(c);
  let g = Math.min(g1, g2);
  if (c.PSE || c.DFD) g = Math.max(0, g - 2);
  else if (c.defect) g = Math.max(0, g - 1);
  let grade = CODES[g];
  if (g === 3 && c.imf >= cert.imfMin && c.fatColor <= cert.fatColorMax && !c.PSE && !c.DFD) grade = 'brand';
  return { grade1: CODES[g1], grade2: CODES[g2], grade };
}
