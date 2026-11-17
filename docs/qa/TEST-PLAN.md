# 빚더미 목장 — 프로토타입 테스트 계획 (돼지, 1년 루프)

- Source: `docs/design/GDD-v0.1.md`. The decision table (결정 기록, D1–D26) overrides the body.
- Owner: QA (qa-and-test-engineer-mwkvmsta). Work id: `qa-plan`.
- Status per check: `TODO` (not testable yet) · `PASS` · `FAIL (bug id)` · `BLOCKED (reason)`.
- Level: **U** = unit test on `src/sim` (node:test, owned by backend; QA reviews), **E** = browser test in `tests/e2e` (QA), **M** = manual/eye check, **R** = code/rule review.

## How to run

```
node --test tests/          # unit + e2e (e2e skips itself if the page or Playwright is missing)
node --test tests/e2e/      # browser tests only
```
E2E uses the Playwright copy installed on this machine through `npx` (no package added to the project). Override its location with `PLAYWRIGHT_MODULE=<path to playwright/index.mjs>`.

---

## A. Time and turns (D19, D22, D25, §0.1)

| ID | Check | Expected | Level |
|---|---|---|---|
| A1 | Time does not pass on its own | Leave the page idle 60 s: day number, AP, animal stats unchanged | E |
| A2 | "하루 끝" advances exactly one day | Day N → N+1; daily tick (§0.3) runs once per animal | E, U |
| A3 | Calendar | 1 season = 28 days, 1 year = 4 seasons = 112 days | U |
| A4 | AP refills at the start of each day | AP = daily max after "하루 끝", whatever was left | E, U |
| A5 | Moving costs 0 AP | Walk 20 tiles with the keyboard: AP unchanged | E |
| A6 | Every action costs AP | Feed / clean / breed / ship etc.: AP drops by that action's cost from `data/*.json` | E, U |
| A7 | No action at 0 AP | An action costing more than the AP left is refused with a message; state unchanged | E, U |
| A8 | Hiring a worker raises daily AP | Daily max AP after hiring > before | U |
| A9 | No real-time clock | No 12-minute day / day-night timer exists in sim or UI (§0.1 real time is discarded) | R |

## B. Controls (D23)

| ID | Check | Expected | Level |
|---|---|---|---|
| B1 | Keyboard moves the character | Arrow keys (and/or WASD) move one step per press in that direction | E |
| B2 | Collision | Character cannot walk through fences/buildings or off the map | E |
| B3 | Mouse opens menus | Clicking an animal / building opens its menu; clicking outside closes it | E |
| B4 | Keyboard does not fire while a menu text field has focus | Typing a name in a field does not move the character | E |

## C. Start of game (D24, §3.1)

| ID | Check | Expected | Level |
|---|---|---|---|
| C1 | Starting herd | Exactly 2 piglets (자돈), species pig | E, U |
| C2 | Starting cash | Small positive cash (value from data file) | U |
| C3 | Starting debt | Value in `data/economy.json` (docs/tech/BALANCE.md supersedes GDD §3 numbers, D29) | U |
| C4 | Species | Only pigs can be bought or appear (D3) | U, E |
| C5 | Breeds on sale | 요크셔, 랜드레이스, 듀록, 버크셔, 재래흑돼지, 점박이 돼지 (D11, D14) — no other breed | U |

## D. Herd cap (D21)

| ID | Check | Expected | Level |
|---|---|---|---|
| D1 | Buying blocked when full | With every pen place taken, buying is refused with a message (D28) | U, E |
| D2 | Litter overflow is sold at once | Piglets beyond free places go to the feed dealer at the weaned-piglet price; cash rises by count × that price; a notice event appears; head count never exceeds capacity (D28) | U, E |
| D3 | Sold/dead pigs free a place | After shipping 1 pig from a full farm, buying 1 succeeds | U |
| D4 | Pen capacity | Start: 2 pens × 4 = 8 places. T1 piggery adds 22 → 30. Global cap 30 never exceeded (D28) | U, E |
| D5 | Breeding allowed when full, with a warning | Breeding screen shows a full-farm warning but does not block (D28) | E |

## E. Pig life cycle and growth (§0.4, §1.1)

| ID | Check | Expected | Level |
|---|---|---|---|
| E1 | Stage by age | 포유 0–4, 이유 5–12, 육성 13–24, 비육 25–40 days | U |
| E2 | Weight range per stage | Under normal care the weight stays inside the table ranges (1.4→7→30→70→115 kg) ±15% | U |
| E3 | Shipping window | A finisher is 출하 가능 (MarketReady) on days 36–42; not before 36 | U, E |
| E4 | Only the first true transition runs each day | One stage change per animal per day | U |
| E5 | health = 0 → Dead | Animal is removed from the herd, does not count toward cap | U |
| E6 | Feed affects fat colour | More barley → lower (better) fatColor; more unsaturated feed → higher | U |
| E7 | Feed mixer | Before unlock: only 3 commercial feeds; after unlock: ingredient sliders (§1.1, D15) | U, E |

