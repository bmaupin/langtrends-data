'use strict';

import { readFile, writeFile } from 'fs/promises';

import {
  defaultCondensedScoresFile,
  defaultLanguagesFile,
  defaultOldestDate,
  defaultScoresFile,
} from './consts';
import GitHub from './GitHub';
import _languagesMetadata from '../data/languages-metadata.json';
import settings from './settings.json';
import StackOverflow from './StackOverflow';
import {
  addMonthsUTC,
  convertDateToDateString,
  getFirstDayOfMonthUTC,
  subtractMonthsUTC,
} from './utils';

import 'dotenv/config';

interface DataPopulatorOptions {
  // Path to the condensed scores data file
  condensedScoresFile?: string;
  // Path to the languages data file
  languagesFile?: string;
  // List of languages from GitHub
  languagesFromGithub?: string[];
  // Oldest date to use for populating languages
  oldestDate?: Date;
  // Path to the scores data file
  scoresFile?: string;
}

export interface LanguagesMetadata {
  [key: string]: {
    description?: string;
    extension?: string;
    include: Boolean;
    stackoverflowTag?: string;
    url?: string;
  };
}

export interface Language {
  id: number;
  name: string;
  stackoverflowTag?: string;
}

export interface Score {
  date: string;
  languageId: number;
  points: number;
}

const languagesMetadata = _languagesMetadata as LanguagesMetadata;

export default class DataPopulator {
  private condensedScoresFile: string;
  private firstDayOfMonth: Date;
  private github: GitHub;
  private languages: Language[];
  private languagesFile: string;
  private languagesFromGithub?: string[];
  private oldestDate: Date;
  private scores: Score[];
  private scoresFile: string;
  private stackoverflow: StackOverflow;

  /**
   * @param options Options mostly used for overriding default values for testing
   */
  constructor(options?: DataPopulatorOptions) {
    if (!process.env.GITHUB_API_KEY) {
      throw new Error('GITHUB_API_KEY must be set');
    }

    this.condensedScoresFile =
      options?.condensedScoresFile ?? defaultCondensedScoresFile;
    this.firstDayOfMonth = getFirstDayOfMonthUTC();
    this.github = new GitHub(process.env.GITHUB_API_KEY);
    this.languages = [];
    this.languagesFile = options?.languagesFile ?? defaultLanguagesFile;
    this.languagesFromGithub = options?.languagesFromGithub;
    this.oldestDate = options?.oldestDate ?? defaultOldestDate;
    this.scores = [];
    this.scoresFile = options?.scoresFile ?? defaultScoresFile;
    this.stackoverflow = new StackOverflow(process.env.STACKOVERFLOW_API_KEY);
  }

  /**
   * Populate languages in the data file
   * @param numLanguages - Number of languages to populate (used for testing)
   * @returns - Whether or not there are any language discrepancies in the data files
   */
  public async populateLanguages(numLanguages?: number) {
    this.languages = (await DataPopulator.readDataFile(
      this.languagesFile
    )) as Language[];
    const oldLanguageCount = this.languages.length;

    // Check first to see if it isn't set; we allow overriding it for tests
    if (!this.languagesFromGithub) {
      // Store languagesFromGithub in a class field because we'll need it later when populating scores
      this.languagesFromGithub = await GitHub.getLanguageNames();
    }

    for (const languageName of this.languagesFromGithub) {
      if (numLanguages && this.languages.length >= numLanguages) {
        break;
      }

      if (languageName && languagesMetadata[languageName]) {
        if (languagesMetadata[languageName].include === true) {
          await this.upsertLanguage(
            languageName,
            languagesMetadata[languageName].stackoverflowTag
          );
        }
      } else {
        console.info(
          `Language from GitHub not found in metadata: ${languageName}`
        );
      }
    }

    console.info(
      `Successfully populated ${
        this.languages.length - oldLanguageCount
      } languages`
    );

    await writeFile(this.languagesFile, JSON.stringify(this.languages));
  }

