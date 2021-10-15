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
      id INTEGER NOT NULL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      stackoverflowtag TEXT
    );
  `);

  await db.run(`
    CREATE TABLE score (
      id INTEGER NOT NULL PRIMARY KEY,
      date NUMERIC NOT NULL,
      languageid INTEGER,
      points INTEGER NOT NULL
    );
  `);

  dataPopulator = new DataPopulator(db);
});

afterAll(async () => {
  await db.close();
});

test('Test populateLanguages', async () => {
  await dataPopulator.populateLanguages();
  const language = await db.get(
    "SELECT * FROM language WHERE name = 'TypeScript';"
  );
  expect(language.name).toEqual('TypeScript');
});

// Convert date from the database into a usable date
const convertIntegerToDate = (integer: number): Date => {
  return new Date(integer * 1000);
};

test('Test populateScores', async () => {
  await dataPopulator.populateScores(10);
  const scores = await db.all('SELECT * FROM score;');
  expect(scores.length).toEqual(10);
  expect(scores[0].points).toBeGreaterThan(1000);

  // The latest score should be from this month
  expect(convertIntegerToDate(scores[0].date).getUTCMonth()).toEqual(
    new Date().getUTCMonth()
  );
  // Scores should always be from the first day of the month
  expect(convertIntegerToDate(scores[0].date).getUTCDate()).toEqual(1);
});
