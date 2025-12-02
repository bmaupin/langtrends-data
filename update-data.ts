'use strict';

import DataPopulator from './src/DataPopulator';

const main = async () => {
  try {
    const dataPopulator = new DataPopulator();
    await dataPopulator.populateLanguages();
    await dataPopulator.populateAllScores();
    await dataPopulator.populateCondensedScores();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

main();
