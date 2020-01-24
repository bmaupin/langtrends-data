'use strict';

const https = require('https');
const {URL} = require('url');
const util = require('util');
const zlib = require('zlib');

const CodingSite = require('./CodingSite');
const settings = require('./settings.json');

// Uses a custom filter that only returns backoff, quota_remaining, and total
// (https://api.stackexchange.com/docs/create-filter#unsafe=false&filter=!.UE8F0bVg4M-_Ii4&run=true)
const API_URL = 'https://api.stackexchange.com/2.2/search?todate=%s&site=stackoverflow&tagged=%s&filter=!.UE8F0bVg4M-_Ii4';
// Number of seconds to wait before making another API call if there's an error
const SECONDS_TO_WAIT_ON_ERROR = 60;

class Stackoverflow extends CodingSite {
  async getScore(languageName, date) {
    let url = this._buildUrl(date, languageName);
    let body = await this._callApi(url);

    Stackoverflow._handleApiLimits(body);

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

  _addApiKey(url) {
    const KEY_PARAMETER = '&key=';
    if (typeof this._apiKey !== 'undefined') {
      url = `${url}${KEY_PARAMETER}${this._apiKey}`;
    }

    return url;
  }

  async _callApi(url) {
    const options = new URL(url);
    let bodyJson = '';

    try {
      bodyJson = await this._httpsRequest(options);
    } catch (error) {
      if (error.message === 'statusCode=400') {
        throw new Error('Stackoverflow API daily limit exceeded or API key incorrect');
      } else {
        throw (error);
      }
    }

    return JSON.parse(bodyJson);
  }

  // Based on https://stackoverflow.com/a/38543075/399105
  _httpsRequest(options) {
    return new Promise((resolve, reject) => {
      let request = https.request(options, async (response) => {
        // Stackoverflow might throw a 503 if it feels there are too many requests
        if (response.statusCode === 503) {
          resolve(await this._retryOnError(
            response.statusCode,
            SECONDS_TO_WAIT_ON_ERROR,
            options)
          );
        } else if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error('statusCode=' + response.statusCode));
        }

        let body = [];
        response.on('data', function(chunk) {
          body.push(chunk);
        });

        response.on('end', async () => {
          switch (response.headers['content-encoding']) {
            case 'gzip':
              zlib.gunzip(Buffer.concat(body), (error, uncompressedData) => {
                resolve(uncompressedData.toString());
              });
              break;
            default:
              resolve(await this._retryOnError(
                `response.headers['content-encoding']: ${response.headers['content-encoding']}`,
                SECONDS_TO_WAIT_ON_ERROR,
                options)
              );
              break;
          }
        });
      });

      request.on('error', async (err) => {
        // Stackoverflow might close the connection for any outstanding requests and return a 503 for new ones if it
        // feels there are too many requests
        if (err.code === 'ECONNRESET') {
          resolve(await this._retryOnError(
            err.code,
            SECONDS_TO_WAIT_ON_ERROR,
            options)
          );
        } else {
          // Use the original message and code but our stack trace since the original stack trace won't point back to
          // here
          reject(new Error(`${err.message} (${err.code})`));
        }
      });

      request.end();
    });
  }

  static _handleApiLimits(body) {
    if (body.quota_remaining <= settings.MAX_CONCURRENT_REQUESTS) {
      console.log(`WARNING: StackOverflow API daily quota remaining: ${body.quota_remaining}`);
    } else if (body.quota_remaining <= 0) {
      throw new Error('Stackoverflow API daily limit exceeded');
    }

    // The backoff field never seems to be called, but throw if it happens so we can add logic for it (https://stackapps.com/a/3057/41977)
    if (body.hasOwnProperty('backoff')) {
      throw new Error(`StackOverflow API backoff field not handled: ${body.backoff}`);
    }
  }
};

module.exports = Stackoverflow;