## F. Shipping and grading (D7, D20, §1.1)

| ID | Check | Expected | Level |
|---|---|---|---|
| F1 | Shipping is by truck | "출하" sends pigs away by truck; no slaughter shown (D7) | E, M |
| F2 | Grade report arrives the **next day** | Ship on day N: no report on day N; report shown on day N+1 after "하루 끝" | E, U |
| F3 | Real grades only | Report grade ∈ {1+, 1, 2, 등외}. **Never "1+★" or "1++"** (D20 overrides `gradePig` in §1.1) | U, E |
| F4 | 1st grade table | carcass 83–<93 kg and backfat 17–<25 mm → 1+; 80–<98 and 15–<28 → 1; else 2. Test both sides of every boundary (82.9/83/92.9/93, 16.9/17/24.9/25, 79.9/80/97.9/98, 14.9/15/27.9/28) | U |
| F5 | Final = lower of 1st and 2nd grade | e.g. 1st = 1+, 2nd = 1 → 1 | U |
| F6 | PSE or DFD drops 2 steps | 1+ with PSE → 2; 1 with PSE → 등외 | U |
| F7 | Brand cert "빚더미 목장 명품" | Shown as a separate certificate **above** a 1+ grade, not as a grade; given iff grade 1+ AND IMF ≥ 4.0 AND fatColor ≤ 1 AND no PSE AND no DFD (D30). Test each condition failing alone → no cert | U, E |
| F8 | Price multipliers | 1+ ×1.15, 1 ×1.00, 2 ×0.85, 등외 ×0.60; cert ×1.45 over grade 1 (starting value, read from data, D30) | U |
| F9 | Lairage lowers PSE | With 계류장 built, PSE probability ×0.5 (seeded RNG, compare means over 10,000 runs ±5%) | U |
| F10 | Pre-shipping choices matter | Fasting 12–18 h + lairage + same-pen shipping gives the lowest PSE/DFD | U |
| F11 | Grading is deterministic with a seed | Same seed + same actions → same grade report | U |

## G. Genetics and breeding (D6, §2)

| ID | Check | Expected | Level |
|---|---|---|---|
| G1 | Genotype never shown (D31: no gene lab in prototype) | No screen shows allele pairs (e.g. `Nn`, `ED/e`), locus names (KIT, MC1R, RYR1) or offspring genotype probabilities. E: open every screen/menu and scan visible text; R: grep `src/ui` for genome/loci reads | E, R |
| G2 | Breeding screen content | Shows phenotype, 2-generation pedigree (parents + grandparents), expected F and its risk band (D31) | E |
| G9 | No gene lab anywhere | No gene lab building, menu item or unlock in data or UI | R, E |
| G3 | Mendel: one allele from each parent | For every locus, child alleles = one from sire + one from dam (10,000 seeded breeds, frequencies within ±2% of expected) | U |
| G4 | BV inheritance | Mean child BV = parent mean; spread shrinks with parent F (§2.3) | U |
| G5 | Inbreeding coefficient | Full-sib mating → child F = 0.25; half-sib → 0.125; unrelated → 0 | U |
| G6 | Risk label on breeding screen | F < 3.125% 안전, < 6.25% 주의, < 12.5% 위험, else 근친 | U, E |
| G7 | Spotted pig crossbreeds | Crossing 점박이 with another breed can produce a new pattern (D14) | U |
| G8 | Only males × females, both Breeder stage | Breeding two of the same sex, or a non-breeder, is refused | U, E |

## H. Debt and foreclosure (D5, D26, §3.1)

| ID | Check | Expected | Level |
|---|---|---|---|
| H1 | Payment day | Last day of each season (days 28, 56, 84, 112) — 4 payments in the 1-year loop | U, E |
| H2 | Interest | 3% of balance added on payment day | U |
| H3 | Minimum payment beats interest | For every season in `data/economy.json`: minimum payment > that season's interest, so paying on time always lowers the balance (D29 hard rule) | U |
| H4 | 1 missed payment | Late interest doubled + reputation down; game continues | U, E |
| H5 | **3 consecutive missed payments → foreclosure** | Game-over screen (압류); no further turns possible (D27) | U, E |
| H5a | Partial payment counts as missed | Paying less than the full amount due on a due day adds 1 to the miss count (D27) | U |
| H5b | Full payment resets the count | Miss, miss, pay full (incl. arrears), miss, miss → no foreclosure; count = 2 (D27) | U |
| H6 | Early repayment | Allowed any day; reduces balance; interest next payment day is lower | U, E |
| H7 | Payment amount cannot exceed cash | Refused with a message; cash never negative | U, E |
| H8 | Balance target "tight but possible" | Monte Carlo sim: an average-care strategy just meets year-1 payments; good grades leave a margin (D26) | U (backend sim) |

