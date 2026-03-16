This project contains data for a website that shows trends in usage of different programming languages.

- Use British English spelling
- Do not stage nor commit any files to Git
- Do not remove any files
- Do not run `update-data`, `remove-language.ts`, or `remove-scores.ts`

## Tasks

#### Update language metadata

Follow the steps under the section "Adding languages to `languages-metadata.json`" in README.md with these additional guidelines:

- Always include a description and URL for each new lanugage added to languages-metadata.json
- When deciding which URL to use, use this order of preference (higher preference first):
  1. Prefer a github.com URL when available, e.g. `https://github.com/tree-sitter/tree-sitter`
  1. Next, if there's an official website, use that, e.g. `https://tree-sitter.github.io/tree-sitter/`
  1. Finally, you can use a wikipedia URL if available, e.g. `https://en.wikipedia.org/wiki/Tree-sitter_(parser_generator)`
- Keep entries in languages-metadata.json in alphabetical order by language name
