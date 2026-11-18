# ARCHITECTURE: 빚더미 목장

Plain JavaScript ES modules, Canvas 2D, no framework, no bundler, no npm dependencies. Tests use Node's built-in `node:test`.
Run: `node tools/serve.mjs` → http://127.0.0.1:8080/ . Test: `node --test tests/`.

## 1. Folders
| Path | Owner | What |
|---|---|---|
| `data/*.json` | backend | Every rule number: `config.json` (time, life stages, growth, sickness), `economy.json` (start cash, debt, market, grade prices), `species.json`, `breeds.json`, `loci.json`, `items.json` (shop, feeds, facilities, workers) |
| `src/sim/` | backend | Rule engine. Pure JS, no DOM, seeded RNG, deterministic. Public surface = `src/sim/index.js`, documented in `docs/tech/SIM-API.md` |
| `src/ui/`, `index.html`, `styles/`, `i18n/ko.json` | frontend | Screens, canvas, input, Korean text. Imports the sim only through `src/ui/sim.js` |
| `assets/sprites/` | art | PNG sheets + meta JSON per `docs/art/SPRITE-SPEC.md` |
| `tests/sim/` backend, `tests/ui/` frontend, `tests/e2e/` QA | each | `node:test` |
| `tools/` | shared | `serve.mjs` (dev server), `balance-sim.js` (economy tuning), sprite tools |
| `docs/` | shared | `design/GDD-v0.1.md` (rules), `tech/SIM-API.md`, `tech/BALANCE.md`, this file, `art/SPRITE-SPEC.md`, `ui/README.md` |

## 2. Simulation core (`src/sim/`)
```
index.js            public API (re-exports)
game.js             state, actions (ACTIONS table), endDay (the night), getView, listActions, previews
species/index.js    species registry + the module contract
species/pig/        pig biology: animal.js (stages, growth, tick, slaughter), grading.js, appearance.js, index.js
genetics.js         shared: loci, breed(), breeding values, kinship/inbreeding, risk bands
disease.js          shared: sickness state machine (GDD 0.5), treatment
debt.js             shared: minimum due, arrears, payday, foreclosure
feed.js             shared: feed properties from ingredient shares
save.js             SAVE_VERSION + MIGRATIONS, serialize/deserialize
rng.js              seeded RNG (mulberry32), state stored in the game state
data.js             loads data/*.json
```
Principles:
- **State is plain JSON.** `doAction` and `endDay` clone the input and return a new state; the input is never changed. The RNG state is stored in the game state, so a save replays exactly.
- **Codes, not text.** The sim emits codes (`event.type`, `error.code`, ids). All Korean lives in `i18n/ko.json`.
- **Hidden information stays inside.** `getView` is the filter: no genotype, no breeding values, no undetected sickness (decision 31).
- **Animals list.** The state keeps animals in `state.pigs` (name kept for the prototype and QA tests). Each animal has `species`; all per-animal calls go through `speciesModule(animal.species)`.

## 3. How to add a species (for example cattle)
1. `data/species.json`: add `"cattle": { "idPrefix": "COW", "bvTraits": [...], "sigmaA": {...}, "inbreedingDepression": {...} }`.
2. `data/loci.json`: add its loci with `"species": "cattle"` (the GDD already lists MC1R, POLLED, MSTN, CSN2, BLAD).
3. `data/breeds.json`: add breeds with `"species": "cattle"`, `alleleFreq` for every cattle locus, `bvMean`, and the breed numbers your module reads.
4. `src/sim/species/cattle/index.js`: implement the contract in `species/index.js` (newAnimal, stageOf, ration, tick, slaughter, grade, appearance ...). Reuse `genetics.js`, `disease.js` (`stepDisease`, `PRODUCTIVITY`).
5. Register it in `species/index.js` (`REGISTRY = { pig, cattle }`).
6. Products (milk, eggs): add an action in `game.js` ACTIONS and its events; list it in SIM-API.md.
7. Tests: `tests/sim/registry.test.js` checks the contract and data automatically; add rule tests in `tests/sim/<species>.test.js`.
8. If the state shape changes, bump `SAVE_VERSION` in `save.js` and add a migration.

## 4. How to add a facility or item
1. `data/items.json` → `facilities.<id>` with `price` (and e.g. `capacity`). Buying already works through `buy {itemId}`, and the shop list picks it up.
2. Give it an effect where it applies (for example `lairage` halves PSE risk in `species/pig/animal.js` slaughter; `piggery` adds a pen in `game.js` buy). Write a test for the effect.
3. Add `item.<id>` to `i18n/ko.json`. List it in SIM-API.md §3.

## 5. How to add a sprite
Follow `docs/art/SPRITE-SPEC.md`: sheet + meta JSON in `assets/sprites/<species>/`, marker colours for coat/spot/snout, pattern layers as separate PNGs (`<name>.<pattern>.png`). The UI picks files up by name with no code change (see `docs/ui/README.md`). `appearance(genome)` returns `{coat, pattern}`, which selects the palette and the pattern layer.

## 6. Balance
Money numbers live only in `data/economy.json`. After a change, run `node tools/balance-sim.js --runs 200` and update `docs/tech/BALANCE.md` (target: average barely pays year 1, skilled has slack).

## 7. Save files
`serialize` writes the whole state with `saveVersion`. `deserialize` runs `MIGRATIONS` from the save's version up to `SAVE_VERSION` and rejects newer saves (`save.version`). Rule: never change the state shape without a migration and a test in `tests/sim/registry.test.js`.

## 8. UI (frontend adds detail here)
See `docs/ui/README.md` for controls, files and test hooks.