## I. Facilities in scope (D15, §3.3)

| ID | Check | Expected | Level |
|---|---|---|---|
| I1 | Feed mixer costs 500,000 G | Buying deducts cash; unlocks E7 | U, E |
| I2 | Lairage costs 1,500,000 G | Buying deducts cash; unlocks F9 | U, E |
| I3 | Workers and town are menus | Simple menu screens, no walkable town (D15) | E |
| I4 | Worker has stats, wage, mistakes | Wage is charged per the rule; mistakes happen at the stated rate (D8) | U |

## J. Save and load (D12)

| ID | Check | Expected | Level |
|---|---|---|---|
| J1 | Auto-save | After "하루 끝", reload the page → same day, cash, debt, herd, AP, position | E |
| J2 | Save survives a full browser restart | New browser context with the same storage → same state | E |
| J3 | Export to file | "내보내기" downloads a file; file is valid JSON with a version field | E |
| J4 | Import from file | Fresh profile, "가져오기" that file → identical state to J3's | E |
| J5 | Bad import file | Corrupt or wrong-version file is refused with a message; current game untouched | E |
| J6 | Round trip is lossless | `load(save(state))` deep-equals `state`, including RNG seed/position | U |

## K. Language and text (D16, D18)

| ID | Check | Expected | Level |
|---|---|---|---|
| K1 | All UI strings come from `i18n/ko.json` | No Hangul literals in `src/` (grep `[가-힣]` in src/ = 0 hits, except comments) | R |
| K2 | No missing keys | Every key used in `src/ui` exists in `ko.json`; no raw key shown on screen | R, E |
| K3 | Numbers exact | Money shown with thousands separators and G; grades exactly as in F3 | E |

## L. Art (D10, D13, `docs/art/SPRITE-SPEC.md`)

| ID | Check | Expected | Level |
|---|---|---|---|
| L1 | Validator passes | `tools/sprite-validate` on every sprite: size, palette, no semi-transparent pixels | U |
| L2 | Eye-check list | Each item in SPRITE-SPEC §2 checked on `art-review/pig_adult.html`, screenshot attached | M |
| L3 | Crisp pixels | Canvas drawn at integer scale with `image-rendering: pixelated` | E, R |

## M. Rule review (R): `docs/tech/SIM-API.md` + `src/sim` against GDD §1.1, §2, §3

Done when each formula in those sections is either matched in code or filed as a bug. Items: ADG, fatRatio/backfat, IMF (finisher only), fatColor, preStress/pPSE/pDFD, `gradePig` with D20 applied, price table, `breed()`, F (tabular, 8 generations), inbreeding penalty, mutation rate, debt schedule, interest, missed-payment rules.

---

## E2E smoke (definition of done for the shell)

`tests/e2e/smoke.test.mjs`: load page → no console errors → move with keyboard (AP unchanged) → "하루 끝" (day +1) → reload → same day. Expects these hooks from the frontend (agreed or to be agreed with ui-shell):

- `data-testid="day"`, `"ap"`, `"cash"`, `"end-day"`, `"export-save"`, `"import-save"` on the matching elements.
- `window.__game.player` → `{x, y}` for position (read-only debug hook), or `data-testid="player-pos"` text `x,y`.

## Design rulings (god, GDD decisions 27–31)

- **D27** Foreclosure counts *consecutive* misses; a full payment (incl. arrears) on a due day resets the count to 0; a partial payment counts as missed. → H5, H5a, H5b
- **D28** Global cap 30; pens 2 × 4 = 8 at start, T1 piggery +22; breeding allowed when full with a warning; overflow piglets sold at once at the weaned-piglet price with a notice; buying blocked when full. → D1–D5
- **D29** Debt numbers live in `data/economy.json`, tuned by `tools/balance-sim.js`; `docs/tech/BALANCE.md` supersedes GDD §3. Minimum payment > interest every season. → C3, H2, H3, H8
- **D30** Brand cert = 1+ AND IMF ≥ 4.0 AND fatColor ≤ 1 AND no PSE/DFD; ×1.45 over grade 1. → F7, F8
- **D31** No gene lab in the prototype; genotype never shown; breeding screen shows phenotype, 2-generation pedigree, expected F + risk band. → G1, G2, G9
