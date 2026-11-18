# Acceptance results — prototype (main a9a28f8 + agent/qa)

`node --test`: **89/89 pass, 3 runs in a row** (sim unit, UI, sprite tools, QA e2e). Browser checks run in Chromium 1280×720.
PASS = covered by an automated test that passes. GAP = not tested yet (no known failure).

| Plan § | Criteria | Result | Evidence |
|---|---|---|---|
| A Time/turns | A2 A3 A4 A5 A6 A7 | PASS | rules, smoke, backend game.test, year |
| | A1 idle time, A8 worker AP, A9 no real-time clock | GAP | — |
| B Controls | B1 keyboard move, B3 menus by click/E | PASS | smoke, ui-run (shed/dock/town/creditor by input) |
| | B2 collision, B4 typing in fields | GAP | — |
| C Start | C1–C4 | PASS | rules, backend game.test |
| | C5 breed list | GAP | — |
| D Herd cap | D1–D5 (D28) | PASS | rules |
| E Life/growth | E1–E4 | PASS | backend game.test (market weight ~day 40) |
| | E6 feed vs fat colour, E7 mixer | GAP (QA) | — |
| F Ship/grade | F2 F3 F4 F5 F6 F7 F11 | PASS | rules, backend grading.test, year determinism |
| | F8 price multipliers, F9 F10 lairage/fasting | GAP | — |
| G Genetics | G1 G9 (D31), G3–G7 | PASS | rules, backend genetics.test |
| | G2 breeding screen content, G8 invalid pairs | GAP (UI) | — |
| H Debt | H1–H6, H5a/H5b (D27), H8 balance | PASS | rules, backend game.test, year (yearComplete, 0 misses), ui-run (day 25 paid 300,000; day 53 paid 500,000) |
| | H7 overpay refused | GAP | — |
| I Facilities | I3 town/workers as menus | PASS (manual, ui-run uses town) | — |
| | I1 I2 buy mixer/lairage, I4 worker mistakes | GAP | — |
| J Save | J1 J3 J4 J5 J6 | PASS | smoke |
| | J2 browser restart | GAP | — |
| K Text | K1 no Korean in sim, K2 no missing keys | PASS | rules, tests/ui |
| | K3 number format | GAP | — |
| L Art | L1 validator, L3 real 32px adult + piglet in game | PASS | sprites.test |
| | L2 eye check | PASS adult; piglet PASS with ART-5 minor | ART-CHECK.md |

**Open issues:** ART-5 (minor, piglet tail pixels). No failing test. The GAP rows are the next tests to add if wanted.
