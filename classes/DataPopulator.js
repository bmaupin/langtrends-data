'use strict';

const Github = require('./Github');
const languages = require('./languages.json');
const settings = require('./settings.json');
const Stackoverflow = require('./Stackoverflow');

module.exports = class DataPopulator {
  constructor(app) {
    this._app = app;
    this._firstDayOfMonth = DataPopulator._getFirstDayOfMonthUTC();
    this._github = new Github();
    this._stackoverflow = new Stackoverflow();

    if (process.env.hasOwnProperty('GITHUB_API_KEY')) {
      this._github.apiKey = process.env.GITHUB_API_KEY;
    }
    if (process.env.hasOwnProperty('STACKOVERFLOW_API_KEY')) {
      this._stackoverflow.apiKey = process.env.STACKOVERFLOW_API_KEY;
    }
  }

  async populateAllLanguages() {
    let languagesFromGithub = await Github.getLanguageNames();

    for (let i = 0; i < languagesFromGithub.length; i++) {
      let languageName = languagesFromGithub[i];

      if (languages.hasOwnProperty(languageName)) {
        if (languages[languageName].include === true) {
          await this._addLanguage(languageName, languages[languageName].stackoverflowTag);
        }
      } else {
        console.log(`DEBUG: Language from Github not found in languages.json: ${languageName}`);
      }
    }
  }

  _addLanguage(languageName, stackoverflowTag) {
    return new Promise((resolve, reject) => {
      // Do an upsert in case stackoverflowTag changes
      this._app.models.Language.upsertWithWhere(
        {name: languageName},
        {
          name: languageName,
          stackoverflowTag: stackoverflowTag,
        },
        // Oddly enough this only works if the validations are ignored
        // https://github.com/strongloop/loopback-component-passport/issues/123#issue-131073519
        {validate: false},
        (err, language) => {
          if (err) reject(err);
          resolve();
        }
      );
    });
  }

  async populateAllScores() {
    // The oldest date with data is 2007-11-01 but no languages have a score > 1 before 2008-02-01
    const OLDEST_DATE = new Date(Date.UTC(2008, 1)); // 2008-02-01 00:00:00 UTC
    const OLD_SCORE_COUNT = await this._getScoreCount();
    let currentDate = new Date(this._firstDayOfMonth);

    while (true) {
      if (currentDate < OLDEST_DATE) {
        break;
      }

      await this._populateAllScores(currentDate);
      currentDate = DataPopulator._subtractOneMonthUTC(currentDate);
    }

    const POPULATED_SCORE_COUNT = await this._getScoreCount() - OLD_SCORE_COUNT;
    if (POPULATED_SCORE_COUNT !== 0) {
      console.log(`INFO: Successfully populated ${POPULATED_SCORE_COUNT} scores`);
    }
  }

  static _getFirstDayOfMonthUTC() {
    return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth()));
  }

  static _subtractOneMonthUTC(date) {
    let newDate = new Date(date);
    newDate.setUTCMonth(newDate.getUTCMonth() - 1);
    return newDate;
  }

  async _populateAllScores(date) {
    let languages = await this._getAllLanguages();

    // Do this in batches to avoid going over API limits
    while (languages.length !== 0) {
      await this._populateScores(date, languages.splice(0, settings.MAX_CONCURRENT_REQUESTS));
    }
  }

  _getAllLanguages() {
    return new Promise((resolve, reject) => {
      this._app.models.Language.all((err, languages) => {
        if (err) throw err;

        if (languages === null) {
          reject('Languages must be populated before scores can be populated');
        }

        resolve(languages);
      });
    });
  }

  _populateScores(date, languages) {
    return new Promise((resolve, reject) => {
      let promises = [];

      for (let i = 0; i < languages.length; i++) {
        promises.push(this._populateScore(date, languages[i]));
      }

      Promise.all(promises).then(
        values => { resolve(); },
        reason => { reject(reason); }
      );
    });
  }

  async _populateScore(date, language) {
    let score = await this._getScoreFromDb(date, language);

    if (score === null) {
      let points = await this._getScoreFromApi(date, language);
      await this._addScore(date, language, points);
    }
  }

  _getScoreFromDb(date, language) {
    return new Promise((resolve, reject) => {
      this._app.models.Score.findOne(
        {
          where: {
            date: date,
            languageId: language.id,
          },
        },
        (err, score) => {
          if (err) reject(err);
          resolve(score);
        }
      );
    });
  }

  async _getScoreFromApi(date, language) {
    let githubScore = await this._github.getScore(language.name, date);
    let stackoverflowTag = this._getStackoverflowTag(language);
    let stackoverflowScore = await this._stackoverflow.getScore(stackoverflowTag, date);
    // Only log these for the first date, because for older dates it may just be that the tag count is actually 0
    if (date === this._firstDayOfMonth && stackoverflowScore === 0) {
      console.log(`WARNING: stackoverflow tag not found for ${language.name}`);
    }

    return githubScore + stackoverflowScore;
  }

  _getStackoverflowTag(language) {
    // This will be undefined for the memory connectory, null for PostgreSQL. Go figure
    if (typeof language.stackoverflowTag === 'undefined' || language.stackoverflowTag === null) {
      return language.name;
    } else {
      return language.stackoverflowTag;
    }
  }

  _addScore(date, language, points) {
    return new Promise((resolve, reject) => {
      // Do an upsert because we don't want duplicate scores per date/language
      this._app.models.Score.upsertWithWhere(
        {
          date: date,
          languageId: language.id,
        },
        {
          date: date,
          language: language,
          points: points,
        },
        (err, score) => {
          if (err) reject(err);
          resolve();
        }
      );
    });
  }

  _getScoreCount() {
    return new Promise((resolve, reject) => {
      this._app.models.Score.count(
        (err, count) => {
          if (err) reject(err);
          resolve(count);
        }
      );
    });
  }
};
