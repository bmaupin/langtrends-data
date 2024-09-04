// Get scores for a particular language and date, plus previous scores as desired
//
// To run:
// 1. Adjust the language, date, and number of scores
// 2. npx ts-node scripts/get-scores.ts

import { oldestDate } from '../src/consts';
import { Language } from '../src/DataPopulator';
import GitHub from '../src/GitHub';
import StackOverflow from '../src/StackOverflow';
import languages from '../data/languages.json';
import scoresFromData from '../data/scores-full.json';
import { convertDateToDateString, subtractMonthsUTC } from '../src/utils';

import 'dotenv/config';

const languageName = 'Standard ML';
const dateString = '2024-09-01';
// Get this many scores total, starting with the above date and then getting older scores
const numScores = 5;

const main = async () => {
  const language = getLanguage(languageName);

  let date = new Date(dateString);

  for (let i = 0; i < numScores; i++) {
    console.log(`${languageName}\t${convertDateToDateString(date)}\n`);

    let githubScore = await getGitHubScoreFromApi(
      language,
      subtractMonthsUTC(date, 1),
      date
    );
    console.log('GitHub score=', githubScore);
    let stackoverflowScore = await getStackOverflowScoreFromApi(
      language,
      subtractMonthsUTC(date, 1),
      date
    );
    console.log('Stack Overflow score=', stackoverflowScore);
    console.log('Combined score=', githubScore + stackoverflowScore);
    console.log();

    githubScore = await getGitHubScoreFromApi(language, oldestDate, date);
    console.log('GitHub total score=', githubScore);
    stackoverflowScore = await getStackOverflowScoreFromApi(
      language,
      oldestDate,
      date
    );
    console.log('Stack Overflow total score=', stackoverflowScore);
    console.log('Combined total score=', githubScore + stackoverflowScore);
    console.log();

    date = subtractMonthsUTC(date, 1);
  }
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
  fromDate: Date,
  toDate: Date
): Promise<number> => {
  const github = new GitHub(process.env.GITHUB_API_KEY!);

  return await github.getScore(language.name, fromDate, toDate);
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
  fromDate: Date,
  toDate: Date
): Promise<number> => {
  const stackoverflow = new StackOverflow(process.env.STACKOVERFLOW_API_KEY!);

  return await stackoverflow.getScore(
    language.stackoverflowTag || language.name,
    fromDate,
    toDate
  );
};

main();
