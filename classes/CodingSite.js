'use strict';

const https = require('https');
const zlib = require('zlib');

module.exports = class CodingSite {
  set apiKey(newApiKey) {
    this._apiKey = newApiKey;
  }

  // Based on https://stackoverflow.com/a/38543075/399105
  static _httpsRequest(options, postData) {
    return new Promise(function(resolve, reject) {
      let request = https.request(options, async function(response) {
        // https://developer.github.com/v3/guides/best-practices-for-integrators/#dealing-with-abuse-rate-limits
        if (response.statusCode === 403 && response.headers.hasOwnProperty('retry-after')) {
          resolve(await CodingSite._handle403Error(Number(response.headers['retry-after']), options, postData));
        } else if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error('statusCode=' + response.statusCode));
        }

        let body = [];
        response.on('data', function(chunk) {
          body.push(chunk);
        });

        response.on('end', function() {
          try {
            switch (response.headers['content-encoding']) {
              case 'gzip':
                zlib.gunzip(Buffer.concat(body), (error, uncompressedData) => {
                  resolve(uncompressedData.toString());
                });
                break;
              default:
                resolve(Buffer.concat(body).toString());
                break;
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      request.on('error', function(err) {
        reject(err);
      });

      if (postData) {
        request.write(postData);
      }
      request.end();
    });
  }

  static async _handle403Error(secondsToWait, options, postData) {
    console.log(`WARNING: API returned 403 error; retrying in ${secondsToWait} seconds`);
    await CodingSite._waitSeconds(secondsToWait);
    return await CodingSite._httpsRequest(options, postData);
  }

  // Based on https://stackoverflow.com/a/39027151/399105
  static _waitSeconds(numSeconds) {
    return new Promise(resolve => {
      setTimeout(resolve, numSeconds * 1000);
    });
  }
};
