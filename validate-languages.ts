'use strict';

import DataPopulator from './src/DataPopulator';

const main = async () => {
  const dataPopulator = new DataPopulator();
  try {
    await dataPopulator.validateLanguages();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

main();
