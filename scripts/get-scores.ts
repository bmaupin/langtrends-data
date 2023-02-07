import { Language } from '../classes/DataPopulator';
import GitHub from '../classes/GitHub';
import StackOverflow from '../classes/StackOverflow';
import languages from '../data/languages.json';
import scoresFromData from '../data/scores-full.json';

import 'dotenv/config';

const oldestDate = new Date('2008-02-01');

const languageName = 'C++';
const dateString = '2023-02-01';
const numScores = 2;

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

const convertDateToDateString = (date: Date): string => {
  return date.toISOString().slice(0, 10);
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

const subtractMonthsUTC = (date: Date, monthsToSubtract: number): Date => {
  // Make a copy of the date object so we don't overwrite it
  const newDate = new Date(date);
  newDate.setUTCMonth(newDate.getUTCMonth() - monthsToSubtract);
  return newDate;
};

main();
