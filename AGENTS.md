This project contains data for a website that shows trends in usage of different programming languages.

- Use British English spelling
- Do not stage nor commit any files to Git
- Do not remove any files

## Tasks

#### Update language metadata

Follow the steps under the section "Adding languages to `languages-metadata.json`" in README.md with these additional guidelines:

- Do not run `update-data`, `remove-language.ts`, or `remove-scores.ts`; the only script you should run is `validate-languages`
- Do not make any changes to `languages.json`, `scores-full.json`, or `scores.json`; the only file you should modify is `languages-metadata.json`
- Always include a description and URL for each new lanugage added to languages-metadata.json
- When adding a URL, always check to make sure the URL is valid
- Keep entries in languages-metadata.json in alphabetical order by language name
