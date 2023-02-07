'use strict';

import 'dotenv/config';

import GitHub from './GitHub';

test('Test getLanguageNames', async () => {
  const languageNames = await GitHub.getLanguageNames();
  expect(languageNames.length).toBeGreaterThan(100);
  expect(languageNames).toContain('JavaScript');
});

test('Test getScore', async () => {
  const github = new GitHub(process.env.GITHUB_API_KEY!);
  expect(
    await github.getScore(
      'JavaScript',
      new Date('2023-01-01'),
      new Date('2023-02-01')
    )
  ).toBeGreaterThan(100000);
  expect(
    await github.getScore(
      'JavaScript',
      new Date('2023-01-01'),
      new Date('2023-02-01')
    )
  ).toBeLessThan(10000000);
});

test('Test getScore with empty API key', async () => {
  const github = new GitHub('');
  await expect(
    github.getScore(
      'JavaScript',
      new Date('2023-01-01'),
      new Date('2023-02-01')
    )
  ).rejects.toThrow('statusCode=401');
});

test('Test getScore with same from/to date', async () => {
  const github = new GitHub(process.env.GITHUB_API_KEY!);
  expect(
    await github.getScore(
      'JavaScript',
      new Date('2023-02-01'),
      new Date('2023-02-01')
    )
  ).toBe(0);
});
