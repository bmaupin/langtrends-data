'use strict';

import { readFile, rm, writeFile } from 'fs/promises';

import DataPopulator, { Language, Score } from './DataPopulator';
import { addMonthsUTC } from './utils';

const CONDENSED_SCORES_FILE = 'scores-condensed-test.json';
const LANGUAGES_FILE = 'languages-test.json';
// Number of scores to populate for the tests
const NUM_SCORES = 10;
// Populate only half the number of languages as scores to ensure they'll be spread across more than one date
const NUM_LANGUAGES = NUM_SCORES / 2;
const OLDEST_DATE = new Date('2023-01-01');
const SCORES_FILE = 'scores-test.json';
// Adjust this as needed to allow for enough time for the tests to pass
const TIME_TO_GET_ONE_SCORE = 2000;

let dataPopulator: DataPopulator;

beforeAll(async () => {
  dataPopulator = new DataPopulator(OLDEST_DATE);
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
    // First make sure it works with the generated languages file
    await dataPopulator.populateAllScores(SCORES_FILE, NUM_SCORES);
    const scores = JSON.parse(await readFile(SCORES_FILE, 'utf8')) as Score[];
    expect(scores.length).toEqual(NUM_SCORES);
    expect(scores[0].points).toBeGreaterThan(1000);

    // The latest score should be the oldest date + 1 month
    expect(new Date(scores[scores.length - 1].date).getUTCMonth()).toEqual(
      addMonthsUTC(OLDEST_DATE, 1).getUTCMonth()
    );
    // Scores should always be from the first day of the month
    expect(new Date(scores[0].date).getUTCDate()).toEqual(1);

    // Wipe scores and languages files for a clean slate
    await rm(LANGUAGES_FILE);
    await rm(SCORES_FILE);
    dataPopulator = new DataPopulator(new Date('2023-01-01'));

    // Now hard-code the language file for more predictability for the other tests, since
    // the languages from GitHub will in theory change order as their popularity changes
    await writeFile(
      LANGUAGES_FILE,
      JSON.stringify([
        { id: 1, name: 'C' },
        { id: 2, name: 'C#' },
        { id: 3, name: 'C++' },
        { id: 4, name: 'CoffeeScript' },
        { id: 5, name: 'Dart' },
      ])
    );
    // This is still needed to populate the languages from the file in the object
    await dataPopulator.populateLanguages(LANGUAGES_FILE, NUM_LANGUAGES);

    // Re-create the scores file
    await dataPopulator.populateAllScores(SCORES_FILE, NUM_SCORES);
  },
  // Adjust test timeout based on number of scores we're getting
  TIME_TO_GET_ONE_SCORE * NUM_SCORES
);

test('Test populateCondensedScores', async () => {
  await dataPopulator.populateCondensedScores(CONDENSED_SCORES_FILE);
  const scores = JSON.parse(
    await readFile(CONDENSED_SCORES_FILE, 'utf8')
  ) as Score[];
  // The CoffeeScript scores shouldn't be included in the file
  expect(scores.length).toEqual(8);
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
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});

    // Wipe the scores file for a clean slate and then re-create it
    await rm(SCORES_FILE);

    // Populate two months of data so we can manipulate the second to most recent one
    await dataPopulator.populateAllScores(SCORES_FILE, NUM_LANGUAGES * 2);

    // Set a high score for CoffeeScript
    const scores = JSON.parse(await readFile(SCORES_FILE, 'utf8')) as Score[];
    scores[3].points = 2000;

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