  /**
   * Read the data file and return its contents
   * @param pathToFile - Path to the data file
   * @returns - Contents of the file or an empty array if the file doesn't exist
   */
  private static async readDataFile(pathToFile: string): Promise<[]> {
    try {
      return JSON.parse(await readFile(pathToFile, 'utf8'));
    } catch {
      return [];
    }
  }

  /**
   * Add language if it doesn't exist, otherwise update stackoverflowTag
   * @param languageName - Name of the language (as returned by GitHub)
   * @param stackoverflowTag - Optional StackOverflow tag
   */
  private async upsertLanguage(
    languageName: string,
    stackoverflowTag?: string
  ) {
    const language = this.languages.find(
      (language) => language.name === languageName
    );

    if (language) {
      language.stackoverflowTag = stackoverflowTag;
    } else {
      // Languages are sorted ascending by ID
      const highestId = this.languages[this.languages.length - 1]?.id || 0;
      this.languages.push({
        id: highestId + 1,
        name: languageName,
        stackoverflowTag: stackoverflowTag,
      });
    }
  }

  /**
   * Populate all scores in the data file
   * @param numScores - Number of scores to populate (used for testing)
   */
  public async populateAllScores(numScores?: number) {
    this.scores = (await DataPopulator.readDataFile(
      this.scoresFile
    )) as Score[];

    const oldScoreCount = this.scores.length;
    // Make a copy of the date so we don't overwrite it
    let currentDate = new Date(this.oldestDate);
    // Useful for debugging; only populate scores for the most recent month
    // currentDate = this.firstDayOfMonth;

    // Populate all scores starting with the current date and working backwards one month at a time
    try {
      while (true) {
        if (currentDate > this.firstDayOfMonth) {
          break;
        }

        if (numScores && this.scores.length - oldScoreCount >= numScores) {
          break;
        }

        await this.populateScoresForDate(currentDate, numScores);
        currentDate = addMonthsUTC(currentDate, 1);
      }
      // Log the populated score count even if there are errors
    } finally {
      console.info(
        `Successfully populated ${this.scores.length - oldScoreCount} scores`
      );
    }

    this.sortScores();

    await writeFile(this.scoresFile, JSON.stringify(this.scores, null, 2));
  }

  private async populateScoresForDate(date: Date, numScores?: number) {
    console.debug(
      `Debug: Populating scores for ${convertDateToDateString(date)}`
    );

    for (let i = 0; i < this.languages.length; i++) {
      if (numScores && i >= numScores) {
        break;
      }

      // When GitHub renames a language, the old name will be in the data file and will end up getting sent to the
      // GitHub API. Unfortunately, instead of returning a score of 0 the language filter won't match and it will
      // return the total score (repository count) for all languages. So we need to prevent this from happening by
      // skipping these scores from getting stored in the data file. When this does happen, renaming the language in
      // languages.json should correct the problem. Optionally the language can be first renamed in the data file to
      // prevent the old data from having to be re-fetched.
      if (
        this.languagesFromGithub &&
        !this.languagesFromGithub.includes(this.languages[i].name)
      ) {
        // Only log this for the first date to prevent from spamming the logs
        if (date.toISOString() === this.firstDayOfMonth.toISOString()) {
          console.warn(
            `Warning: Language in data file not found in GitHub: ${this.languages[i].name}`
          );
        }
      } else {
        await this.populateScore(date, this.languages[i]);
      }
    }
  }

