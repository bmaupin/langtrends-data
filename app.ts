'use strict';

const sqlite3 = require('sqlite3').verbose();
import { open } from 'sqlite';

import DataPopulator from './classes/DataPopulator';

const main = async () => {
  const db = await open({
    filename: 'langtrends.db',
    driver: sqlite3.Database,
  });

  const dataPopulator = new DataPopulator(db);

  await dataPopulator.populateLanguages();
  await dataPopulator.populateScores();

  await db.close();
};

main();
