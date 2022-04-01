'use strict';

import 'dotenv/config';
import { expect, spyOn, test } from 'vitest';

import StackOverflow from './StackOverflow';

test('Test getScore with API key', async () => {
  const stackoverflow = new StackOverflow(process.env.STACKOVERFLOW_API_KEY!);
  expect(
    await stackoverflow.getScore('JavaScript', new Date('2017-01-01'))
  ).toBeGreaterThan(1000000);
});

test('Test getScore without API key', async () => {
  // Suppress warnings logged by this test (https://stackoverflow.com/a/58717352/399105)
  spyOn(console, 'warn').mockImplementation(() => {});

  const stackoverflow = new StackOverflow();

  // Anonymous API calls have a much lower rate limit and may fail; this is fine
  try {
    expect(
      await stackoverflow.getScore('JavaScript', new Date('2017-01-01'))
    ).toBeGreaterThan(1000000);
  } catch (error) {
    if (error instanceof Error) {
      expect(error.message).toBe('statusCode=400');
    }
  }
});

test('Test getScore with bad API key', async () => {
  // Suppress warnings logged by this test (https://stackoverflow.com/a/58717352/399105)
  spyOn(console, 'warn').mockImplementation(() => {});
  const stackoverflow = new StackOverflow('njO13SHsx1huIkFtYThY7M0T');
  await expect(
    stackoverflow.getScore('JavaScript', new Date('2017-01-01'))
  ).rejects.toThrow('statusCode=400');
});
