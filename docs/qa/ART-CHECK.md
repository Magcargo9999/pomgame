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

## Piglet (32px, main a9a28f8) — `assets/sprites/pig/piglet*.png`

- **L1:** `piglet.png` and its 3 layers PASS `sprite-validate`. The body is at most 18×13 px, inside the 20×20 juvenile box (GDD 4.2). Only the `happy` frame #1 leaves the anchor row, which is the intended hop.
- **L3:** the manifest wires `pig.piglet`; `tests/e2e/sprites.test.mjs` validates it with the rest.
- **L2 eye check** (`art-review/piglet_x8.png`, detail `tests/e2e/screenshots/art-piglet-detail.png`, 10×):

| Check | Result |
|---|---|
| Species and direction readable at 1× | PASS |
| Eyes 1–2 px; legs apart | PASS |
| Head ≥ 30% of body | PASS |
| Ramp 3–4 steps | PASS |
| Stable across frames | PASS |
| **ART-5 detached pixels** | **MINOR**: a 1 px dot (idle_up, sleep_up) or a 2 px dash (idle_right, eat_right) floats 1–2 px away from the body, most likely a tail that does not touch the rump. It reads as dirt at 1×. Expected: the tail touches the body. |
