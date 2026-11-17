// All tunable data. JSON import attributes work in Node 22+ and current browsers (serve over http).
import config from '../../data/config.json' with { type: 'json' };
import breeds from '../../data/breeds.json' with { type: 'json' };
import loci from '../../data/loci.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };

export { config, breeds, loci, items };
export const PIG_LOCI = loci.filter((l) => l.species === 'pig');
export const BV_TRAITS = ['growth', 'lean', 'imf', 'litter'];
