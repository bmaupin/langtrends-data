'use strict';

import https from 'https';
import { JSDOM } from 'jsdom';
import { URL } from 'url';

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
  private apiKey: string;

  // Require API key in the constructor as it can't be null for the GraphQL API
  // (https://platform.github.community/t/anonymous-access/2093)
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  public static async getLanguageNames(): Promise<string[]> {
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

  // Get the number of repositories created between fromDate (inclusive) and toDate (exclusive)
  public async getScore(
    languageName: string,
    fromDate: Date,
    toDate: Date
  ): Promise<number> {
    // By default, toDate is inclusive; subtract a day to make it exclusive so that it
    // matches the StackOverflow API. Plus this behaviour should be easier to
    // conceptualise
    const postData = this.buildPostData(
      languageName,
      fromDate,
      GitHub.subtractDayUTC(toDate)
    );
    const body = await this.callApi(API_URL, postData);

    GitHub.handleApiLimits(body);

    return body.data.search.repositoryCount;
  }

  private static subtractDayUTC(date: Date): Date {
    // Make a copy of the date object so we don't overwrite it
    const newDate = new Date(date);
    newDate.setUTCDate(newDate.getUTCDate() - 1);
    return newDate;
  }

  private buildPostData(
    languageName: string,
    fromDate: Date,
    toDate: Date
  ): string {
    const postData =
      `{"query": "{ search(query: \\"language:${GitHub.encodeLanguageName(
        languageName
      )} ` +
      `created:${GitHub.encodeDate(fromDate)}..${GitHub.encodeDate(
        toDate
      )}\\", type: REPOSITORY) { repositoryCount } rateLimit { remaining }}"}`;

    return postData;
  }

  private static encodeLanguageName(languageName: string): string {
    // Github API requires spaces in language names to be replaced with dashes
    return languageName.replace(/ /g, '-');
  }

  private static encodeDate(date: Date): string {
    // Github API requires the date to be formatted as yyyy-MM-dd
    return date.toISOString().slice(0, 10);
  }

  private async callApi(url: string, postData: string) {
    const optionsUrl = new URL(url);
    const options = {
      headers: {
        Authorization: `bearer ${this.apiKey}`,
        // For whatever reason, user agent is required by the Github API
        'User-Agent': 'node.js',
      },
      hostname: optionsUrl.hostname,
      method: 'POST',
      path: optionsUrl.pathname,
    };

    const bodyJson = await this.httpsRequest(options, postData);
    return JSON.parse(bodyJson);
  }

  // Based on https://stackoverflow.com/a/38543075/399105
  private httpsRequest(
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
            await this.retryOnError(
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

  private async retryOnError(
    errorCode: number,
    secondsToWait: number,
    options: https.RequestOptions,
    postData: string
  ) {
    console.warn(
      `Warning: ${options.hostname} returned error code ${errorCode}; retrying in ${secondsToWait} seconds`
    );
    await GitHub.waitSeconds(secondsToWait);
    return await this.httpsRequest(options, postData);
  }

  // Based on https://stackoverflow.com/a/39027151/399105
  private static waitSeconds(numSeconds: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, numSeconds * 1000);
    });
  }

  private static handleApiLimits(body: GitHubData) {
    if (!body.data && body.errors) {
      throw new Error(`Github API error (${body.errors[0].message})`);
    }

    if (body.data.rateLimit.remaining <= 0) {
      throw new Error('Github API hourly limit exceeded');
    }
  }
}
