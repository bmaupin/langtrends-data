'use strict';

import DataPopulator from './classes/DataPopulator';

const main = async () => {
  const dataPopulator = new DataPopulator();
  await dataPopulator.populateLanguages('data/languages.json');
};

main();
