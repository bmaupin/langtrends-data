'use strict';

import { Database } from 'sqlite';
import GitHub from './GitHub';
import languagesUntyped from './languages.json';
import settings from './settings.json';
import StackOverflow from './StackOverflow';

interface Language {
  [key: string]: {
    description?: string;
    extension?: string;
    include: Boolean;
    stackoverflowTag?: string;
    url?: string;
  };
}

const languages = languagesUntyped as Language;

export default class DataPopulator {
  // TODO: remove _app
  _app: any;
  _db: Database;
  _firstDayOfMonth: Date;
  _github: GitHub;
  _languagesFromGithub?: (string | null)[];
  _stackoverflow: StackOverflow;

  constructor(db: Database) {
    this._db = db;
    this._firstDayOfMonth = DataPopulator._getFirstDayOfMonthUTC();
    this._github = new GitHub();
    this._stackoverflow = new StackOverflow();

    if (process.env.GITHUB_API_KEY) {
      this._github.apiKey = process.env.GITHUB_API_KEY;
    }
    if (process.env.STACKOVERFLOW_API_KEY) {
      this._stackoverflow.apiKey = process.env.STACKOVERFLOW_API_KEY;
    }
  }

  async populateLanguages() {
    // Store languagesFromGithub in a class field because we'll need it later when populating scores
    this._languagesFromGithub = await GitHub.getLanguageNames();

    for (let i = 0; i < this._languagesFromGithub.length; i++) {
      let languageName = this._languagesFromGithub[i];

      if (languageName && languages[languageName]) {
        if (languages[languageName].include === true) {
          await this._addLanguage(
            languageName,
            languages[languageName].stackoverflowTag
          );
        }
      } else {
        console.log(
          `DEBUG: Language from Github not found in languages.json: ${languageName}`
        );
      }
    }
  }

  async _addLanguage(languageName: string, stackoverflowTag?: string) {
    // Do an upsert in case stackoverflowTag changes
    await this._db.run(
      `INSERT INTO language(name, stackoverflowTag) VALUES($name, $stackoverflowTag)
         ON CONFLICT(name) DO UPDATE SET stackoverflowTag = $stackoverflowTag;`,
      {
        $name: languageName,
        $stackoverflowTag: stackoverflowTag,
      }
    );
  }

  async populateScores() {
    // The oldest date with data is 2007-11-01 but no languages have a score > 1 before 2008-02-01
    const OLDEST_DATE = new Date(Date.UTC(2008, 1)); // 2008-02-01 00:00:00 UTC
    const OLD_SCORE_COUNT = await this._getScoreCount();
    let currentDate = new Date(this._firstDayOfMonth);

    try {
      while (true) {
        if (currentDate < OLDEST_DATE) {
          break;
        }

        await this._populateAllScores(currentDate);
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

  static _subtractOneMonthUTC(date: Date) {
    let newDate = new Date(date);
    newDate.setUTCMonth(newDate.getUTCMonth() - 1);
    return newDate;
  }

  async _populateAllScores(date: Date) {
    let languages = await this._app.models.Language.all();

    if (languages === null) {
      throw new Error(
        'Languages must be populated before scores can be populated'
      );
    }

    // Use a transaction when populating the scores for a particular date; if the scores are only partially populated
    // for a given date, then the UI will not only be innacurate but it will cache the innaccurate data for up to a
    // month
    await this._app.dataSources.db.transaction(async (models: any) => {
      // Do this in batches to avoid going over API limits
      while (languages.length !== 0) {
        await this._populateScores(
          date,
          languages.splice(0, settings.MAX_CONCURRENT_REQUESTS),
          models
        );
      }
    });
  }

  async _populateScores(date: Date, languages: any, models: any) {
    let promises = [];

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
        promises.push(this._populateScore(date, languages[i], models));
      }
    }

    await Promise.all(promises);
  }

  async _populateScore(date: Date, language: any, models: any) {
    let score = await this._getScoreFromDb(date, language);

    if (score === null) {
      let points = await this._getScoreFromApi(date, language);
      await this._addScore(date, language, points, models);
    }
  }

  async _getScoreFromDb(date: Date, language: any) {
    return await this._app.models.Score.findOne({
      where: {
        date: date,
        languageId: language.id,
      },
    });
  }

  async _getScoreFromApi(date: Date, language: any): Promise<number> {
    let githubScore = await this._github.getScore(language.name, date);
    let stackoverflowTag = this._getStackoverflowTag(language);
    let stackoverflowScore = await this._stackoverflow.getScore(
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

  _getStackoverflowTag(language: any): string {
    // This will be undefined for the memory connectory, null for PostgreSQL. Go figure
    if (
      typeof language.stackoverflowTag === 'undefined' ||
      language.stackoverflowTag === null
    ) {
      return language.name;
    } else {
      return language.stackoverflowTag;
    }
  }

  async _addScore(date: Date, language: any, points: number, models: any) {
    // Do an upsert because we don't want duplicate scores per date/language
    await models.Score.upsertWithWhere(
      {
        date: date,
        languageId: language.id,
      },
      {
        date: date,
        language: language,
        points: points,
      }
    );
  }

  async _getScoreCount(): Promise<number> {
    return await this._app.models.Score.count();
  }
}
