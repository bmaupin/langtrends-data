#### Data files

- languages.json
  - This is the language data intended to be published and used by the frontend
  - This file is not intended to be manually edited
  - This file contains no whitespace in order to reduce the size of data that needs to be transferred
  - Languages contain IDs so that they can be referenced by scores to keep the data normalized and reduce the size of the scores data
- languages-metadata.json
  - This contains language metadata for all languages
  - This file is intended to be manually edited
  - This file contains whitespace so it can be more easily read and modified
- scores.json
  - This is the score data intended to be published and used by the frontend
  - This file is not intended to be manually edited
  - This file contains no whitespace in order to reduce the size of data that needs to be transferred
  - Scores do not contain IDs because there's no need for them and this reduces the size of data that needs to be transferred
- scores-full.json
  - This is the full list of scores
  - This file is not intended to be manually edited
  - This file contains whitespace so it can be more easily read and so that changes to it can be more easily tracked using Git

#### Date format

- Dates are stored without times in order to reduce the size of the data files
- Dates are stored as strings so they can be easily read
- Dates are stored in a format which can be directly converted to a `Date` object using `new Date(score.date)`
  - This will also create a `Date` with a timestamp of midnight UTC, which was the intention; for example, `new Date('2021-01-01')` is the same as `new Date('2021-01-01 00:00:00.000Z')`
