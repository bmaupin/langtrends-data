'use strict';

import { readFile, writeFile } from 'fs/promises';
import { Database } from 'sqlite';

import GitHub from './GitHub';
import _languagesMetadata from '../data/languages-metadata.json';
import settings from './settings.json';
import StackOverflow from './StackOverflow';

require('dotenv').config();

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

interface Score {
  date: number;
  id: number;
  languageid: number;
  points: number;
}

const languagesMetadata = _languagesMetadata as LanguagesMetadata;

// Convert date into format we can store in the database
const convertDateToInteger = (date: Date): number => {
  return Number(date) / 1000;
};

export default class DataPopulator {
  // TODO: replace all these underscores with "private"
  _db: Database;
  _firstDayOfMonth: Date;
  _github: GitHub;
  private languages: Language[];
  private languagesFile: string;
  _languagesFromGithub?: (string | null)[];
  _stackoverflow: StackOverflow;

  constructor(db: Database, languagesFile: string) {
    this._db = db;
    this._firstDayOfMonth = DataPopulator._getFirstDayOfMonthUTC();
    this._github = new GitHub();
    this.languages = [];
    this.languagesFile = languagesFile;
    this._stackoverflow = new StackOverflow();

    if (process.env.GITHUB_API_KEY) {
      this._github.apiKey = process.env.GITHUB_API_KEY;
    }
    if (process.env.STACKOVERFLOW_API_KEY) {
      this._stackoverflow.apiKey = process.env.STACKOVERFLOW_API_KEY;
    }
  }

  /**
   * Populate languages in the data file
   */
  public async populateLanguages() {
    this.languages = await this.readDataFile(this.languagesFile);

    // Store languagesFromGithub in a class field because we'll need it later when populating scores
    this._languagesFromGithub = await GitHub.getLanguageNames();

    for (let i = 0; i < this._languagesFromGithub.length; i++) {
      const languageName = this._languagesFromGithub[i];

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

    await writeFile(this.languagesFile, JSON.stringify(this.languages));
  }

  /**
   * Read the data file and return its contents
   * @param pathToFile - Path to the data file
   * @returns - Contents of the file or an empty array if the file doesn't exist
   */
  private async readDataFile(pathToFile: string): Promise<[]> {
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
   * Populate scores in the database
   * @param numScores Number of scores to populate (used for testing)
   */
  async populateScores(numScores?: number) {
    // The oldest date with data is 2007-11-01 but no languages have a score > 1 before 2008-02-01
    const OLDEST_DATE = new Date(Date.UTC(2008, 1)); // 2008-02-01 00:00:00 UTC
    const OLD_SCORE_COUNT = await this._getScoreCount();
    let currentDate = new Date(this._firstDayOfMonth);

    // Populate all scores starting with the current date and working backwards one month at a time
    try {
      while (true) {
        if (currentDate < OLDEST_DATE) {
          break;
        }

        if (
          numScores &&
          (await this._getScoreCount()) - OLD_SCORE_COUNT >= numScores
        ) {
          break;
        }

        await this._populateAllScores(currentDate, numScores);
        currentDate = DataPopulator._subtractOneMonthUTC(currentDate);
      }
      // Log the populated score count even if there are errors
    } finally {
      console.log(
        `INFO: Successfully populated ${
          (await this._getScoreCount()) - OLD_SCORE_COUNT
        } scores`
      );
    }
  }

  static _getFirstDayOfMonthUTC(): Date {
    return new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth())
    );
  }

  static _subtractOneMonthUTC(date: Date): Date {
    const newDate = new Date(date);
    newDate.setUTCMonth(newDate.getUTCMonth() - 1);
    return newDate;
  }

  async _populateAllScores(date: Date, numScores?: number) {
    let languages = await this._getLanguages();

    if (numScores) {
      languages = languages.splice(0, numScores);
    }

    // Do this in batches to avoid going over API limits
    while (languages.length !== 0) {
      await this._populateScores(
        date,
        languages.splice(0, settings.MAX_CONCURRENT_REQUESTS)
      );
    }
  }

  async _getLanguages(): Promise<Language[]> {
    return await this._db.all('SELECT * FROM language');
  }

  async _populateScores(date: Date, languages: Language[]) {
    const promises = [];

    for (let i = 0; i < languages.length; i++) {
      // When GitHub renames a language, the old name will be in the database and will end up getting sent to the
      // GitHub API. Unfortunately, instead of returning a score of 0 the language filter won't match and it will
      // return the total score (repository count) for all languages. So we need to prevent this from happening by
      // skipping these scores from getting stored in the database. When this does happen, renaming the language in
      // languages.json should correct the problem. Optionally the language can be first renamed in the database to
      // prevent the old data from having to be re-fetched.
      if (
        this._languagesFromGithub &&
        !this._languagesFromGithub.includes(languages[i].name)
      ) {
        // Only log this for the first date to prevent from spamming the logs
        if (date.toISOString() === this._firstDayOfMonth.toISOString()) {
          console.log(
            `WARNING: Language in database not found in GitHub: ${languages[i].name}`
          );
        }
      } else {
        promises.push(this._populateScore(date, languages[i]));
      }
    }

    await Promise.all(promises);
  }

  async _populateScore(date: Date, language: Language) {
    const score = await this._getScoreFromDb(date, language);

    if (!score) {
      const points = await this._getScoreFromApi(date, language);
      await this._addScore(date, language, points);
    }
  }

  async _getScoreFromDb(
    date: Date,
    language: Language
  ): Promise<Score | undefined> {
    return await this._db.get(
      `SELECT * FROM score WHERE date = $date AND languageId = $languageId`,
      {
        $date: convertDateToInteger(date),
        $languageId: language.id,
      }
    );
  }

  async _getScoreFromApi(date: Date, language: Language): Promise<number> {
    const githubScore = await this._github.getScore(language.name, date);
    const stackoverflowTag = this._getStackoverflowTag(language);
    const stackoverflowScore = await this._stackoverflow.getScore(
      stackoverflowTag,
      date
    );
    // Only log these for the first date, because for older dates it may just be that the tag count is actually 0
    if (
      date.toISOString() === this._firstDayOfMonth.toISOString() &&
      stackoverflowScore === 0
    ) {
      console.log(`WARNING: stackoverflow tag not found for ${language.name}`);
    }

    return githubScore + stackoverflowScore;
  }

  _getStackoverflowTag(language: Language): string {
    return language.stackoverflowTag || language.name;
  }

  async _addScore(date: Date, language: Language, points: number) {
    // Do an replace because we don't want duplicate scores per date/language
    await this._db.run(
      `
      INSERT OR REPLACE INTO score (id, date, languageid, points)
        VALUES(
          (SELECT id FROM score WHERE date = $date AND languageid = $languageid),
          $date,
          $languageid,
          $points
        );
    `,
      {
        $date: convertDateToInteger(date),
        $languageid: language.id,
        $points: points,
      }
    );
  }

  async _getScoreCount(): Promise<number> {
    const result = await this._db.get('SELECT COUNT() AS count FROM score');

    return result!.count;
  }
}
