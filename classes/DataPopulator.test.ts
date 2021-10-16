'use strict';

import { readFile, rm } from 'fs/promises';

import DataPopulator, { Language, Score } from './DataPopulator';

const LANGUAGES_FILE = 'languages-test.json';
const SCORES_FILE = 'scores-test.json';

let dataPopulator: DataPopulator;

beforeAll(async () => {
  dataPopulator = new DataPopulator();
});

afterAll(async () => {
  await rm(LANGUAGES_FILE);
  await rm(SCORES_FILE);
});

test('Test populateLanguages', async () => {
  await dataPopulator.populateLanguages(LANGUAGES_FILE);
  const languages = JSON.parse(
    await readFile(LANGUAGES_FILE, 'utf8')
  ) as Language[];
  const language = languages.find((language) => language.name === 'TypeScript');
  expect(language!.name).toEqual('TypeScript');
});

test('Test populateScores', async () => {
  await dataPopulator.populateScores(SCORES_FILE, 10);
  const scores = JSON.parse(await readFile(SCORES_FILE, 'utf8')) as Score[];
  expect(scores.length).toEqual(10);
  expect(scores[0].points).toBeGreaterThan(1000);

  // The latest score should be from this month
  expect(new Date(scores[0].date).getUTCMonth()).toEqual(
    new Date().getUTCMonth()
  );
  // Scores should always be from the first day of the month
  expect(new Date(scores[0].date).getUTCDate()).toEqual(1);
});
