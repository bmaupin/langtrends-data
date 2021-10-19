'use strict';

import DataPopulator from './classes/DataPopulator';

const main = async () => {
  const dataPopulator = new DataPopulator();
  await dataPopulator.populateLanguages('data/languages.json');
  await dataPopulator.populateAllScores('data/scores-full.json');
  await dataPopulator.populateCondensedScores('data/scores.json');
};

main();
