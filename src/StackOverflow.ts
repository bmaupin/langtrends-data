'use strict';

import https from 'https';
import { URL } from 'url';
import util from 'util';
import zlib from 'zlib';

// Uses a custom filter that only returns backoff, quota_remaining, and total
// (https://api.stackexchange.com/docs/create-filter#unsafe=false&filter=!.UE8F0bVg4M-_Ii4&run=true)
const API_URL =
  'https://api.stackexchange.com/2.2/search?fromdate=%s&todate=%s&site=stackoverflow&tagged=%s&filter=!.UE8F0bVg4M-_Ii4';

interface StackOverflowData {
  backoff?: number;
  quota_remaining: number;
  total: number;
}

export default class StackOverflow {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  // Get the number of tags between fromDate (inclusive) and toDate (exclusive)
  public async getScore(
    languageName: string,
    fromDate: Date,
    toDate: Date
  ): Promise<number> {
    let url = this.buildUrl(languageName, fromDate, toDate);
    let body = await this.callApi(url);

    StackOverflow.handleApiLimits(body);

    return body.total;
  }

  private buildUrl(languageName: string, fromDate: Date, toDate: Date): string {
    let url = util.format(
      API_URL,
      StackOverflow.encodeDate(fromDate),
      StackOverflow.encodeDate(toDate),
      StackOverflow.encodeLanguageName(languageName)
    );
    url = this.addApiKey(url);

    return url;
  }

  private static encodeDate(date: Date): number {
    // All dates in the API are in unix epoch time, which is the number of seconds since midnight UTC January 1st, 1970.
    // (https://api.stackexchange.com/docs/dates)
    return Math.floor(Number(date) / 1000);
  }

  private static encodeLanguageName(languageName: string): string {
    return encodeURIComponent(languageName.toLowerCase().replace(/ /g, '-'));
  }

  private addApiKey(url: string): string {
    const KEY_PARAMETER = '&key=';
    if (typeof this.apiKey !== 'undefined') {
      url = `${url}${KEY_PARAMETER}${this.apiKey}`;
    }

    return url;
  }

  private async callApi(url: string): Promise<StackOverflowData> {
    const options = new URL(url);
    const bodyJson = await this.httpsRequest(options);
    return JSON.parse(bodyJson);
  }

  // Based on https://stackoverflow.com/a/38543075/399105
  private httpsRequest(options: https.RequestOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = https.request(options, async (response) => {
        if (
          response.statusCode &&
          (response.statusCode < 200 || response.statusCode >= 300)
        ) {
          if (response.statusCode === 400) {
            console.warn(
              'Warning: Stackoverflow API daily limit exceeded or API key incorrect'
            );
          } else if (response.statusCode === 503) {
            // Stackoverflow might throw a 503 if it feels there are too many requests
            console.warn(
              'Warning: Stackoverflow API returned 503; wait a bit and try again'
            );
          }
          reject(new Error('statusCode=' + response.statusCode));
        }

        const body = [] as Buffer[];
        response.on('data', function (chunk) {
          body.push(chunk);
        });

        response.on('end', () => {
          switch (response.headers['content-encoding']) {
            case 'gzip':
              zlib.gunzip(Buffer.concat(body), (error, uncompressedData) => {
                resolve(uncompressedData.toString());
              });
              break;
            case undefined:
              resolve(Buffer.concat(body).toString());
              break;
            default:
              // If we get here it's likely due to another issue, normally a 503 error due to too many requests
              reject(
                new Error(
                  `Incorrect content encoding: ${response.headers['content-encoding']}`
                )
              );
              break;
          }
        });
      });

      request.on('error', (err: NodeJS.ErrnoException) => {
        // Stack Overflow might close the connection for any outstanding requests and return a 503 for new ones if it
        // feels there are too many requests
        if (err.code === 'ECONNRESET') {
          console.warn(
            'Warning: Stack Overflow API closed connection; wait a bit and try again'
          );
        }
        // Use the original message and code but our stack trace since the original stack trace won't point back to
        // here
        reject(new Error(`${err.message} (${err.code})`));
      });

      request.end();
    });
  }

  private static handleApiLimits(body: StackOverflowData) {
    if (body.quota_remaining <= 0) {
      throw new Error('Stack Overflow API daily limit exceeded');
    }

    // The backoff field never seems to be sent, but throw if it happens so we can add logic for it (https://stackapps.com/a/3057/41977)
    if (body.backoff) {
      throw new Error(
        `Stack Overflow API backoff field not handled: ${body.backoff}`
      );
    }
  }
}
