# BALANCE: year-1 money for 빚더미 목장

Status: v1, 2026-11-18, backend (`backend/sim-core`). **Supersedes the numbers in GDD §3** (decision 29).
All values live in `data/economy.json` (money) and `data/items.json` / `data/config.json` (prices, growth). Change them there and rerun the simulator.

## 1. Target (decision 26)
- **Average** play barely makes the 4 payments of year 1.
- **Skilled** play makes them with slack.
- **Careless** play usually loses the farm.
- Hard rule (decision 29): every minimum payment is larger than that season's interest, so paying on time always shrinks the balance. `tests/sim/game.test.js` checks this.

## 2. Tuned numbers
| Item | Value | GDD §3 had |
|---|---|---|
| Starting cash | 1,000,000 G | "small cash" |
| Starting herd | Yorkshire-Landrace gilt (breeder) + Duroc barrow, both 14 days old | 2 piglets |
| Starting places | 2 pens × 4 = 8; piggery adds 22 (1,500,000 G), cap 30 | |
| Debt | 10,000,000 G | 30,000,000 G |
| Interest | 2% per season on the balance, after the payment; ×2 in a missed season | 3% |
| Minimum payment (season 1-4) | 300,000 / 500,000 / 700,000 / 900,000 (all > interest, 200k at most) | 600,000 flat |
| Foreclosure | 3 misses in a row; full payment incl. arrears resets; partial = miss | 3 misses |
| Carcass price | 5,000 G/kg at grade 1, mean-reverting daily drift within ±15% | |
| Grade multipliers | brand 1.45, 1+ 1.15, 1 1.00, 2 0.85, out 0.60 | same |
| Piglet (5 days) | YL 90k, Duroc 110k, Spotted 120k, Berkshire 130k, Korean Black 150k | |
| Commercial feed | starter 600, grower 550, finisher 500 G/kg | |
| Truck fee | 10,000 G per pig, taken from the sale | |

Why the debt went from 30M to 10M: at 3% a season, 30M costs 900k interest per season. With 8 places a year-1 farm earns about 2-4M in sales, so no minimum that beats the interest is payable. 10M at 2% keeps the 4-year story (about 8.3M left after year 1 for average play) and obeys the hard rule.

Unit economics that come out of the rules (Duroc, good care): about 110k piglet + about 140k feed over 35 days, sold at about 115 kg live / 89 kg carcass for about 450-520k. Margin is about 200k per pig per 40 days.

## 3. Results
`node tools/balance-sim.js --runs 200` (seeds 1-200; seeds 1001-1200 within ±7 points):

| Strategy | All 4 paid | Any miss | Foreclosed | Median cash at year end | Median herd value | Pigs shipped | Grade mix |
|---|---|---|---|---|---|---|---|
| careless | 1% | 98% | 66% | 1,060,876 | 988,500 | 16 | 1+ 1%, 1 11%, 2 74%, out 14% |
| average | 86% | 12% | 0% | 342,388 | 263,700 | 10 | 1+ 36%, 1 43%, 2 12%, out 10% |
| skilled | 98% | 3% | 2% | 1,167,262 | 555,900 | 16 | 1+ 73%, 1 16%, 2 3%, out 8% |

Reading it: average play pays on time in most years but ends with little cash. One slip (a missed feeding streak, a bad price week) costs a payment. Skilled play ends with about 1.2M spare plus pigs on the farm. Careless play makes money but spends it before payday and is foreclosed two times in three.

Brand cert ("빚더미 목장 명품") is not reached by any bot. A hand-run check shows it is possible: Korean Black, barley feed (barley 55 / corn 33 / soybean 12 + vitamin E), lairage, gentle handling, shipped at 50-54 days. That gives 13-21% brand and about 4.3-4.7% IMF. It is a late, deliberate goal, as intended.

## 4. The bots (tools/balance-sim.js)
All three play only through the public API (`listActions`/`doAction`/`endDay`), so they also test it.
| | careless | average | skilled |
|---|---|---|---|
| Forgets a pen's feed | 15% | 3% | 0% |
| Feed | grower feed all the way | stage feed | stage feed |
| Cleans below hygiene | 25 | 45 | 60 |
| Health | treats half the visible cases | treats visible cases | inspects every 3 days, vaccinates, treats |
| Piglets | Yorkshire-Landrace | YL or Duroc | Duroc, also tops up young pens |
| Shipping | random 36-50 days, no fasting, rough | ≥112 kg (38-46 days), 12-18 h fast | ≥113 kg, gentle, lairage if owned |
| Saves for payday | no | 35 days ahead | 21 days ahead, counts pigs that will sell first |
| Short on payday | nothing | sells heaviest pigs | sells heaviest pigs |

## 5. Known limits
- Bots do not breed. A real player who breeds the inherited gilt saves piglet costs after about day 95. That is upside on top of the skilled line.
- Bots never buy the piggery in year 1 (1.5M). If playtests show it is never bought, lower the price or add a loan.
- The "out" share (8-14%) is mostly PSE from RYR1 carriers in Yorkshire-Landrace stock plus DFD from long fasts. That is intended as a lesson, but watch it in playtests.
- Numbers marked [검증] in the GDD are still unchecked against the official grading standard.

## 6. Retune
```
node tools/balance-sim.js --runs 200 --set start.cash=1200000 --set "debt.minPerSeason=[300000,500000,800000,1000000]"
node tools/balance-sim.js --trace average      # day-by-day log of one run
```
