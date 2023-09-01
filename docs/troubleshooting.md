# Troubleshooting

#### Update data fails

1. Re-run the script

   - The data for GitHub in particular can vary wildly at times ([https://github.com/bmaupin/langtrends-data/issues/18](https://github.com/bmaupin/langtrends-data/issues/18)). Try re-running the script before doing anything else.

   - It may even be helpful to wait a day or so and try again

1. Run [get-scores.ts](../scripts/get-scores.ts) for that particular language and date

1. As needed, update the error-checking logic in `populateScore` in [DataPopulator.ts](../src/DataPopulator.ts)
