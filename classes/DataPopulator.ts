'use strict';

import { readFile, writeFile } from 'fs/promises';
const fetch = require('node-fetch');

import GitHub from './GitHub';
import _languagesMetadata from '../data/languages-metadata.json';
import settings from './settings.json';
import StackOverflow from './StackOverflow';

import 'dotenv/config';

interface LanguagesMetadata {
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

/**
 * Convert data into ISO 8601 formatted date string. This has the advantage of being human readable
 * and should save on storage vs. storing the whole timestamp.
 * @param date - Date
 * @returns - Date string
 */
const convertDateToDateString = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

export default class DataPopulator {
  // TODO: replace all these underscores with "private"
  private firstDayOfMonth: Date;
  private github: GitHub;
  private languages: Language[];
  private languagesFromGithub?: (string | null)[];
  private scores: Score[];
  private stackoverflow: StackOverflow;

  constructor() {
    this.firstDayOfMonth = DataPopulator.getFirstDayOfMonthUTC();
    this.github = new GitHub();
    this.languages = [];
    this.scores = [];
    this.stackoverflow = new StackOverflow();

    if (process.env.GITHUB_API_KEY) {
      this.github.apiKey = process.env.GITHUB_API_KEY;
    }
    if (process.env.STACKOVERFLOW_API_KEY) {
      this.stackoverflow.apiKey = process.env.STACKOVERFLOW_API_KEY;
    }
  }

  /**
   * Populate languages in the data file
   * @param languagesFile - Path to the languages data file
   */
  public async populateLanguages(languagesFile: string) {
    this.languages = await DataPopulator.readDataFile(languagesFile);

    // Store languagesFromGithub in a class field because we'll need it later when populating scores
    this.languagesFromGithub = await GitHub.getLanguageNames();

    for (let i = 0; i < this.languagesFromGithub.length; i++) {
      const languageName = this.languagesFromGithub[i];

      if (languageName && languagesMetadata[languageName]) {
        if (languagesMetadata[languageName].include === true) {
          await this.upsertLanguage(
            languageName,
            languagesMetadata[languageName].stackoverflowTag
          );
        }
      } else {
        console.log(
          `DEBUG: Language from Github not found in languages.json: ${languageName}`
        );
      }
    }

    await writeFile(languagesFile, JSON.stringify(this.languages));
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
   * @param scoresFile - Path to the scores data file
   * @param numScores - Number of scores to populate (used for testing)
   */
  public async populateAllScores(scoresFile: string, numScores?: number) {
    this.scores = await DataPopulator.readDataFile(scoresFile);

    // The oldest date with data is 2007-11-01 but no languages have a score > 1 before 2008-02-01
    const OLDEST_DATE = new Date(Date.UTC(2008, 1)); // 2008-02-01 00:00:00 UTC
    const OLD_SCORE_COUNT = this.scores.length;
    // Make a copy of this.firstDayOfMonth so we don't overwrite it
    let currentDate = new Date(this.firstDayOfMonth);

    // Populate all scores starting with the current date and working backwards one month at a time
    try {
      while (true) {
        if (currentDate < OLDEST_DATE) {
          break;
        }

        if (numScores && this.scores.length - OLD_SCORE_COUNT >= numScores) {
          break;
        }

        await this.populateScoresForDate(currentDate, numScores);
        currentDate = DataPopulator.subtractMonthsUTC(currentDate, 1);
      }
      // Log the populated score count even if there are errors
    } finally {
      console.log(
        `INFO: Successfully populated ${
          this.scores.length - OLD_SCORE_COUNT
        } scores`
      );
    }

    await writeFile(scoresFile, JSON.stringify(this.scores, null, 2));
  }

  private static getFirstDayOfMonthUTC(): Date {
    return new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth())
    );
  }

  // Source: https://github.com/bmaupin/langtrends/blob/master/src/helpers/ApiHelper.js
  private static subtractMonthsUTC(date: Date, monthsToSubtract: number): Date {
    // Make a copy of the date object so we don't overwrite it
    const newDate = new Date(date);
    newDate.setUTCMonth(newDate.getUTCMonth() - monthsToSubtract);
    return newDate;
  }

