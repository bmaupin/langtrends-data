'use strict';

import DataPopulator from './src/DataPopulator';

const main = async () => {
  try {
    const dataPopulator = new DataPopulator();
    await dataPopulator.populateLanguages('data/languages.json');
    await dataPopulator.populateAllScores('data/scores-full.json');
    await dataPopulator.populateCondensedScores('data/scores.json');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

main();
