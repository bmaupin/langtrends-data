'use strict';

import { readFile, writeFile } from 'fs/promises';
import { Language, Score } from './src/DataPopulator';

const languagesFile = 'data/languages.json';
const scoresFile = 'data/scores-full.json';

const main = async () => {
  if (process.argv.length !== 3) {
    console.error(
      'Error: Please provide the name of a language for whose scores to remove'
    );
    process.exit(1);
  }

  const languageNameToRemove = process.argv[2];

  const languages = JSON.parse(await readFile(languagesFile, 'utf8'));
  const languageToRemove = languages.find(
    (language: Language) => language.name === languageNameToRemove
  );

  const scores = JSON.parse(await readFile(scoresFile, 'utf8'));
  const filteredScores = scores.filter(
    (score: Score) => score.languageId != languageToRemove.id
  );

  await writeFile(scoresFile, JSON.stringify(filteredScores, null, 2));

  console.log(`${scores.length - filteredScores.length} scores removed`);
};

main();
