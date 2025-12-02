// Calculate score deviations in data/scores-full.json
//
// To run this: node_modules/.bin/ts-node scripts/calculate-deviation.ts

import 'dotenv/config';

import { defaultOldestDate } from '../src/consts';
import GitHub from '../src/GitHub';
import settings from '../src/settings.json';
import StackOverflow from '../src/StackOverflow';

import languages from '../data/languages.json';
import scores from '../data/scores-full.json';
import { Language } from '../src/DataPopulator';

const main = async () => {
  let currentDate = '2008-02-01';
  let previousDate = '';

  for (const currentDateScore of scores) {
    // new month
    if (currentDateScore.date !== currentDate) {
      previousDate = currentDate;
      currentDate = currentDateScore.date;
    }

    // don't do anything until the second date
    if (!previousDate) {
      continue;
    }

    // get the previous month's score
    const previousDateScore = scores.find(
      (score) =>
        score.date === previousDate &&
        score.languageId === currentDateScore.languageId
    );

    const deviationPoints = previousDateScore!.points - currentDateScore.points;
    const deviationPercentage =
      (deviationPoints / previousDateScore!.points) * 100;

    if (deviationPoints > settings.minimumScore && deviationPercentage > 1) {
      const language = languages.find(
        (language) => language.id === currentDateScore.languageId
      );

      if (!language) {
        throw new Error(
          `Language ID not found: ${currentDateScore.languageId}`
        );
      }

      console.log(`Language: ${language.name}`);

      console.log('previousDateScore: ', previousDateScore);
      console.log(
        'previous score from API: ',
        await getScoreFromApi(language, previousDate)
      );
      console.log('currentDateScore: ', currentDateScore);
      console.log(
        'current score from API: ',
        await getScoreFromApi(language, currentDate)
      );
      console.log('deviation: ', -deviationPoints);
      console.log('deviation %:', (-deviationPercentage).toFixed(1));
      console.log();
    }
  }
};

const getScoreFromApi = async (
  language: Language,
  dateString: string
): Promise<number> => {
  const date = new Date(dateString);

  const github = new GitHub(process.env.GITHUB_API_KEY!);
  const stackoverflow = new StackOverflow(process.env.STACKOVERFLOW_API_KEY!);

  const githubScore = await github.getScore(
    language.name,
    defaultOldestDate,
    date
  );
  const stackoverflowScore = await stackoverflow.getScore(
    language.stackoverflowTag || language.name,
    defaultOldestDate,
    date
  );

  return githubScore + stackoverflowScore;
};

main();
