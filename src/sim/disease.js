// Species-agnostic sickness state machine (GDD 0.5).
// healthy -> subclinical (hidden) -> clinical -> chronic | dead; treatment -> recovering -> healthy.
import { config } from './data.js';

const D = config.disease;
export const PRODUCTIVITY = { healthy: 1, subclinical: 0.9, clinical: 0.5, recovering: 0.9, chronic: 0.8 };

export const newDisease = () => ({ state: 'healthy', days: 0, detected: false });

/** Public condition: undetected subclinical sickness reads as healthy. */
export function conditionOf(a) {
  const s = a.disease.state;
  if (s === 'subclinical') return a.disease.detected ? 'sick' : 'healthy';
  if (s === 'clinical') return 'sick';
  return s;
}

/**
 * One day of sickness. env = { day, hygiene, density, stress, base? }
 * Returns 'clinical' | 'chronic' | 'recovered' | 'died' | null.
 */
export function stepDisease(a, env, rng) {
  const d = a.disease;
  if (d.state === 'healthy') {
    const vacc = a.vaccinatedUntil >= env.day ? D.vaccineFactor : 1;
    const p = (env.base ?? D.pInfectBase) * Math.max(0.1, 1 - env.hygiene / 100) * (1 + env.stress / 100)
      * Math.max(1, env.density) * vacc;
    if (rng.chance(p)) { d.state = 'subclinical'; d.days = 0; d.detected = false; }
    return null;
  }
  d.days += 1;
  if (d.state === 'subclinical' && d.days >= D.subclinicalDays) { d.state = 'clinical'; d.days = 0; return 'clinical'; }
  if (d.state === 'clinical' && d.days >= D.neglectDays) {
    if (rng.chance(D.pDeathNeglect)) return 'died';
    d.state = 'chronic'; d.days = 0; return 'chronic';
  }
  if (d.state === 'recovering' && d.days >= D.recoverDays) { d.state = 'healthy'; d.days = 0; d.detected = false; return 'recovered'; }
  return null;
}

/** Treatment works on detected subclinical or clinical cases. */
export const treatable = (a) => (a.disease.state === 'subclinical' && a.disease.detected) || a.disease.state === 'clinical';

export function treat(a) {
  a.disease.state = 'recovering'; a.disease.days = 0;
  a.withdrawalDays = D.withdrawalDays;
}
