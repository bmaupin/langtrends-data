'use strict';

const Github = require('../Github');

test('Test getLanguageNames', async () => {
  let languageNames = await Github.getLanguageNames();
  expect(languageNames.length).toBeGreaterThan(100);
  expect(languageNames).toContain('JavaScript');
});

test('Test getScore', async () => {
  let github = new Github();
  if (process.env.hasOwnProperty('GITHUB_API_KEY')) {
    github.apiKey = process.env.GITHUB_API_KEY;
  }
  expect(await github.getScore('C++', new Date('2017-01-01'))).toBeGreaterThan(100000);
  expect(await github.getScore('C++', new Date('2017-01-01'))).toBeLessThan(10000000);
});
