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

test('Test getScore toDate is inclusive', async () => {
  const github = new GitHub(process.env.GITHUB_API_KEY!);
  expect(
    await github.getScore(
      'JavaScript',
      new Date('2023-01-01'),
      // getScore will automatically subtract one day, making this effectively 2023-01-01
      new Date('2023-01-02')
    )
  ).toBeGreaterThan(0);
});

test('Test getScore fromDate and toDate are interchangeable', async () => {
  const github = new GitHub(process.env.GITHUB_API_KEY!);

  let score1 = await github.getScore(
    'JavaScript',
    new Date('2023-01-01'),
    // getScore will automatically subtract one day, making this effectively 2023-01-31
    new Date('2023-02-01')
  );

  let score2 = await github.getScore(
    'JavaScript',
    new Date('2023-01-31'),
    // getScore will automatically subtract one day, making this effectively 2023-01-01
    new Date('2023-01-02')
  );

  expect(score1).toEqual(score2);
});
