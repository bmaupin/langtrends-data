'use strict';

import 'dotenv/config';

import StackOverflow from './StackOverflow';

test('Test getScore with API key', async () => {
  const stackoverflow = new StackOverflow(process.env.STACKOVERFLOW_API_KEY!);
  expect(
    await stackoverflow.getScore(
      'JavaScript',
      new Date('2023-01-01'),
      new Date('2023-02-01')
    )
  ).toBeGreaterThan(5000);
});

test('Test getScore without API key', async () => {
  // Suppress warnings logged by this test (https://stackoverflow.com/a/58717352/399105)
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  const stackoverflow = new StackOverflow();

  // Anonymous API calls have a much lower rate limit and may fail; this is fine
  try {
    expect(
      await stackoverflow.getScore(
        'JavaScript',
        new Date('2023-01-01'),
        new Date('2023-02-01')
      )
    ).toBeGreaterThan(5000);
  } catch (error) {
    if (error instanceof Error) {
      expect(error.message.startsWith('statusCode=400')).toBe(true);
    }
  }
});

test('Test getScore with bad API key', async () => {
  // Suppress warnings logged by this test (https://stackoverflow.com/a/58717352/399105)
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const stackoverflow = new StackOverflow('njO13SHsx1huIkFtYThY7M0T');
  await expect(
    stackoverflow.getScore(
      'JavaScript',
      new Date('2023-01-01'),
      new Date('2023-02-01')
    )
  ).rejects.toThrow('statusCode=400');
});

test('Test getScore with same from/to date', async () => {
  const stackoverflow = new StackOverflow(process.env.STACKOVERFLOW_API_KEY!);
  expect(
    await stackoverflow.getScore(
      'JavaScript',
      new Date('2023-02-01'),
      new Date('2023-02-01')
    )
  ).toBe(0);
});

test('Test StackOverflow API with no user agent', async () => {
  // Suppress warnings logged by this test (https://stackoverflow.com/a/58717352/399105)
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  const stackoverflow = new StackOverflow(process.env.STACKOVERFLOW_API_KEY!);
  const url = (stackoverflow as any).buildUrl(
    'JavaScript',
    new Date('2023-01-01'),
    new Date('2023-02-01')
  );
  await expect((stackoverflow as any).httpsRequest({}, url)).rejects.toThrow(
    'statusCode=403'
  );
});
