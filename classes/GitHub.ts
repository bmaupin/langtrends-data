'use strict';

import https from 'https';
import { JSDOM } from 'jsdom';
import { URL } from 'url';

import settings from './settings.json';

const API_URL = 'https://api.github.com/graphql';

interface GitHubData {
  data: {
    search: { repositoryCount: number };
    rateLimit: { remaining: number };
  };
  errors?: [
    {
      message: string;
    }
  ];
}

export default class GitHub {
  _apiKey?: string;

  set apiKey(newApiKey: string) {
    this._apiKey = newApiKey;
  }

  static async getLanguageNames(): Promise<string[]> {
    const GITHUB_LANGUAGES_URL = 'https://github.com/search/advanced';

    const dom = await JSDOM.fromURL(GITHUB_LANGUAGES_URL);
    const languageNames = [] as string[];

    const select = dom.window.document.getElementById('search_language');
    const optgroups = select!.getElementsByTagName('optgroup');

    for (let i = 0; i < optgroups.length; i++) {
      const options = optgroups[i].getElementsByTagName('option');
      for (let j = 0; j < options.length; j++) {
        if (options[j].textContent) {
          languageNames.push(options[j].textContent as string);
        }
      }
    }

    return languageNames;
  }

  async getScore(languageName: string, date: Date): Promise<number> {
    // API key can't be null for the GraphQL API (https://platform.github.community/t/anonymous-access/2093)
    if (typeof this._apiKey === 'undefined') {
      throw new Error('Github API key cannot be null');
    }

    const postData = this._buildPostData(date, languageName);
    const body = await this._callApi(API_URL, postData);

    GitHub._handleApiLimits(body);

    return body.data.search.repositoryCount;
  }

  _buildPostData(date: Date, languageName: string): string {
    const postData =
      `{"query": "{ search(query: \\"language:${GitHub._encodeLanguageName(
        languageName
      )} ` +
      `created:<${GitHub._encodeDate(
        date
      )}\\", type: REPOSITORY) { repositoryCount } rateLimit { remaining }}"}`;

    return postData;
  }

  static _encodeLanguageName(languageName: string): string {
    // Github API requires spaces in language names to be replaced with dashes
    return languageName.replace(/ /g, '-');
  }

  static _encodeDate(date: Date): string {
    // Github API requires the date to be formatted as yyyy-MM-dd
    return date.toISOString().slice(0, 10);
  }

  async _callApi(url: string, postData: string) {
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

    const bodyJson = await this._httpsRequest(options, postData);
    return JSON.parse(bodyJson);
  }

  // Based on https://stackoverflow.com/a/38543075/399105
  _httpsRequest(
    options: https.RequestOptions,
    postData: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = https.request(options, async (response) => {
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
        } else if (
          response.statusCode &&
          (response.statusCode < 200 || response.statusCode >= 300)
        ) {
          reject(new Error('statusCode=' + response.statusCode));
        }

        const body = [] as Buffer[];
        response.on('data', function (chunk) {
          body.push(chunk);
        });

        response.on('end', function () {
          resolve(Buffer.concat(body).toString());
        });
      });

      request.on('error', function (err: NodeJS.ErrnoException) {
        // Use the original message and code but our stack trace since the original stack trace won't point back to here
        reject(new Error(`${err.message} (${err.code})`));
      });

      if (postData) {
        request.write(postData);
      }
      request.end();
    });
  }

  async _retryOnError(
    errorCode: number,
    secondsToWait: number,
    options: https.RequestOptions,
    postData: string
  ) {
    console.warn(
      `Warning: ${options.hostname} returned error code ${errorCode}; retrying in ${secondsToWait} seconds`
    );
    await GitHub._waitSeconds(secondsToWait);
    return await this._httpsRequest(options, postData);
  }

  // Based on https://stackoverflow.com/a/39027151/399105
  static _waitSeconds(numSeconds: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, numSeconds * 1000);
    });
  }

  static _handleApiLimits(body: GitHubData) {
    if (!body.data && body.errors) {
      throw new Error(`Github API error (${body.errors[0].message})`);
    }

    if (body.data.rateLimit.remaining <= settings.maxConcurrentRequests) {
      console.warn(
        `Warning: Github API hourly quota remaining: ${body.data.rateLimit.remaining}`
      );
    } else if (body.data.rateLimit.remaining <= 0) {
      throw new Error('Github API hourly limit exceeded');
    }
  }
}
