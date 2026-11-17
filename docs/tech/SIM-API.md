# SIM-API: 빚더미 목장 simulation core

Status: v2 (backend, branch `backend/sim-core`). The UI talks to the game only through the functions below.
Rules: `docs/design/GDD-v0.1.md` (decision table wins over the body; decisions 27-31 are god's rulings). Money: `docs/tech/BALANCE.md`.

**Changes since v1**: places (2 pens × 4 + piggery 22, cap 30), no gene lab and no genotype in the view, consecutive-miss debt with arrears, `movePig` takes a group, every pig defaults to `finisher`, truck fee taken from the sale, `pedigree` (2 generations) on each pig, `breed` carries `warning`, market window 38-44 days.

## 0. Ground rules
- `src/sim/` is pure JavaScript (ES modules). No DOM, no `window`, no `Date.now()`, no `Math.random()`. Same seed + same actions = same game.
- State is a plain JSON-safe object. **Treat it as opaque and immutable**: every call returns a new state and leaves the old one untouched (safe for undo and autosave).
- Money is integer G. Weight is kg (1 decimal), backfat is mm, IMF is %.
- No Korean text comes out of the sim, only stable codes (`type`, `code`, `breedId`, `itemId` ...). The UI maps them through `i18n/ko.json`. Suggested keys: `event.<type>`, `action.<type>`, `error.<code>`, `breed.<id>` (includes `crossbred`), `item.<id>`, `grade.<code>`, `stage.<id>`, `pattern.<id>`.
- Data lives in `data/*.json`. The sim imports it with `import ... with { type: 'json' }`, so serve the page over http (`node tools/serve.mjs`), not `file://`.

## 1. Import
```js
import { createGame, getView, listActions, doAction, endDay,
         serialize, deserialize, SIM_VERSION } from './src/sim/index.js';
```

## 2. Functions
| Function | Returns | Notes |
|---|---|---|
| `createGame(seed)` | `state` | `seed`: integer or string. Day 1, 2 inherited piglets (a breeder gilt and a barrow, 14 days old), starting cash, the debt. |
| `getView(state)` | `View` (§4) | Everything the screen needs, already filtered: genotype, breeding values and undetected sickness are never in it. Cheap; call after every change. |
| `listActions(state, target)` | `ActionInfo[]` (§3) | `target`: `{kind:'farm'}`, `{kind:'pen', id}`, `{kind:'pig', id}`, `{kind:'shop'}`. Disabled actions are listed with a `reason` so the menu can grey them out. |
| `doAction(state, action)` | `{ok, state, events, error?}` | On failure `ok:false`, `state` is the unchanged input, `error = {code, ...}`. On success AP are spent and `events` say what happened. |
| `endDay(state)` | `{state, events}` | The night: trucks leave, pigs grow, sickness rolls, births, wages, market, payday. The next day starts with full AP. |
| `serialize(state)` | `string` | JSON with `saveVersion`. For autosave (localStorage) and file export. |
| `deserialize(str)` | `state` | Migrates older saves. Throws `Error('save.invalid')` or `Error('save.version')` (newer than this build). |

## 3. Actions
`ActionInfo = { type, apCost, enabled, reason?, params, options?, cost? }`. `params` is a ready-to-send default; `options` lists choices (pens, sires with expected F, feeds...). Send `doAction(state, { type, ...params })`.
AP: 10 per day; each hired worker adds AP. Walking is free (decision 25).

| type | params | AP | Money | Effect |
|---|---|---|---|---|
| `feedPen` | `penId` | 1 | uses feed stock | Feeds every pig in the pen today with the pen's feed. Unfed pigs stop growing and get stressed. Once a day per pen. |
| `setPenFeed` | `penId, feed` | 0 | | `feed = {kind:'commercial', id}` or `{kind:'mix', recipeId}` |
| `cleanPen` | `penId` | 2 | | Pen hygiene → 100 |
| `inspectPen` | `penId` | 1 | | Finds hidden sickness in the pen. Those pigs show as `sick` from now on. |
| `treatPig` | `pigId` | 1 | vet fee 25,000 | Sick → recovering (5 days). Cannot ship for 7 days (antibiotic withdrawal). |
| `vaccinatePen` | `penId` | 1 | 1 `vaccine` per pig | Infection chance ×0.4 for 56 days |
| `petPig` | `pigId` | 1 | | stress −15, affinity +5 (once per pig per day) |
| `movePig` | `penId` + `pigId` or `pigIds` | 1 | | One pig or a group into a pen with enough free places |
| `setRole` | `pigId, role` | 0 | | `'breeder'` or `'finisher'`. Every pig starts as `finisher` except the inherited gilt. Making an intact boar a finisher castrates him (one way). |
| `breed` | `sireId, damId` | 2 | | Both breeders, ≥ 40 days old, not clinically sick, dam not pregnant or lactating, sire intact. Result next morning. Gestation 26 days. `options.sireId` lists sires with `expectedF` and `risk`. `options.warning = 'herd.full'` when every place is taken (still allowed; extra piglets get sold at birth). |
| `shipPigs` | `pigIds, fast, gentle, useLairage` | 2 (+2 if `gentle`) | 10,000 per pig, taken from the sale | Queues pigs for tonight's truck. `fast`: `'none'` (<12 h), `'normal'` (12-18 h, best), `'long'` (>24 h, DFD risk, 2% weight loss). `useLairage` needs the lairage. Grade sheet comes back in the morning. |
| `cancelShipment` | `pigId` | 0 | | Before the night only |
| `buy` | `itemId, qty, breedId?, penId?` | 0 | price × qty | `piglet` (+`breedId`, 5 days old, castrated if male), `boar` (+`breedId`, 40-day intact breeder), feeds and ingredients (kg), `vaccine`, facilities `piggery` (+22 places), `feed_mixer`, `lairage`. Blocked with `herd.full` when no place is free. |
| `saveRecipe` | `recipeId?, shares` | 0 | | Needs `feed_mixer`. `shares = {barley:0.55, corn:0.33, soybean_meal:0.12, vitamin_e:0.01}` (normalised). |
| `hireWorker` / `fireWorker` | `workerId` | 0 | daily wage | More AP per day, a small chance of a slip (`workerMistake`) |
| `payDebt` | `amount` | 0 | | Pays now; counts toward this season's amount due |
| `renamePig` | `pigId, name` | 0 | | ≤ 12 characters |

Error codes: `ap.notEnough`, `cash.notEnough`, `stock.notEnough`, `pen.full`, `pen.empty`, `pen.alreadyFed`, `pen.notFound`, `pig.notFound`, `pig.notShippable`, `pig.notSick`, `pig.alreadyPetted`, `pig.busy`, `pig.castrated`, `herd.full`, `breed.invalid`, `facility.missing`, `facility.owned`, `action.unknown`, `game.over`, `param.invalid`.

## 4. View shape
```js
{
  simVersion, phase: 'playing' | 'foreclosed' | 'yearComplete',
  day: 1..112, year: 1, season: 0..3, dayOfSeason: 1..28,
  ap: { left, max }, cash,
  debt: { balance, ratePerSeason, minPerSeason,   // this season's minimum
          arrears,                                // unpaid minimums carried from earlier seasons
          minDue,                                 // minPerSeason + arrears (capped at balance)
          paidThisSeason, nextDueDay,
          missed,                                 // misses IN A ROW; 3 = foreclosure
          maxMissed: 3 },
  market: { carcassPricePerKg, trend: -1|0|1, gradeMultipliers: { brand, '1+', '1', '2', out } },
  herd: { count, max: 30, places },               // places = sum of pen capacity (8 at start, 30 with piggery)
  pens: [{ id, capacity, hygiene, feed, fedToday, pigIds }],
  pigs: [{
    id, name, breedId, breedMix: { breedId: share }, sex: 'M'|'F', castrated, ageDays,
    stage: 'suckling'|'nursery'|'grower'|'finisher'|'breeder'|'pregnant'|'lactating',
    role: 'breeder'|'finisher', penId,
    weightKg, backfatMm, health, stress, hunger, hygiene, affinity,
    condition: 'healthy'|'sick'|'recovering'|'chronic',  // hidden sickness reads 'healthy'
    withdrawalDays, vaccinated, pregnantDueDay,
    marketWindow,                                        // finisher aged 38-44
    shippable, shipQueued,
    appearance: { coat: 'white'|'black'|'red', pattern: 'none'|'belt'|'points'|'white_spots'|'black_spots'|'patchwork', rare },
    F, fRisk: 'safe'|'caution'|'danger'|'inbred',
    sireId, damId,
    pedigree: { sire: {id, sireId, damId} | null, dam: {id, sireId, damId} | null }   // 2 generations
  }],
  inventory: { feeds: {id: kg}, ingredients: {id: kg}, vaccine },
  recipes: [{ id, shares }],
  facilities: { piggery, feed_mixer, lairage },
  workers: [{ id, wage, apBonus }], workerOffers: [{ id, wage, apBonus, hired }],
  shipments: [{ pigId, fast, gentle, useLairage }],
  reports: [GradeSheet],                  // newest first, last 20
  shop: [{ itemId, breedId?, price, unit, enabled, reason? }],
  stats: { shipped, revenue, gradeCounts, deaths, births, soldPiglets }
}
```
`GradeSheet = { pigId, name, breedId, day, liveKg, carcassKg, backfatMm, imf, meatColor, fatColor, bellyScore, PSE, DFD, defect, grade1, grade2, grade, pricePerKg, truckFee, revenue }`. `grade`: `'brand'|'1+'|'1'|'2'|'out'`. `brand` is real grade 1+ plus the farm cert "빚더미 목장 명품" (decisions 20, 30). Show it as 1+ with the cert badge.

## 5. Events
Each event: `{ type, day, ...data }`, in the order things happened.

| type | data |
|---|---|
| `actionDone` | `action, apSpent` (last event of every successful `doAction`) |
| `fed` | `penId, kg, partial` |
| `cleaned` | `penId` |
| `sickFound` | `penId, pigIds` |
| `treated` | `pigId, fee` |
| `vaccinated` | `penId, count` |
| `petted` / `roleSet` | `pigId` (+`role`) |
| `moved` | `pigIds, penId` |
| `mated` | `sireId, damId, expectedF` |
| `bought` | `itemId, qty, cost, breedId?, pigIds?` |
| `recipeSaved` | `recipeId, props` |
| `hired` / `fired` / `workerQuit` | `workerId` |
| `debtPaid` | `amount, balance` |
| `shipQueued` / `shipCancelled` | `pigIds` (+`fee`) |
| `gradeReport` | `sheet` (night; show in the morning) |
| `shipped` | `pigIds` |
| `conception` / `conceptionFailed` | `sireId, damId, dueDay?` |
| `birth` | `damId, pigIds, stillborn, soldExtra, extraCash` (piglets with no free place are sold at once at the weaned-piglet price) |
| `weaned` | `damId` |
| `stageChange` | `pigId, from, to` |
| `sickVisible` / `recovered` / `chronic` | `pigId` |
| `death` | `pigId, cause: 'disease'|'health'` |
| `unfed` | `penId` |
| `wages` | `amount` |
| `workerMistake` | `workerId, kind, itemId, kg` |
| `marketMove` | `carcassPricePerKg, trend` |
| `debtMissed` | `missed, arrears` |
| `debtDue` | `paid, interest, balance, missed, arrears` (days 28, 56, 84, 112) |
| `foreclosed` | |
| `yearComplete` | `summary` |
| `dayStart` | `day` (last event of `endDay`) |

## 6. Rules summary
- Time: 112 days a year; payday at the end of days 28, 56, 84, 112. The amount due (this season's minimum + arrears) is paid automatically if the cash is there. If not, it is a miss: interest doubles that season and the unpaid amount carries over. 3 misses in a row = foreclosure. A full payment resets the count.
- Life: suckling 0-4, nursery 5-12, grower 13-24, finisher 25+; breeders mature at 40 days. Gestation 26, weaning at 5.
- Growth, fat, IMF: GDD §1.1 scaled to game days (feed energy, protein and lysine, health, stress, breed, breeding value).
- Sickness: GDD §0.5 (healthy → hidden → clinical → chronic or death).
- Grading: GDD §1.1 `gradePig`; PSE/DFD from RYR1 genotype and pre-slaughter stress (fasting, handling, mixing, lairage).
