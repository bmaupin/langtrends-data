'use strict';

const https = require('https');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const { URL } = require('url');

const settings = require('./settings.json');

const API_URL = 'https://api.github.com/graphql';

module.exports = class Github {
  set apiKey(newApiKey) {
    this._apiKey = newApiKey;
  }

  static async getLanguageNames() {
    const GITHUB_LANGUAGES_URL = 'https://github.com/search/advanced';

    let dom = await JSDOM.fromURL(GITHUB_LANGUAGES_URL);
    let languageNames = [];

    let select = dom.window.document.getElementById('search_language');
    let optgroups = select.getElementsByTagName('optgroup');

    for (let i = 0; i < optgroups.length; i++) {
      let options = optgroups[i].getElementsByTagName('option');
      for (let j = 0; j < options.length; j++) {
        languageNames.push(options[j].textContent);
      }
    }

    return languageNames;
  }

  async getScore(languageName, date) {
    // API key can't be null for the GraphQL API (https://platform.github.community/t/anonymous-access/2093)
    if (typeof this._apiKey === 'undefined') {
      throw new Error('Github API key cannot be null');
    }

    let postData = this._buildPostData(date, languageName);
    let body = await this._callApi(API_URL, postData);

    Github._handleApiLimits(body);

    return body.data.search.repositoryCount;
  }

  _buildPostData(date, languageName) {
    let postData =
      `{"query": "{ search(query: \\"language:${Github._encodeLanguageName(
        languageName
      )} ` +
      `created:<${Github._encodeDate(
        date
      )}\\", type: REPOSITORY) { repositoryCount } rateLimit { remaining }}"}`;

    return postData;
  }

  static _encodeLanguageName(languageName) {
    // Github API requires spaces in language names to be replaced with dashes
    return languageName.replace(/ /g, '-');
  }

  static _encodeDate(date) {
    // Github API requires the date to be formatted as yyyy-MM-dd
    return date.toISOString().slice(0, 10);
  }

  async _callApi(url, postData) {
    const optionsUrl = new URL(url);
    const options = {
      headers: {
        Authorization: `bearer ${this._apiKey}`,
        // For whatever reason, user agent is required by the Github API
        'User-Agent': 'node.js',
      },
      hostname: optionsUrl.hostname,
      method: 'POST',
      path: optionsUrl.pathname,
    };

    let bodyJson = await this._httpsRequest(options, postData);
    return JSON.parse(bodyJson);
  }

  // Based on https://stackoverflow.com/a/38543075/399105
  _httpsRequest(options, postData) {
    return new Promise((resolve, reject) => {
      let request = https.request(options, async (response) => {
        // https://developer.github.com/v3/guides/best-practices-for-integrators/#dealing-with-abuse-rate-limits
        if (
          response.statusCode === 403 &&
          response.headers.hasOwnProperty('retry-after')
        ) {
          resolve(
            await this._retryOnError(
              response.statusCode,
              Number(response.headers['retry-after']),
              options,
              postData
            )
          );
        } else if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error('statusCode=' + response.statusCode));
        }

        let body = [];
        response.on('data', function (chunk) {
          body.push(chunk);
        });

        response.on('end', function () {
          resolve(Buffer.concat(body).toString());
        });
      });

      request.on('error', function (err) {
        // Use the original message and code but our stack trace since the original stack trace won't point back to here
        reject(new Error(`${err.message} (${err.code})`));
      });

      if (postData) {
        request.write(postData);
      }
      request.end();
    });
  }

  async _retryOnError(errorCode, secondsToWait, options, postData) {
    console.log(
      `WARNING: ${options.hostname} returned error code ${errorCode}; retrying in ${secondsToWait} seconds`
    );
    await Github._waitSeconds(secondsToWait);
    return await this._httpsRequest(options, postData);
  }

  // Based on https://stackoverflow.com/a/39027151/399105
  static _waitSeconds(numSeconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, numSeconds * 1000);
    });
  }

  static _handleApiLimits(body) {
    if (!body.data && body.hasOwnProperty('errors')) {
      throw new Error(`Github API error (${body.errors[0].message})`);
    }

    if (body.data.rateLimit.remaining <= settings.MAX_CONCURRENT_REQUESTS) {
      console.log(
        `WARNING: Github API hourly quota remaining: ${body.data.rateLimit.remaining}`
      );
    } else if (body.data.rateLimit.remaining <= 0) {
      throw new Error('Github API hourly limit exceeded');
    }
  }
};
