'use strict';

const sqlite3 = require('sqlite3').verbose();
import { Database, open } from 'sqlite';

import DataPopulator from './DataPopulator';

let db: Database;
let dataPopulator: DataPopulator;

beforeAll(async () => {
  db = await open({
    filename: ':memory:',
    driver: sqlite3.Database,
  });

  await db.run(`
    CREATE TABLE language (
      name text NOT NULL UNIQUE,
      stackoverflowtag text,
      id integer NOT NULL PRIMARY KEY
    );
  `);

  dataPopulator = new DataPopulator(db);
});

afterAll(async () => {
  await db.close();
});

test('Test populateLanguages', async () => {
  await dataPopulator.populateLanguages();
  const result = await db.get(
    "SELECT * FROM language WHERE name = 'TypeScript';"
  );
  expect(result.name).toEqual('TypeScript');
});