  private async populateScoresForDate(date: Date, numScores?: number) {
    let languages = this.languages;

    if (numScores) {
      languages = languages.splice(0, numScores);
    }

    // Do this in batches to avoid going over API limits
    while (languages.length !== 0) {
      await this.populateBatchOfScores(
        date,
        languages.splice(0, settings.maxConcurrentRequests)
      );
    }
  }

  private async populateBatchOfScores(date: Date, languages: Language[]) {
    const promises = [];

    for (let i = 0; i < languages.length; i++) {
      // When GitHub renames a language, the old name will be in the data file and will end up getting sent to the
      // GitHub API. Unfortunately, instead of returning a score of 0 the language filter won't match and it will
      // return the total score (repository count) for all languages. So we need to prevent this from happening by
      // skipping these scores from getting stored in the data file. When this does happen, renaming the language in
      // languages.json should correct the problem. Optionally the language can be first renamed in the data file to
      // prevent the old data from having to be re-fetched.
      if (
        this.languagesFromGithub &&
        !this.languagesFromGithub.includes(languages[i].name)
      ) {
        // Only log this for the first date to prevent from spamming the logs
        if (date.toISOString() === this.firstDayOfMonth.toISOString()) {
          console.log(
            `WARNING: Language in data file not found in GitHub: ${languages[i].name}`
          );
        }
      } else {
        promises.push(this.populateScore(date, languages[i]));
      }
    }

    await Promise.all(promises);
  }

  private async populateScore(date: Date, language: Language) {
    const score = this.getScoreFromData(date, language);

    if (!score) {
      const points = await this.getPointsFromApi(date, language);
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
    date: Date,
    language: Language
  ): Promise<number> {
    const githubScore = await this.github.getScore(language.name, date);
    const stackoverflowScore = await this.stackoverflow.getScore(
      language.stackoverflowTag || language.name,
      date
    );
    // Only log these for the first date, because for older dates it may just be that the tag count is actually 0
    if (
      date.toISOString() === this.firstDayOfMonth.toISOString() &&
      stackoverflowScore === 0
    ) {
      console.log(`WARNING: stackoverflow tag not found for ${language.name}`);
    }

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
   * Populate a condensed list of scores designed to be consumed by the frontend
   * @param condensedScoresFile - Path to the condensed scores data file
   */
  public async populateCondensedScores(condensedScoresFile: string) {
    const condensedScores = [];
    const condensedScoresDates = await this.generateCondensedScoresDates();

    for (const score of this.scores) {
      if (condensedScoresDates.includes(score.date)) {
        condensedScores.push(score);
      }
    }

    // Always overwrite the condensed scores file to clean out old dates
    await writeFile(condensedScoresFile, JSON.stringify(condensedScores));
  }

  /**
   * Generate list of dates of scores to include in condensed scores
   * @returns List of dates
   */
  private async generateCondensedScoresDates(): Promise<string[]> {
    // Get the number of the dates from the frontend
    const response = await fetch(
      'https://raw.githubusercontent.com/bmaupin/langtrends/master/src/settings.json'
    );
    const numberOfDates = (await response.json()).numberOfDates;

    const condensedScoresDates = [] as string[];
    const intervalsInMonths = [1, 3, 12];
    for (const intervalInMonths of intervalsInMonths) {
      // Make a copy of this.firstDayOfMonth so we don't overwrite it
      let currentDate = new Date(this.firstDayOfMonth);

      for (let i = 0; i < numberOfDates; i++) {
        // Don't add duplicate months
        if (
          !condensedScoresDates.includes(convertDateToDateString(currentDate))
        ) {
          condensedScoresDates.push(convertDateToDateString(currentDate));
        }
        currentDate = DataPopulator.subtractMonthsUTC(
          currentDate,
          intervalInMonths
        );
      }
    }

    return condensedScoresDates;
  }
}
