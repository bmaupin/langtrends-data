'use strict';

import { readFile, rm } from 'fs/promises';

import DataPopulator, { Language, Score } from './DataPopulator';

const CONDENSED_SCORES_FILE = 'scores-condensed-test.json';
const LANGUAGES_FILE = 'languages-test.json';
// Number of scores to populate for the tests
const NUM_SCORES = 10;
const SCORES_FILE = 'scores-test.json';

let dataPopulator: DataPopulator;

beforeAll(async () => {
  dataPopulator = new DataPopulator();
});

afterAll(async () => {
  await rm(LANGUAGES_FILE);
  await rm(SCORES_FILE);
  await rm(CONDENSED_SCORES_FILE);
});

test('Test populateLanguages', async () => {
  // Populate only half the number of languages as scores to ensure they'll be spread across more than one date
  const numLanguages = NUM_SCORES / 2;

  await dataPopulator.populateLanguages(LANGUAGES_FILE, numLanguages);
  const languages = JSON.parse(
    await readFile(LANGUAGES_FILE, 'utf8')
  ) as Language[];
  expect(languages.length).toBe(numLanguages);
});

test('Test populateAllScores', async () => {
  await dataPopulator.populateAllScores(SCORES_FILE, NUM_SCORES);
  const scores = JSON.parse(await readFile(SCORES_FILE, 'utf8')) as Score[];
  expect(scores.length).toEqual(NUM_SCORES);
  expect(scores[0].points).toBeGreaterThan(1000);

  // The latest score should be from this month
  expect(new Date(scores[0].date).getUTCMonth()).toEqual(
    new Date().getUTCMonth()
  );
  // Scores should always be from the first day of the month
  expect(new Date(scores[0].date).getUTCDate()).toEqual(1);
});

test('Test populateCondensedScores', async () => {
  await dataPopulator.populateCondensedScores(CONDENSED_SCORES_FILE);
  const scores = JSON.parse(
    await readFile(CONDENSED_SCORES_FILE, 'utf8')
  ) as Score[];
  expect(scores.length).toEqual(NUM_SCORES);
});
