'use strict';

require('dotenv').config();

import StackOverflow from './StackOverflow';

test('Test getScore', async () => {
  const stackoverflow = new StackOverflow();
  if (process.env.STACKOVERFLOW_API_KEY) {
    stackoverflow.apiKey = process.env.STACKOVERFLOW_API_KEY;
  }
  expect(
    await stackoverflow.getScore('JavaScript', new Date('2017-01-01'))
  ).toBeGreaterThan(1000000);
});
