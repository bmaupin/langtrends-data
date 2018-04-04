'use strict';

const CodingSite = require('./CodingSite');
const {URL} = require('url');
const util = require('util');

// Uses a custom filter that only returns backoff, quota_remaining, and total
// (https://api.stackexchange.com/docs/create-filter#unsafe=false&filter=!.UE8F0bVg4M-_Ii4&run=true)
const API_URL = 'https://api.stackexchange.com/2.2/search?todate=%s&site=stackoverflow&tagged=%s&filter=!.UE8F0bVg4M-_Ii4';

class Stackoverflow extends CodingSite {
  async getScore(languageName, date) {
    let url = this._buildUrl(date, languageName);
    let body = await this._callApi(url);

    if (body.quota_remaining < 1000) {
      // TODO: find and use a proper logging framework
      console.log(`WARNING: StackOverflow API daily quota remaining: ${body.quota_remaining}`);
    }

    /* TODO: handle API limitations (https://stackapps.com/a/3057/41977)
     *  - Don't make more than 30 requests/second
     *  - Handle backoff field
     */
    if (body.hasOwnProperty('backoff')) {
      throw new Error(`StackOverflow API backoff field not handled: ${body.backoff}`);
    }

    return body.total;
  }

  _buildUrl(date, languageName) {
    let url = util.format(API_URL, Stackoverflow._encodeDate(date), Stackoverflow._encodeLanguageName(languageName));
    url = this._addApiKey(url);

    return url;
  }

  static _encodeDate(date) {
    // All dates in the API are in unix epoch time, which is the number of seconds since midnight UTC January 1st, 1970.
    // (https://api.stackexchange.com/docs/dates)
    return Math.floor(date / 1000);
  }

  static _encodeLanguageName(languageName) {
    return encodeURIComponent(languageName.toLowerCase().replace(/ /g, '-'));
  }

  async _callApi(url) {
    const options = new URL(url);

    let bodyJson = await CodingSite._httpsRequest(options);
    return JSON.parse(bodyJson);
  }

  _addApiKey(url) {
    const KEY_PARAMETER = '&key=';
    if (typeof this._apiKey !== 'undefined') {
      url = `${url}${KEY_PARAMETER}${this._apiKey}`;
    }

    return url;
  }
};

Stackoverflow.MAX_REQUESTS_PER_SECOND = 30;

module.exports = Stackoverflow;
