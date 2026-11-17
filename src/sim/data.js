// All tunable data. JSON import attributes work in Node 22+ and current browsers (serve over http).
import base from '../../data/config.json' with { type: 'json' };
import economy from '../../data/economy.json' with { type: 'json' };
import breeds from '../../data/breeds.json' with { type: 'json' };
import loci from '../../data/loci.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };

// One config object: rules from config.json, money from economy.json (decision 29).
const config = base;
config.start.cash = economy.startCash;
config.debt = economy.debt;
config.market = economy.market;
config.grades = economy.grades;
config.brandCert = economy.brandCert;

export { config, economy, breeds, loci, items };
export const PIG_LOCI = loci.filter((l) => l.species === 'pig');
export const BV_TRAITS = ['growth', 'lean', 'imf', 'litter'];
