# Art check — pig adult (main @ 1065434, pixel 10b7a10)

QA, 2026-11-18. Spec: `docs/art/SPRITE-SPEC.md` §2. Plan ids L1–L3.

> **Decision (god, GDD D10):** the game uses the 32px `pig_adult` only. The 128px realistic sheet is out of the prototype: its files stay, nothing references them, and ART-1..3 are **not to be fixed now**. SPRITE-SPEC rules stand as written (head ≥ 30% applies).

## L1 Automatic checks (`node tools/sprite-validate.cjs <sheet>`)

| Sheet | Cell | Result |
|---|---|---|
| pig/pig_adult.png | 32×32 | PASS |
| pig/pig_adult.{spots,belt,points}.png (`--layer`) | 32×32 | PASS ×3 |
| pig/pig_adult_realistic.png | 128×128 | PASS |
| pig/pig_adult_realistic.{spots,belt,points}.png (`--layer`) | 128×128 | PASS ×3 |

Also green: `node --test tools/sprite-validate.test.cjs` (5/5), `validate-pig.cjs`, `validate-realistic-pig.cjs` (0 failures).

## L2 Eye check (SPRITE-SPEC §2)

### pig_adult (32px, cartoon) — source: `art-review/pig_adult.browser.png`

| Check | Result |
|---|---|
| Species and direction readable from the silhouette at 1× | PASS (snout front, curly tail back, side profile) |
| Eyes 1–2 px; legs apart by ≥ 1 px | PASS |
| Head ≥ 30% of body | PASS (side view about 1/3) |
| 3–4 step ramp per material, dithering only on purpose | PASS for coat (4 browns); pink ear/snout uses 2 steps (minor) |
| Colour, proportions and outline stable across frames | PASS |

### pig_adult_realistic (128px) — OUT OF PROTOTYPE, findings kept for later — source: `art-review/pig_adult_realistic.browser.png`, detail render `tests/e2e/screenshots/art-realistic-detail.png` (marker colours, 2×)

| Check | Result |
|---|---|
| Silhouette readable | PASS for standing poses |
| **ART-1 idle_down (row 0) and other `_down` rows** | **FAIL**: a curly tail is drawn on top of the head in the front view. Expected: the tail is hidden or behind the body when the pig faces the camera |
| **ART-2 eat_right (row 8)** | **FAIL**: hard vertical seam at the neck; the lowered head is a block pasted onto a body cut straight at the shoulder. Expected: a continuous neck line, as in idle_right |
| ART-3 sleep_up (row 10) / sleep_down (row 9) | CHECK: lying poses read as a flat X shape with splayed legs at 1×; species is hard to tell |
| Head ≥ 30% of body | Not met by design: the realistic direction (`docs/art/USER-REFERENCE-DIRECTION.md`) conflicts with this spec rule; god to decide which rule applies |

## L3 In game

**ART-4** `assets/sprites/manifest.json` has `pig.adult: null`, so the game draws code placeholders. Frontend to set it to `pig_adult` (god). Test: `tests/e2e/sprites.test.mjs`. It fails until the manifest is set; with the entry set locally all 4 checks pass and the real sheet renders at 1280×720 (`tests/e2e/screenshots/sprites-ingame-1280x720.png`).
