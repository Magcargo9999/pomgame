// Debt schedule (decisions 26, 27, 29). Numbers live in data/economy.json.
import { config } from './data.js';

const DPS = config.time.daysPerSeason;
export const seasonOf = (day) => Math.floor((day - 1) / DPS);
export const isPayday = (day) => day % DPS === 0;
export const nextDueDay = (day) => Math.ceil(day / DPS) * DPS;

export const newDebt = () => ({ balance: config.debt.initial, paidThisSeason: 0, arrears: 0, missed: 0 });

export const seasonMin = (s) => config.debt.minPerSeason[seasonOf(s.day) % config.debt.minPerSeason.length];
/** Due this season = this season's minimum + unpaid minimums from earlier seasons, capped at the balance. */
export const minDue = (s) => Math.min(seasonMin(s) + s.debt.arrears, s.debt.balance);

/** Voluntary or automatic payment. Returns the amount actually paid. */
export function pay(s, amount) {
  const amt = Math.max(0, Math.min(Math.floor(amount), s.debt.balance, s.cash));
  s.cash -= amt; s.debt.balance -= amt; s.debt.paidThisSeason += amt;
  return amt;
}

/**
 * Payday: the amount due must be paid in full, or it is a miss. A full payment resets the miss count;
 * maxMissed misses in a row = foreclosure. The sim auto-pays when the cash is there.
 */
export function payday(s, ev) {
  const d = s.debt;
  let due = Math.max(0, minDue(s) - d.paidThisSeason);
  let missedNow = false;
  if (due > 0 && s.cash >= due) { pay(s, due); due = 0; }
  if (due > 0) { missedNow = true; d.missed++; d.arrears = due; ev('debtMissed', { missed: d.missed, arrears: due }); }
  else { d.missed = 0; d.arrears = 0; }
  const interest = Math.round(d.balance * config.debt.ratePerSeason * (missedNow ? config.debt.lateRateMult : 1));
  d.balance += interest;
  ev('debtDue', { paid: d.paidThisSeason, interest, balance: d.balance, missed: d.missed, arrears: d.arrears });
  d.paidThisSeason = 0;
  if (d.missed >= config.debt.maxMissed) { s.phase = 'foreclosed'; ev('foreclosed'); }
}

export function debtView(s) {
  return { balance: s.debt.balance, ratePerSeason: config.debt.ratePerSeason, minPerSeason: seasonMin(s), arrears: s.debt.arrears,
    minDue: minDue(s), paidThisSeason: s.debt.paidThisSeason, nextDueDay: nextDueDay(s.day), missed: s.debt.missed, maxMissed: config.debt.maxMissed };
}
