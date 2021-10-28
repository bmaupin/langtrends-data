'use strict';

import DataPopulator from './classes/DataPopulator';

const main = async () => {
  const dataPopulator = new DataPopulator();
  const errors = await dataPopulator.checkLanguages('data/languages.json');
  if (errors.length !== 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }
};

main();
