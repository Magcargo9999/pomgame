// The single place the UI imports the simulation from (docs/tech/SIM-API.md).
// The UI never mutates state: it keeps the opaque state, calls the sim, and
// renders getView(state).
export { createGame, getView, listActions, doAction, endDay, previewBreeding, previewMix, serialize, deserialize, SIM_VERSION } from '../sim/index.js';

// Read-only game data used for display only (prices, mix preview, market window).
import items from '../../data/items.json' with { type: 'json' };
import config from '../../data/config.json' with { type: 'json' };
export { items, config };
