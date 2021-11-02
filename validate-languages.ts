'use strict';

import DataPopulator from './classes/DataPopulator';

const main = async () => {
  const dataPopulator = new DataPopulator();
  try {
    await dataPopulator.validateLanguages('data/languages.json');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

main();
