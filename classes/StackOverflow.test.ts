'use strict';

import 'dotenv/config';

import StackOverflow from './StackOverflow';

test('Test getScore with API key', async () => {
  const stackoverflow = new StackOverflow(process.env.STACKOVERFLOW_API_KEY!);
  expect(
    await stackoverflow.getScore('JavaScript', new Date('2017-01-01'))
  ).toBeGreaterThan(1000000);
});

test('Test getScore without API key', async () => {
  const stackoverflow = new StackOverflow();
  expect(
    await stackoverflow.getScore('JavaScript', new Date('2017-01-01'))
  ).toBeGreaterThan(1000000);
});
