'use strict';

const https = require('https');
const zlib = require('zlib');

module.exports = class CodingSite {
  set apiKey(newApiKey) {
    this._apiKey = newApiKey;
  }

  static _httpsRequest(options, postData) {
    return new Promise(function(resolve, reject) {
      let request = https.request(options, function(response) {
        // Reject on bad status code
        if (response.statusCode < 200 || response.statusCode >= 300) {
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
      // Reject on request error
      request.on('error', function(err) {
        reject(err);
      });
      if (postData) {
        request.write(postData);
      }
      request.end();
    });
  }
};
