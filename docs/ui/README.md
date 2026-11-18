# UI (frontend)

## Run
```
node tools/serve.mjs          # then open http://127.0.0.1:8080/
node --test tests/            # sim + UI tests
```
No build step, no dependencies. `tools/serve.mjs` takes an optional port. The page must be served over http (the sim imports JSON with import attributes).

## Controls
- Arrow keys / WASD: walk (free). E / Space / Enter: use what you face. Esc: close.
- N: end day. P: pig list. M: menu (save, export, import, past grade sheets, new game). T: town.
- Click a pig or a building for its menu. Every menu and dialog works by keyboard.

## How the UI talks to the sim
- `src/ui/sim.js` is the only import of the simulation (`docs/tech/SIM-API.md`).
- The UI keeps the opaque `state`, sends `doAction` / `endDay`, and draws from `getView(state)`.
- Menus come from `listActions(state, target)`: disabled entries show the sim's `reason` code via `error.<code>` in `i18n/ko.json`.
- Events are shown with `event.<type>` strings (`app.eventText` in `main.js` fills in names, pens, money).
- The UI reads `data/items.json` and `data/config.json` for display only (prices, mix preview, market window). It never reads `genotype` or `bv` (ruling O5; a test enforces it).

## Files
| File | Role |
|---|---|
| `index.html`, `styles/main.css` | page and styles |
| `i18n/ko.json` | every Korean string; tone sample lines are `line.*` |
| `src/ui/main.js` | boot, HUD, app layer (act, endDay, save, names, event text) |
| `src/ui/screens.js` | menus and dialogs (pig list/detail, breeding, feed, shipping, report, town, menu, morning) |
| `src/ui/world.js` | canvas: map, player movement, pigs, clicks |
| `src/ui/map.js` | farm map, pen slots, camera and integer scale |
| `src/ui/tiles.js` | placeholder tile art |
| `src/ui/sprites.js` | placeholder sprite sheets in SPRITE-SPEC format, recolour |
| `src/ui/palettes.js` | runtime colours per appearance (coat, pattern) |
| `src/ui/dom.js` | element builder, modal with focus trap, popup menu, toasts |
| `assets/sprites/manifest.json` | which real sprite sheets to load |

## How to add things
- **A sprite sheet**: put the PNG + JSON (SPRITE-SPEC §6) under `assets/sprites/<species>/` and add it to `assets/sprites/manifest.json`, e.g. `"pig": {"adult": {"sheet": "pig/pig_adult.png", "meta": "pig/pig_adult.json", "layers": {"belt": "pig/pig_adult.belt.png"}}}`. No code change. Unlisted sheets use the code-drawn placeholders.
- **Breed colours**: change the ramps in `palettes.js` (or call `setRamps` with `docs/art/breeds.json` once it exists).
- **A new item, breed, worker, event or error code from the sim**: add its `item.<id>` / `breed.<id>` / `worker.<id>` / `event.<type>` / `error.<code>` string to `ko.json`. `tests/ui/ui.test.mjs` fails if one is missing.
- **A new species** (cattle, chickens): the sim adds a species module; the UI needs its sheets in the manifest, a `drawX` in `world.js` keyed on the species code, and its strings. Menus and actions already come from `listActions`.
- **A new pen or building on the map**: pen slots are in `map.js` (`PENS`); the sim's pens fill them in order. Buildings are `BUILDINGS` plus drawing in `tiles.js` and a menu entry in `screens.objectMenu`.

## Test hooks (QA)
- `data-testid`: `day`, `ap`, `cash`, `end-day`, `export-save`, `import-save`, `import-file`, `pay-due`.
- `window.__game.player` -> `{x, y, dir}` in tiles (read only); `window.__game.state`, `window.__game.view`.
- `window.__ranch = { app, sim, screens, world }`; `world.player` -> `{tx, ty, x, y, dir}`.
- `document.body.dataset.ready === "true"` once the game has booted. No console errors on a clean load.
