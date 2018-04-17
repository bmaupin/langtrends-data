'use strict';

const Github = require('./Github');
const languages = require('./languages.json');
const Stackoverflow = require('./Stackoverflow');

module.exports = class DataPopulator {
  constructor(app) {
    this._app = app;
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

  async populateTopScores() {
    const OLDEST_DATE = new Date(Date.UTC(2007, 9)); // 2007-10-01 00:00:00 UTC
    const NUM_LANGUAGES = 10;
    let currentDate = DataPopulator._getFirstDayOfMonthUTC();
    const ONE_YEAR_AGO = DataPopulator._subtractOneYearUTC(currentDate);

    let topLanguages = await this._getTopLanguages(NUM_LANGUAGES, currentDate);

    // TODO
    console.log(topLanguages);

    while (true) {
      currentDate = DataPopulator._subtractOneMonthUTC(currentDate);

      // TODO
      console.log(currentDate);

      if (currentDate <= OLDEST_DATE) {
        break;
      } else if (currentDate <= ONE_YEAR_AGO) {
        // TODO
        break;
      }

      await this._populateScores(currentDate, topLanguages);
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

  static _subtractOneYearUTC(date) {
    let newDate = new Date(date);
    newDate.setUTCFullYear(newDate.getUTCFullYear() - 1);
    return newDate;
  }

  async _getTopLanguages(numberOfLanguages, date) {
    await this._populateAllScores(date);

    return await this._getTopLanguagesFromDb(numberOfLanguages, date);
  }

  _getLanguageByName(languageName) {
    return new Promise((resolve, reject) => {
      this._app.models.Language.findOne({where: {name: languageName}}, (err, language) => {
        if (err) throw err;

        if (language !== null) {
          resolve(language);
        } else {
          reject(`Language ${languageName} not found`);
        }
      });
    });
  }

  _getAllLanguages() {
    return new Promise((resolve, reject) => {
      this._app.models.Language.all((err, languages) => {
        if (err) throw err;

        if (languages === null) {
          reject('Languages must be populated before scores can be populated');
        }

        resolve(languages.map(language => language.name));
      });
    });
  }

  _getTopLanguagesFromDb(numberOfLanguages, date) {
    return new Promise((resolve, reject) => {
      this._app.models.Score.find(
        {
          fields: {languageId: true},
          include: 'language',
          limit: numberOfLanguages,
          order: 'points DESC',
          where: {date: date},
        },
        (err, scores) => {
          if (err) throw err;

          if (scores === null) {
            reject(`No scores found for date: ${date}`);
          }

          // Apparently score.language is a function
          resolve(scores.map(score => score.language().name));
        }
      );
    });
  }

  async _populateAllScores(date) {
    let languages = await this._getAllLanguages();

    // Do this in batches to avoid going over the Stackoverflow API limits
    while (languages.length !== 0) {
      await this._populateScores(date, languages.splice(0, Stackoverflow.MAX_REQUESTS_PER_SECOND));
    }
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

  async _populateScore(date, languageName) {
    let language = await this._getLanguageByName(languageName);
    let score = await this._getScoreFromDb(date, language);

    if (score === null) {
      let points = await this._getScoreFromApi(date, languageName);
      await this._addScore(date, languageName, points);
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

  async _getScoreFromApi(date, languageName) {
    let githubScore = await this._github.getScore(languageName, date);
    let stackoverflowTag = await this._getStackoverflowTag(languageName);
    let stackoverflowScore = await this._stackoverflow.getScore(stackoverflowTag, date);
    if (stackoverflowScore === 0) {
      console.log(`WARNING: stackoverflow tag not found for ${languageName}`);
    }

    return githubScore + stackoverflowScore;
  }

  async _getStackoverflowTag(languageName) {
    let language = await this._getLanguageByName(languageName);

    // This will be undefined for the memory connectory, null for PostgreSQL. Go figure
    if (typeof language.stackoverflowTag === 'undefined' || language.stackoverflowTag === null) {
      return languageName;
    } else {
      return language.stackoverflowTag;
    }
  }

  _addScore(date, languageName, points) {
    return new Promise(async (resolve, reject) => {
      let language = await this._getLanguageByName(languageName);

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
};
