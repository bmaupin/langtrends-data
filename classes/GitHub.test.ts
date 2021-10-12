'use strict';

require('dotenv').config();

import GitHub from './GitHub';

test('Test getLanguageNames', async () => {
  let languageNames = await GitHub.getLanguageNames();
  expect(languageNames.length).toBeGreaterThan(100);
  expect(languageNames).toContain('JavaScript');
});

test('Test getScore', async () => {
  let github = new GitHub();
  if (process.env.GITHUB_API_KEY) {
    github.apiKey = process.env.GITHUB_API_KEY;
  }
  expect(await github.getScore('C++', new Date('2017-01-01'))).toBeGreaterThan(
    100000
  );
  expect(await github.getScore('C++', new Date('2017-01-01'))).toBeLessThan(
    10000000
  );
});
