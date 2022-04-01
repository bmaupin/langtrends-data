// To run this: node_modules/.bin/ts-node scripts/calculate-deviation.ts

'use strict';

import settings from '../classes/settings.json';

import languages from '../data/languages.json';
import scores from '../data/scores-full.json';

const main = () => {
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

    const deviation = previousDateScore!.points - currentDateScore.points;
    if (deviation > settings.maximumScoreDeviation) {
      console.log(
        `Language: ${
          languages.find(
            (language) => language.id === currentDateScore.languageId
          )?.name
        }`
      );

      console.log('previousDateScore: ', previousDateScore);
      console.log('currentDateScore: ', currentDateScore);
      console.log('deviation: ', -deviation);
      console.log(
        'deviation %:',
        (-(deviation / previousDateScore!.points) * 100).toFixed(1)
      );
      console.log();
    }
  }
};

main();
