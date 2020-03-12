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

  async populateUsers() {
    let user = await this._getUser(settings.LOOPBACK_API_USER_EMAIL);
    if (user === null && process.env.hasOwnProperty('LOOPBACK_API_PASSWORD')) {
      user = await this._createUser(
        settings.LOOPBACK_API_USER_EMAIL,
        process.env.LOOPBACK_API_PASSWORD
      );
    }

    let accessToken = await this._getAccessToken(user.id);
    if (
      accessToken === null &&
      process.env.hasOwnProperty('LOOPBACK_API_PASSWORD')
    ) {
      accessToken = await this._logInUser(
        settings.LOOPBACK_API_USER_EMAIL,
        process.env.LOOPBACK_API_PASSWORD
      );
      console.log(`INFO: User access token is ${accessToken.id}`);
    }
  }

  async _getUser(email) {
    return await this._app.models.User.findOne({
      where: {
        email: email,
      },
    });
  }

  async _createUser(email, password) {
    return await this._app.models.User.create({
      email: email,
      password: password,
    });
  }

  async _getAccessToken(userId) {
    return await this._app.models.AccessToken.findOne({
      where: {
        userId: userId,
      },
    });
  }

  async _logInUser(email, password) {
    return await this._app.models.User.login({
      email: email,
      password: password,
      ttl: -1,
    });
  }

  async populateLanguages() {
    // Store languagesFromGithub in a class field because we'll need it later when populating scores
    this._languagesFromGithub = await Github.getLanguageNames();

    for (let i = 0; i < this._languagesFromGithub.length; i++) {
      let languageName = this._languagesFromGithub[i];

      if (languages.hasOwnProperty(languageName)) {
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

  async _addLanguage(languageName, stackoverflowTag) {
    // Do an upsert in case stackoverflowTag changes
    return await this._app.models.Language.upsertWithWhere(
      { name: languageName },
      {
        name: languageName,
        stackoverflowTag: stackoverflowTag,
      },
      // Oddly enough this only works if the validations are ignored
      // https://github.com/strongloop/loopback-component-passport/issues/123#issue-131073519
      { validate: false }
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
        `INFO: Successfully populated ${(await this._getScoreCount()) -
          OLD_SCORE_COUNT} scores`
      );
    }
  }

  static _getFirstDayOfMonthUTC() {
    return new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth())
    );
  }

  static _subtractOneMonthUTC(date) {
    let newDate = new Date(date);
    newDate.setUTCMonth(newDate.getUTCMonth() - 1);
    return newDate;
  }

  async _populateAllScores(date) {
    let languages = await this._app.models.Language.all();

    if (languages === null) {
      throw new Error(
        'Languages must be populated before scores can be populated'
      );
    }

    // Use a transaction when populating the scores for a particular date; if the scores are only partially populated
    // for a given date, then the UI will not only be innacurate but it will cache the innaccurate data for up to a
    // month
    await this._app.dataSources.db.transaction(async models => {
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

  async _populateScores(date, languages, models) {
    let promises = [];

    for (let i = 0; i < languages.length; i++) {
      // When GitHub renames a language, the old name will be in the database and will end up getting sent to the
      // GitHub API. Unfortunately, instead of returning a score of 0 the language filter won't match and it will
      // return the total score (repository count) for all languages. So we need to prevent this from happening by
      // skipping these scores from getting stored in the database. When this does happen, renaming the language in
      // languages.json should correct the problem. Optionally the language can be first renamed in the database to
      // prevent the old data from having to be re-fetched.
      if (!this._languagesFromGithub.includes(languages[i].name)) {
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

  async _populateScore(date, language, models) {
    let score = await this._getScoreFromDb(date, language);

    if (score === null) {
      let points = await this._getScoreFromApi(date, language);
      await this._addScore(date, language, points, models);
    }
  }

  async _getScoreFromDb(date, language) {
    return await this._app.models.Score.findOne({
      where: {
        date: date,
        languageId: language.id,
      },
    });
  }

  async _getScoreFromApi(date, language) {
    let githubScore = await this._github.getScore(language.name, date);
    let stackoverflowTag = this._getStackoverflowTag(language);
    let stackoverflowScore = await this._stackoverflow.getScore(
      stackoverflowTag,
      date
    );
    // Only log these for the first date, because for older dates it may just be that the tag count is actually 0
    if (date === this._firstDayOfMonth && stackoverflowScore === 0) {
      console.log(`WARNING: stackoverflow tag not found for ${language.name}`);
    }

    return githubScore + stackoverflowScore;
  }

  _getStackoverflowTag(language) {
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

  async _addScore(date, language, points, models) {
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

  async _getScoreCount() {
    return await this._app.models.Score.count();
  }
};
