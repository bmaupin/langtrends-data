'use strict';

import DataPopulator from './classes/DataPopulator';

const main = async () => {
  const dataPopulator = new DataPopulator();
  const languageDiscrepancies = await dataPopulator.populateLanguages(
    'data/languages.json'
  );
  if (languageDiscrepancies) {
    process.exit(1);
  }
};

main();