  private async populateScore(date: Date, language: Language) {
    const score = this.getScoreFromData(date, language);

    if (!score) {
      // First, we calculate the new score by getting the score difference for the latest
      // month and adding it to the previous month's score. This is because the GitHub
      // API no longer returns accurate results for the total score once the number of
      // repositories goes above a certain limit (about a million?). See
      // https://github.com/bmaupin/langtrends-data/issues/18 for more information
      const lastMonthPoints =
        this.getScoreFromData(subtractMonthsUTC(date, 1), language)?.points ||
        0;
      const newPoints = await this.getPointsFromApi(
        language,
        subtractMonthsUTC(date, 1),
        date
      );
      let points = lastMonthPoints + newPoints;

      // If the new points is below a certain threshold, disregard last month's score and
      // get the new score directly from the API. This is to account for languages whose
      // score is actually going down, which the above methodology won't account for.
      //
      // The threshold was set based on real data from 5 languages whose points decreased.
      // It could need some tweaking if the below error checking logic keeps getting
      // triggered, but for now this logic as well as the error checking logic seem to
      // give the results we want.
      if (newPoints < 100) {
        points = await this.getPointsFromApi(language, this.oldestDate, date);
      }

      // TODO: this logic will likely need to be tweaked. See https://github.com/bmaupin/langtrends-data/issues/17 for more information
      // Throw an error if a language's points have decreased more than a certain amount (https://github.com/bmaupin/langtrends/issues/33)
      // This might need some tweaking; values of over 100 in a month have definitely been seen
      if (
        // Check if deviation itself is greater than the minimum score
        lastMonthPoints - points > settings.minimumScore &&
        // Check if deviation is greater than a 1% decrease in points
        (lastMonthPoints - points) / lastMonthPoints > 0.01
      ) {
        throw new Error(
          `Points for language ${language.name} decreased a lot; this month: ${points}, last month: ${lastMonthPoints}`
        );
      }

      // TODO: Should we also try to catch abnormal increases in score? This has happened at least on one occasion and the data had to be re-calculated as a result

      await this.upsertScore(date, language, points);
    }
  }

  private getScoreFromData(date: Date, language: Language): Score | undefined {
    return this.scores.find(
      (score) =>
        score.date === convertDateToDateString(date) &&
        score.languageId === language.id
    );
  }

  private async getPointsFromApi(
    language: Language,
    fromDate: Date,
    toDate: Date
  ): Promise<number> {
    const githubScore = await this.github.getScore(
      language.name,
      fromDate,
      toDate
    );
    const stackoverflowScore = await this.stackoverflow.getScore(
      language.stackoverflowTag || language.name,
      fromDate,
      toDate
    );

    return githubScore + stackoverflowScore;
  }

  /**
   * Add score if it doesn't exist, otherwise update points
   * @param date - Score date
   * @param language - Score language
   * @param points - Score points
   */
  private async upsertScore(date: Date, language: Language, points: number) {
    const score = this.getScoreFromData(date, language);

    if (score) {
      score.points = points;
    } else {
      this.scores.push({
        date: convertDateToDateString(date),
        languageId: language.id,
        points: points,
      });
    }
  }

  /**
   * Sort this.scores in place descending by date and then by language ID. This should
   * make it easier to track changes with Git in the full scores file (e.g. if the Stack
   * Overflow tag changes for a language and we have to remove the scores and recalculate
   * them).
   */
  private sortScores() {
    this.scores.sort((a, b) => {
      if (a.date === b.date) {
        return a.languageId - b.languageId;
      }
      return a.date > b.date ? 1 : -1;
    });
  }

  /**
   * Populate a condensed list of scores designed to be consumed by the frontend
   */
  public async populateCondensedScores() {
    // Get settings from the frontend
    const response = await fetch(
      'https://raw.githubusercontent.com/bmaupin/langtrends/main/src/settings.json'
    );
    const uiSettings = await response.json();

    const condensedScores = [];
    const condensedScoresDates = await this.generateCondensedScoresDates(
      uiSettings.numberOfDates
    );

    for (const score of this.scores) {
      if (
        condensedScoresDates.includes(score.date) &&
        // Filter out scores under the minimum score set in the frontend
        score.points > settings.minimumScore
      ) {
        condensedScores.push(score);
      }
    }

    // Always overwrite the condensed scores file to clean out old dates
    await writeFile(this.condensedScoresFile, JSON.stringify(condensedScores));
  }

