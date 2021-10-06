'use strict';

const Stackoverflow = require('../Stackoverflow');

test('Test getScore', async () => {
  let stackoverflow = new Stackoverflow();
  if (process.env.hasOwnProperty('STACKOVERFLOW_API_KEY')) {
    stackoverflow.apiKey = process.env.STACKOVERFLOW_API_KEY;
  }
  expect(await stackoverflow.getScore('JavaScript', new Date('2017-01-01'))).toBeGreaterThan(1000000);
});
