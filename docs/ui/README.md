# UI shell (frontend)

## Run
```
node tools/serve.mjs          # then open http://127.0.0.1:8080/
node --test tests/ui          # UI + stub tests
```
No build step, no dependencies. `tools/serve.mjs` takes an optional port.

## Controls
- Arrow keys / WASD: walk (free). E / Space / Enter: use what you face. Esc: close.
- N: end day. P: pig list. M: menu (save, export, import, new game). T: town.
- Click a pig or a building for its menu. Every menu and dialog works by keyboard.

## Files
- `index.html`, `styles/main.css`, `i18n/ko.json` (all Korean text, incl. 10 tone sample lines `line.*`)
- `src/ui/main.js` boot + HUD, `screens.js` dialogs, `world.js` canvas, `map.js` farm map,
  `tiles.js` placeholder tiles, `sprites.js` placeholder sheets, `palettes.js` breed colours, `dom.js` helpers.
- `src/ui/sim.js` is the only import of the simulation. It points at `src/ui/sim-stub.js`
  until `src/sim` + `docs/tech/SIM-API.md` land; then only `sim.js` changes.

## Sprites
Placeholder pig sheets are generated in code in the SPRITE-SPEC format (128x480, 32x32 cells,
15 rows, marker colours, separate `belt` / `spots` / `points` pattern layers, recoloured per breed
at runtime). If `assets/sprites/pig/pig_adult.{png,json}` and `pig_piglet.{png,json}` exist
(plus optional `pig_adult.<pattern>.png`), they are used instead with no code change.

## Test hooks (QA)
- `data-testid`: `day`, `ap`, `cash`, `end-day`, `export-save`, `import-save`, `import-file`.
- `window.__game.player` -> `{x, y, dir}` in tiles (read only); `window.__game.state`.
- `document.body.dataset.ready === "true"` once the game has booted.

## Stub contract the UI uses
`newGame, rules, act(state, action), endDay(state), previewBreeding, previewMix, debtInfo, dateOf,
stageOf, canShip, canBreed, inMarketWindow, findPig, sickCount, dailyFeedKg, capacity, penCapacity,
freePlaces, gradeCarcass, serialize, deserialize, MIX_ITEMS, COMMERCIAL, BREED_IDS`.
Pigs expose `look: {coat, pattern}` (phenotype); the UI never reads `genome` (ruling O5).
