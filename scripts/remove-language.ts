'use strict';

import { readFile, writeFile } from 'fs/promises';
import { Language, Score } from './src/DataPopulator';

const main = async () => {
  console.log('process.argv=', process.argv);

  if (process.argv.length !== 3) {
    console.log('Error: Please provide the name of a language to remove');
    process.exit(1);
  }

  const languageNameToRemove = process.argv[2];

  const languages = JSON.parse(await readFile('data/languages.json', 'utf8'));
  const languageToRemove = languages.find(
    (language: Language) => language.name === languageNameToRemove
  );
  const filteredLanguages = languages.filter(
    (language: Language) => language.name !== languageToRemove
  );

  console.log('languages.length=', languages.length);
  console.log('filteredLanguages.length=', filteredLanguages.length);
  console.log('languageToRemove=', languageToRemove);
};

main();
