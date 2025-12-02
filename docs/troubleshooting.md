# Troubleshooting

## Update data fails

#### Failing due to score deviation

1. Re-run the script

   - The data for GitHub in particular can vary wildly at times ([https://github.com/bmaupin/langtrends-data/issues/18](https://github.com/bmaupin/langtrends-data/issues/18)). Try re-running the script before doing anything else.

   - It may even be helpful to wait a day or so and try again

1. Run [get-scores.ts](../scripts/get-scores.ts) for that particular language and date

1. Go over recent scores in [data/scores-full.json](../data/scores-full.json) to look for any anomalies

   TODO: could we add this to get-scores.ts?

   ⓘ DataPopulator has logic to look for large decreases in scores but not large increases. I'm not sure why this happens (maybe a bug in language detection in GitHub) but a score could have an abnormally large increase one month due to bad data. Then the next month there will be an abnormally large decrease, which will trigger DataPopulator's logic.

   1. If there's an abnormality for one month, the easiest solution is to delete that month's score manually, then re-calculate scores (see below)

1. If the scores are bad enough, you can re-calculate all scores for a language

   ⓘ For example, if GitHub updated their language detection logic for a specific language, the scores for that language could be drastically changed and should probably be recalculated

   1. Remove all scores for the language, e.g.

      ```
      npx ts-node scripts/remove-scores.ts "Standard ML"
      ```

   1. Re-calculate scores (see below)

1. If the scores don't need to be re-calculated, the error-checking logic may need to be adjusted. See `populateScore` in [DataPopulator.ts](../src/DataPopulator.ts).

#### Failing for another reason

Try updating just one score to isolate the problem

1. Edit [get-scores.ts](../scripts/get-scores.ts) for that particular language and date

   - `languageName` can be anything
   - Set `dateString` to the failing date
   - Set `numScores` to `1`

1. Run [get-scores.ts](../scripts/get-scores.ts)

   (See the instructions in the file)

## Call APIs directly for troubleshooting

#### GitHub

⚠️ GitHub's GraphQL Explorer is no longer available

1. Get your GitHub API key and have it available

1. Format the GraphQL API request

   e.g. To get a repository count for a particular date range (both dates are inclusive):

   ```
   {"query": "{ search(query: \"language:JavaScript created:2023-01-01..2023-01-31\", type: REPOSITORY) { repositoryCount } rateLimit { remaining }}"}
   ```

1. Send the API call

   ```
   curl -H "Authorization: bearer API_KEY" \
      -H "Content-Type: application/json" \
      --data '{"query": "{ search(query: \"language:JavaScript created:2023-01-01..2023-01-31\", type: REPOSITORY) { repositoryCount } rateLimit { remaining }}"}' \
      https://api.github.com/graphql
   ```

   (Replace `API_KEY` with your API key)

#### StackOverflow

1. Generate the unix epoch formatted dates using JavaScript

   ```javascript
   Math.floor(new Date('2024-08-01') / 1000);
   Math.floor(new Date('2024-09-01') / 1000);
   ```

1. Call the StackOverflow API, e.g.

   [https://api.stackexchange.com/2.2/search?fromdate=1722470400&todate=1725148800&site=stackoverflow&tagged=typescript&filter=!.UE8F0bVg4M-\_Ii4](https://api.stackexchange.com/2.2/search?fromdate=1722470400&todate=1725148800&site=stackoverflow&tagged=typescript&filter=!.UE8F0bVg4M-_Ii4)

   - To call with an API key, add `&key=` followed by the key to the end of the URL

## Re-calculate scores

1. If you want to update the scores for the language without adding newer scores, edit the `DataPopulator` constructor in [DataPopulator.ts](../src/DataPopulator.ts). and set it to the newest date in scores-full.json, e.g.

   ```typescript
   // this.firstDayOfMonth = getFirstDayOfMonthUTC();
   this.firstDayOfMonth = new Date('2024-04-01');
   ```

ⓘ This is for when you want to update the scores after deleting one or more scores for a language, but the current month's scores haven't yet been added and you don't want to add them in order to keep the changes separate

1. Re-calculate the scores for the language

   ```
   npm run update-data
   ```