  /**
   * Generate list of dates of scores to include in condensed scores
   * @param numberOfDates - Number of dates to get
   * @returns - List of dates
   */
  private async generateCondensedScoresDates(
    numberOfDates: number
  ): Promise<string[]> {
    const condensedScoresDates = [] as string[];
    const intervalsInMonths = [1, 3, 12];
    for (const intervalInMonths of intervalsInMonths) {
      // Make a copy of this.firstDayOfMonth so we don't overwrite it
      let currentDate = new Date(this.firstDayOfMonth);

      // We need to get the number of dates shown in the chart plus one extra, since a given date's
      // data is based on the difference between it and the previous date's data
      for (let i = 0; i < numberOfDates + 1; i++) {
        // Don't add duplicate months
        if (
          !condensedScoresDates.includes(convertDateToDateString(currentDate))
        ) {
          condensedScoresDates.push(convertDateToDateString(currentDate));
        }
        currentDate = subtractMonthsUTC(currentDate, intervalInMonths);
      }
    }

    return condensedScoresDates;
  }

  // TODO: jsdoc
  public async validateLanguages() {
    const validationErrors = [
      await this.checkForLanguagesInGitHubNotInMetadata(),
      await this.checkForLanguagesInMetadataNotInGitHub(),
    ];

    const filteredErrors = validationErrors.filter(
      (validationError) => validationError !== undefined
    );

    if (filteredErrors.length > 0) {
      throw new Error(
        `Language validation failed:\n\n${filteredErrors.join('\n\n')}`
      );
    }
  }

  private async checkForLanguagesInGitHubNotInMetadata(): Promise<
    string | undefined
  > {
    const languagesInGitHubNotInMetadata = [];

    if (!this.languagesFromGithub) {
      this.languagesFromGithub = await GitHub.getLanguageNames();
    }

    for (const languageName of this.languagesFromGithub) {
      if (!languagesMetadata[languageName]) {
        const score = await this.getPointsFromApi(
          { name: languageName } as Language,
          this.oldestDate,
          this.firstDayOfMonth
        );
        // Don't even bother worrying about a language until it starts approaching the minimum score
        if (score > settings.minimumScore * 0.75) {
          languagesInGitHubNotInMetadata.push(languageName);
        }
      }
    }
    if (languagesInGitHubNotInMetadata.length !== 0) {
      return `Languages from GitHub not found in metadata: ${languagesInGitHubNotInMetadata.join(
        ', '
      )}`;
    }
  }

  private async checkForLanguagesInMetadataNotInGitHub(): Promise<
    string | undefined
  > {
    const languagesInMetadataNotInGitHub = [];

    for (const languageName in languagesMetadata) {
      if (
        this.languagesFromGithub &&
        !this.languagesFromGithub.includes(languageName)
      ) {
        languagesInMetadataNotInGitHub.push(languageName);
      }
    }
    if (languagesInMetadataNotInGitHub.length !== 0) {
      return `Languages in metadata not found in GitHub: ${languagesInMetadataNotInGitHub.join(
        ', '
      )}`;
    }
  }

  /**
   * @deprecated
   */
  /* istanbul ignore next */
  private async _checkForMissingStackOverflowTags(): Promise<
    string | undefined
  > {
    const languagesWithMissingTags = [];

    if (this.languages.length === 0) {
      this.languages = (await DataPopulator.readDataFile(
        this.languagesFile
      )) as Language[];
    }

    for (const language of this.languages) {
      const githubScore = await this.github.getScore(
        language.name,
        this.oldestDate,
        this.firstDayOfMonth
      );
      const stackoverflowScore = await this.stackoverflow.getScore(
        language.stackoverflowTag || language.name,
        this.oldestDate,
        this.firstDayOfMonth
      );
      // Only concern ourselves with languages approaching the minimum score
      if (
        githubScore > settings.minimumScore * 0.75 &&
        stackoverflowScore === 0
      ) {
        languagesWithMissingTags.push(language.name);
      }
    }

    if (languagesWithMissingTags.length !== 0) {
      return `Stack Overflow tags not found for: ${languagesWithMissingTags.join(
        ', '
      )}`;
    }
  }
}
