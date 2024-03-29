// Get deviations between scores for a particular language and date. For more information,
// see:
// - https://github.com/bmaupin/langtrends-data/issues/17
// - https://github.com/bmaupin/langtrends-data/issues/18
//
// To run: node_modules/.bin/ts-node scripts/calculate-github-deviations.ts

import 'dotenv/config';

import { Language } from '../src/DataPopulator';
import GitHub from '../src/GitHub';
import StackOverflow from '../src/StackOverflow';
import languages from '../data/languages.json';
import scoresFromData from '../data/scores-full.json';
import { convertDateToDateString, subtractMonthsUTC } from '../src/utils';

const languageName = 'Swift';
const dateString = '2023-01-01';
const numScores = 5;
const waitTime = 300000;

const main = async () => {
  console.log(`${languageName}\t${dateString}\n`);

  const language = getLanguage(languageName);
  const date = new Date(dateString);

  const scoresFromGitHub: number[] = [];

  for (let i = 0; i < numScores; i++) {
    const score = await getGitHubScoreFromApi(language, date);

    if (scoresFromGitHub.length > 0) {
      if (score === scoresFromGitHub[scoresFromGitHub.length - 1]) {
        console.warn(
          'Duplicate scores found; try increasing value of setTimeout'
        );
      }
    }

    scoresFromGitHub.push(score);

    // Wait a few seconds between each score; if idential API calls are made too close
    // together, the result will be the same, which we don't want
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  console.log('From GitHub:');
  console.log('\tscores:', scoresFromGitHub);
  console.log(
    '\trange:',
    calculateMax(scoresFromGitHub) - calculateMin(scoresFromGitHub)
  );
  console.log('\taverage:', calculateAverage(scoresFromGitHub));
  console.log('\tmax:', calculateMax(scoresFromGitHub));

  const scoreFromData = getScoreFromData(language, dateString);
  console.log('\nFor comparison:');

  const scoreFromStackOverflow = await getStackOverflowScoreFromApi(
    language,
    date
  );

  if (scoreFromData) {
    // console.log('\tscore from data:', scoreFromData);
    // console.log('\tscore from StackOverflow:', scoreFromStackOverflow);
    console.log(
      '\tGitHub score from data:',
      scoreFromData - scoreFromStackOverflow
    );
  }

  const previousMonth = subtractMonthsUTC(date, 1);
  const previousMonthTotalScore = getScoreFromData(
    language,
    convertDateToDateString(previousMonth)
  )!;
  console.log(
    "\tPrevious month's score from data:",
    previousMonthTotalScore -
      (await getStackOverflowScoreFromApi(language, previousMonth))
  );
  console.log();

  if (scoreFromData) {
    const revisedTotalScore =
      calculateMax(scoresFromGitHub) + scoreFromStackOverflow;
    console.log(
      `Revised total score: ${revisedTotalScore} (${
        revisedTotalScore - previousMonthTotalScore
      })`
    );
    console.log(
      `Current total score: ${scoreFromData} (${
        scoreFromData - previousMonthTotalScore
      })`
    );

    // Format some scores for https://github.com/bmaupin/langtrends-data/issues/18
    const currentGitHubScore = scoreFromData - scoreFromStackOverflow;
    const revisedGitHubScore = calculateMax(scoresFromGitHub);

    console.log(
      `| ${languageName} | ${currentGitHubScore} | ${revisedGitHubScore} | ${
        revisedGitHubScore - currentGitHubScore
      } | ${((revisedGitHubScore / currentGitHubScore) * 100 - 100).toFixed(
        2
      )}% |`
    );
  }

  console.log('\n\n');
};

const getLanguage = (languageName: string): Language => {
  const language = languages.find((language) => language.name === languageName);

  if (!language) {
    throw new Error(`Language not found: ${languageName}`);
  }

  return language;
};

const getGitHubScoreFromApi = async (
  language: Language,
  date: Date
): Promise<number> => {
  const github = new GitHub(process.env.GITHUB_API_KEY!);

  return await github.getScore(language.name, date);
};

const getScoreFromData = (
  language: Language,
  dateString: string
): number | null => {
  for (const score of scoresFromData) {
    if (score.date === dateString && score.languageId === language.id) {
      return score.points;
    }
  }

  return null;
};

const getStackOverflowScoreFromApi = async (
  language: Language,
  date: Date
): Promise<number> => {
  const stackoverflow = new StackOverflow(process.env.STACKOVERFLOW_API_KEY!);

  return await stackoverflow.getScore(
    language.stackoverflowTag || language.name,
    date
  );
};

// I know I can do these using array.reduce but they took me 5 seconds to write :D
const calculateAverage = (numbers: number[]) => {
  let total = 0;
  for (const num of numbers) {
    total += num;
  }
  return total / numbers.length;
};

const calculateMin = (numbers: number[]) => {
  let min = numbers[0];
  for (const num of numbers) {
    if (num < min) {
      min = num;
    }
  }
  return min;
};

const calculateMax = (numbers: number[]) => {
  let max = numbers[0];
  for (const num of numbers) {
    if (num > max) {
      max = num;
    }
  }
  return max;
};

main();

/* Findings
 *
 * - Longer wait times give more variance?
 *
 * Swift (GitHub score of ~1094807) and lower seem to return consistent results
 *   - but results started to differ when we increased wait time to 10 seconds
 * C (GitHub score of ~2284251) and higher seem to return different results
 *
 * To do
 * - try larger wait times (20+ seconds)
 * - try shorter wait times with more scores
 */
