'use strict';

import { readFile, rm, writeFile } from 'fs/promises';
import { afterAll, beforeAll, expect, spyOn, test } from 'vitest';

import DataPopulator, { Language, Score } from './DataPopulator';

const CONDENSED_SCORES_FILE = 'scores-condensed-test.json';
const LANGUAGES_FILE = 'languages-test.json';
// Number of scores to populate for the tests
const NUM_SCORES = 10;
// Populate only half the number of languages as scores to ensure they'll be spread across more than one date
const NUM_LANGUAGES = NUM_SCORES / 2;
const SCORES_FILE = 'scores-test.json';
// Adjust this as needed to allow for enough time for the tests to pass
const TIME_TO_GET_ONE_SCORE = 2000;

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
  await dataPopulator.populateLanguages(LANGUAGES_FILE, NUM_LANGUAGES);
  const languages = JSON.parse(
    await readFile(LANGUAGES_FILE, 'utf8')
  ) as Language[];
  expect(languages.length).toBe(NUM_LANGUAGES);
});

test(
  'Test populateAllScores',
  async () => {
    await dataPopulator.populateAllScores(SCORES_FILE, NUM_SCORES);
    const scores = JSON.parse(await readFile(SCORES_FILE, 'utf8')) as Score[];
    expect(scores.length).toEqual(NUM_SCORES);
    expect(scores[0].points).toBeGreaterThan(1000);

    // The latest score should be from this month
    expect(new Date(scores[scores.length - 1].date).getUTCMonth()).toEqual(
      new Date().getUTCMonth()
    );
    // Scores should always be from the first day of the month
    expect(new Date(scores[0].date).getUTCDate()).toEqual(1);
  },
  // Adjust test timeout based on number of scores we're getting
  TIME_TO_GET_ONE_SCORE * NUM_SCORES
);

test('Test populateCondensedScores', async () => {
  await dataPopulator.populateCondensedScores(CONDENSED_SCORES_FILE);
  const scores = JSON.parse(
    await readFile(CONDENSED_SCORES_FILE, 'utf8')
  ) as Score[];
  expect(scores.length).toEqual(NUM_SCORES);
});

test('Test validateLanguages', async () => {
  try {
    await dataPopulator.validateLanguages(LANGUAGES_FILE);
  } catch (error) {
    console.log(error);
  }
});

test(
  'Test significant decrease in points',
  async () => {
    // Suppress logs from this test (https://stackoverflow.com/a/58717352/399105)
    spyOn(console, 'debug').mockImplementation(() => {});
    spyOn(console, 'info').mockImplementation(() => {});

    // Wipe the scores file for a clean slate and then re-create it
    await rm(SCORES_FILE);

    // Populate two months of data so we can manipulate the second to most recent one
    await dataPopulator.populateAllScores(SCORES_FILE, NUM_LANGUAGES * 2);

    // Double the first score
    const scores = JSON.parse(await readFile(SCORES_FILE, 'utf8')) as Score[];
    scores[0].points *= 2;

    // Delete the most recent scores so they'll be repopulated
    scores.splice(NUM_LANGUAGES);

    // Overwrite the scores file
    await writeFile(SCORES_FILE, JSON.stringify(scores));

    // An error should be thrown because of the significant decrease in points
    await expect(
      dataPopulator.populateAllScores(SCORES_FILE, NUM_SCORES)
    ).rejects.toThrow('decreased');
  },
  // Adjust test timeout based on number of scores we're getting
  TIME_TO_GET_ONE_SCORE * NUM_SCORES * 2
);
