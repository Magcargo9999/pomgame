# SIM-API: 빚더미 목장 simulation core

Status: v1 (backend, branch `backend/sim-core`). The UI talks to the game only through the functions below.
Source of truth for rules: `docs/design/GDD-v0.1.md` (decision table wins over the body).

## 0. Ground rules
- `src/sim/` is pure JavaScript (ES modules). No DOM, no `window`, no `Date.now()`, no `Math.random()`. Same seed + same actions = same game.
- State is a plain JSON-safe object. **Treat it as opaque and immutable**: every call returns a new state; the old one is untouched (safe for undo/autosave).
- Every number that is money is an integer in G. Weights are kg (1 decimal), backfat mm, IMF %.
- No Korean text comes out of the sim. Everything is a stable code (`type`, `code`, `breedId`, `itemId` ...). The UI maps codes to `i18n/ko.json`. Suggested key form: `event.<type>`, `action.<type>`, `error.<code>`, `breed.<id>`, `item.<id>`, `grade.<code>`.
- Data lives in `data/*.json` (`breeds.json`, `loci.json`, `items.json`, `config.json`). The sim imports it with `import ... with { type: 'json' }`, so the page must be served over http (not `file://`).

## 1. Import
```js
import { createGame, getView, listActions, doAction, endDay,
         serialize, deserialize, SIM_VERSION } from './src/sim/index.js';
```

## 2. Functions
| Function | Returns | Notes |
|---|---|---|
| `createGame(seed, opts?)` | `state` | `seed`: integer or string. `opts.difficulty` reserved. Start: day 1, 2 piglets from the previous owner, a little cash, the debt. |
| `getView(state)` | `View` (§4) | Everything the screen needs, already filtered: hidden genetics and undetected sickness are not in it. Cheap; call after every change. |
| `listActions(state, target)` | `ActionInfo[]` (§3) | `target` is `{kind:'farm'}`, `{kind:'pen', id}`, `{kind:'pig', id}` or `{kind:'shop'}`. Disabled actions are listed with a `reason` code so the menu can grey them out. |
| `doAction(state, action)` | `{ok, state, events, error?}` | On failure `ok:false`, `state` is the unchanged input, `error = {code, ...}`. On success AP are spent and `events` say what happened. |
| `endDay(state)` | `{state, events}` | Runs the night: shipments go out, pigs grow, sickness rolls, births, wages, market moves, debt day. The new day starts with full AP. |
| `serialize(state)` | `string` | JSON string with `saveVersion`. Use for autosave (localStorage) and file export. |
| `deserialize(str)` | `state` | Throws `Error('save.invalid')` or `Error('save.version')`. |

## 3. Actions
`ActionInfo = { type, apCost, cost?, enabled, reason?, params? }`. Send `doAction(state, { type, ...params })`.
AP: 10 per day at the start; each hired worker adds AP (see `items.json` workers). Walking is free (decision 25).

