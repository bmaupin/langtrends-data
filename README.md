[![CI](https://github.com/bmaupin/langtrends-data/workflows/CI/badge.svg)](https://github.com/bmaupin/langtrends-data/actions)
[![Coverage Status](https://coveralls.io/repos/github/bmaupin/langtrends-data/badge.svg)](https://coveralls.io/github/bmaupin/langtrends-data)
[![License](https://img.shields.io/github/license/bmaupin/langtrends-data)](https://github.com/bmaupin/langtrends-data/blob/master/LICENSE)

---

Data for [https://github.com/bmaupin/langtrends](https://github.com/bmaupin/langtrends)

#### Data files

- [languages.json](data/languages.json)
  - This is the language data intended to be published and used by the frontend
  - This file is not intended to be manually edited
  - This file contains no whitespace in order to reduce the size of data that needs to be transferred
  - Languages contain IDs so that they can be referenced by scores to keep the data normalized and reduce the size of the scores data
- [languages-metadata.json](data/languages-metadata.json)
  - This contains language metadata for all languages
  - This file is intended to be manually edited
  - This file contains whitespace so it can be more easily read and modified
- [scores.json](data/scores.json)
  - This is the score data intended to be published and used by the frontend
  - This file is not intended to be manually edited
  - This file contains no whitespace in order to reduce the size of data that needs to be transferred
- [scores-full.json](data/scores-full.json)
  - This is the full list of scores
  - This file is not intended to be manually edited
  - This file contains whitespace so it can be more easily read and so that changes to it can be more easily tracked using Git

#### Date format

- Dates are stored in this format: `YYYY-MM-DD`, e.g. `2021-01-01`
  - Omitting the time reduces the size of the data files
  - Using strings (instead of integers) makes the data easier to read
  - This format still permits converting to a `Date` object using `new Date(score.date)`
    - Other considered formats (e.g. `YYYYMMDD`) don't work without parsing
    - This will also create a `Date` with a timestamp of midnight UTC (regardless of the local time zone), which was the intention; for example, `new Date('2021-01-01')` is the same as `new Date('2021-01-01 00:00:00.000Z')`

#### Adding languages to `languages-metadata.json`

1. Run validate-languages to get the list of missing languages

   ```
   npm run validate-languages
   ```

1. Identify the language

   1. Start with the language samples on [github/linguist](https://github.com/github/linguist/tree/master/samples)

      - The git commit logs will often have helpful references
      - If that isn't helpful, the file extensions and language syntax will help identify the language if there's ambiguity when following the next steps

   1. (As needed) Look up the language using a web search

      - Use a search term including the words `programming language` often returns the best results, e.g. `4D programming language`
      - Wikipedia is often a good reference but may not have entries for newer/more obscure languages

   1. (As needed) Look up the language on GitHub

      - Go to [https://github.com/search/advanced](https://github.com/search/advanced) and select the language
      - This can sometimes help in identifying a langauge, particurly if it is obscure and/or open-source
      - This can be also useful to determine if a language is general-purpose, abandoned, etc. for deciding if it should be included

1. Decide whether or not to include the language

   - As a rule of thumb, any language that can be used to build a cross-platform application should be included
   - Commercial/proprietary languages are fine as long as they adhere to the above rule, e.g. ASP.NET and ColdFusion can be used to write web applications which can be accessed on any platform (in theory)
   - Don't include: DSLs, markup languages, abandoned/superceded languages (e.g. CSS, HTML, SQL)

1. Add the language to `languages-metadata.json`

   - The name should exactly match the output from `validate-languages` (including the case)
   - `include` is the only required attribute

     > ⚠ If `include` is set to `true`, check [StackOverflow tags](https://stackoverflow.com/tags) to see if `stackoverflowTag` needs to be set

   - Adding a `url` is preferred especially if there's ambiguity
   - Add a `description` and/or `type` in cases where it may not be clear why a language was/wasn't included

1. Update language and score data

   ```
   npm run update-data
   ```

#### Modifying languages

If a language has changed on GitHub or Stack Overflow:

1. Go to [Stack Overflow tags](https://stackoverflow.com/tags) and find the appropriate tag

1. Update the language in `languages-metadata.json`

1. If the language was removed (`include` was previously set to `true`) or `stackoverflowTag` was changed, remove all scores for that language from `scores-full.json`

   ```
   npm run remove-scores PureBasic
   ```

1. If the language was removed (`include` was previously set to `true`), remove the language from `languages.json` manually

1. If the language was renamed, manually update the old language in `languages.json` with the new name

1. Run `update-data` to update `languages.json` and `scores.json`

   ```
   npm run update-data
   ```

1. Commit changes to the `data` directory