| type | params | AP | Money | Effect |
|---|---|---|---|---|
| `feedPen` | `penId` | 1 | uses feed stock | Feeds every pig in the pen today with the pen's feed. Unfed pigs do not grow and get stressed. |
| `setPenFeed` | `penId, feed` | 0 | | `feed = {kind:'commercial', id}` or `{kind:'mix', recipeId}` |
| `cleanPen` | `penId` | 2 | | Pen hygiene → 100 |
| `inspectPen` | `penId` | 1 | | Finds hidden (subclinical) sickness in the pen; they show as `sick` from now on |
| `treatPig` | `pigId` | 1 | vet fee | Sick → recovering (5 days). Antibiotic: pig cannot ship for `withdrawalDays` (7) |
| `vaccinatePen` | `penId` | 1 | 1 `vaccine` per pig | Infection chance ×0.4 for 56 days |
| `petPig` | `pigId` | 1 | | stress −15, affinity +5 (once per pig per day) |
| `movePig` | `pigId, penId` | 1 | | Needs free space in the target pen |
| `setRole` | `pigId, role` | 0 | | `'breeder'` or `'finisher'`. Making a boar a finisher castrates him (one way). Default: females breeder-eligible, males finisher. |
| `breed` | `sireId, damId` | 2 | | Both breeders, ≥ 40 days old, healthy, dam not pregnant/lactating, sire not castrated. Result next morning (`conception` or `conceptionFailed`). Gestation 26 days. |
| `shipPigs` | `pigIds, fast, gentle, useLairage` | 2 (+2 if `gentle`) | truck fee per pig | Queues the pigs for tonight's truck. `fast`: `'none'` (<12 h), `'normal'` (12–18 h, best), `'long'` (>24 h). `useLairage` needs the lairage facility. Grade sheet arrives next morning (decision 7). |
| `cancelShipment` | `pigId` | 0 | | Before the night only |
| `buy` | `itemId, qty, breedId?` | 0 | price × qty | Piglets (`itemId:'piglet'` + `breedId`), feeds, ingredients, vaccine, facilities (`pen`, `feed_mixer`, `lairage`, `gene_lab`) |
| `saveRecipe` | `recipeId?, shares` | 0 | | Needs `feed_mixer`. `shares = {corn:0.5, barley:0.3, soybean_meal:0.2, vitamin_e:0.01}` (normalised to 1) |
| `hireWorker` / `fireWorker` | `workerId` | 0 | daily wage | Simple menu effect: more AP per day, small chance of a mistake (event `workerMistake`) |
| `payDebt` | `amount` | 0 | | Pays now (counts toward this season's minimum) |
| `renamePig` | `pigId, name` | 0 | | Free text, ≤ 12 chars |

Error codes (`error.code`): `ap.notEnough`, `cash.notEnough`, `stock.notEnough`, `pen.full`, `pen.notFound`, `pig.notFound`, `pig.notShippable`, `herd.full` (30 head, decision 21), `breed.invalid`, `facility.missing`, `facility.owned`, `action.unknown`, `game.over`, `param.invalid`.
`reason` codes in `listActions` use the same strings.

## 4. View shape
```js
{
  simVersion: 1,
  phase: 'playing' | 'foreclosed' | 'yearComplete',
  day: 1..112, year: 1, season: 0..3, dayOfSeason: 1..28,   // 28 days × 4 seasons
  ap: { left, max },
  cash,
  debt: { balance, ratePerSeason, minPerSeason, paidThisSeason, nextDueDay, missed, maxMissed: 3 },
  market: { carcassPricePerKg, trend: -1|0|1, gradeMultipliers: {brand,'1+','1','2',out} },
  herd: { count, max: 30 },
  pens: [{ id, capacity, hygiene, feed, fedToday, pigIds:[], vaccinatedUntil }],
  pigs: [{
    id, name, breedId, sex: 'M'|'F', castrated, ageDays,
    stage: 'suckling'|'nursery'|'grower'|'finisher'|'breeder'|'pregnant'|'lactating',
    role: 'breeder'|'finisher', penId,
    weightKg, backfatMm, health, stress, hunger, hygiene, affinity,
    condition: 'healthy'|'sick'|'recovering'|'chronic',   // hidden sickness shows 'healthy'
    withdrawalDays, pregnantDueDay: number|null,
    marketWindow: boolean,          // age 36–42 and weight in range
    shippable: boolean, shipQueued: boolean,
    appearance: { coat: 'white'|'black'|'red', pattern: 'none'|'belt'|'points'|'white_spots'|'black_spots'|'patchwork', rare: boolean },
    F,                               // inbreeding coefficient 0..1
    fRisk: 'safe'|'caution'|'danger'|'inbred',
    genotype: { KIT:['I','i'], MC1R:[...], RYR1:[...], SPOT:[...] } | null,  // null until gene_lab
    bv: { growth, lean, imf, litter } | null,                                // null until gene_lab
    sireId, damId
  }],
  inventory: { feeds: {id: kg}, ingredients: {id: kg}, vaccine: n },
  recipes: [{ id, shares }],
  facilities: { feed_mixer: bool, lairage: bool, gene_lab: bool },
  workers: [{ id, wage, apBonus }],
  shipments: [{ pigId, fast, gentle, useLairage }],       // queued for tonight
  reports: [GradeSheet],                                   // newest first, last 20
  shop: [{ itemId, breedId?, price, unit, enabled, reason? }],
  stats: { shipped, revenue, gradeCounts: {brand,'1+','1','2',out}, deaths, births }
}
```
`GradeSheet = { pigId, name, breedId, day, liveKg, carcassKg, backfatMm, imf, meatColor, fatColor, bellyScore, PSE, DFD, grade1, grade2, grade: 'brand'|'1+'|'1'|'2'|'out', pricePerKg, revenue }`
`grade:'brand'` is real grade 1+ plus the farm cert "빚더미 목장 명품" (decision 20). Show it as 1+ with the cert badge.

## 5. Events
Every event: `{ type, day, ...data }`. Order = the order things happened. The UI can toast them or show a morning summary.

| type | data |
|---|---|
| `actionDone` | `action, apSpent` |
| `fed` | `penId, kg, partial` |
| `cleaned` | `penId` |
| `sickFound` | `penId, pigIds` |
| `treated` | `pigId, fee` |
| `vaccinated` | `penId, count` |
| `bought` | `itemId, qty, cost, pigIds?` |
| `shipQueued` / `shipCancelled` | `pigIds` |
| `shipped` | `pigIds` (night) |
| `gradeReport` | `sheet: GradeSheet` (one per pig, next morning) |
| `conception` / `conceptionFailed` | `sireId, damId, dueDay?` |
| `birth` | `damId, pigIds, stillborn, soldExtra` (piglets over the 30 head cap are sold at once) |
| `weaned` | `damId` |
| `stageChange` | `pigId, from, to` |
| `sickVisible` | `pigId` (became clinical) |
| `recovered` | `pigId` |
| `chronic` | `pigId` |
| `death` | `pigId, cause: 'disease'|'health'|'newborn'` |
| `unfed` | `penId` (night: pen was not fed) |
| `wages` | `amount` |
| `workerMistake` | `workerId, kind, penId?` |
| `marketMove` | `carcassPricePerKg, trend` |
| `debtDue` | `paid, interest, balance, missed` (season end, days 28/56/84/112) |
| `debtMissed` | `missed` |
| `foreclosed` | (game over) |
| `yearComplete` | `summary` |
| `dayStart` | `day` (last event of `endDay`) |

## 6. Rules summary (numbers live in `data/config.json`)
- Time: turn based, 112 days a year, payday at the end of days 28, 56, 84, 112. Day ends only on `endDay`.
- Life: suckling 0–4, nursery 5–12, grower 13–24, finisher 25+ (role finisher); breeders mature at 40 days. Gestation 26 days, wean at 5 days.
- Growth: GDD §1.1 formula scaled to game days; feed energy/protein/lysine, health, stress, temperature.
- Sickness: GDD §0.5 state machine (healthy → subclinical → clinical → chronic/dead).
- Shipping: carcass = live × 0.77; PSE/DFD from RYR1 genotype and pre-slaughter stress; grade by GDD §1.1 `gradePig` with the brand cert above 1+.
- Debt: interest on the balance at each payday; unpaid minimum = a miss; 3 misses = foreclosure.

## 7. Example
```js
let s = createGame(42);
let r = doAction(s, { type: 'feedPen', penId: 'pen-1' });
if (!r.ok) showError(r.error.code); else s = r.state;
({ state: s } = endDay(s));
render(getView(s));
localStorage.setItem('save', serialize(s));
```
