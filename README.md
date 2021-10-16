[![CI](https://github.com/bmaupin/langtrends-data/workflows/CI/badge.svg)](https://github.com/bmaupin/langtrends-data/actions)
[![Coverage Status](https://coveralls.io/repos/github/bmaupin/langtrends-data/badge.svg)](https://coveralls.io/github/bmaupin/langtrends-data)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/bmaupin/langtrends-data/blob/master/LICENSE)

---

#### Storing timestamps in SQLite

SQLite doesn't have a native storage class for storing dates/times ([Date and Time Datatype](https://www.sqlite.org/datatype3.html#date_and_time_datatype))

Options are:

- Store the timestamps as `TEXT`
  - Pros:
    - Allows us to see the timestamp easily when querying the database
    - Easily converted to/from in JavaScript using [`Date.prototype.toISOString()`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString)
  - Cons:
    - Since the database contains a lot of timestamps, it more than doubled the size of the database
- Store the timestamps as `INTEGER`
  - Pros:
    - Drastically reduces the size of the database as compared to `TEXT`
    - Reduces the size of the database as compared to `REAL`
      - `REAL` uses 8 bytes. `INTEGER` dates won't use 8 bytes until the year 2038
  - Cons:
    - Doesn't store milliseconds (which we don't need, so arguably a pro in this case)
    - Need to use SQLite functions to easily see the date when browsing the database (see below)
    - Need to do extra conversion in the code when working with the database
- Store the timestamps as `REAL`
  - Not tested as no perceived advantages over the other two options

See also: [https://stackoverflow.com/a/49704766/399105](https://stackoverflow.com/a/49704766/399105)

#### Querying the database

Timestamps are stored as integers. This keeps the size of the database down (storing them as strings used up nearly three times as much space) while still allowing us to convert them when querying the database using [SQLite's `datetime` function](https://www.sqlite.org/lang_datefunc.html), e.g.

```sql
select datetime(date, 'unixepoch') as datetime, name, points from score join language on languageid = language.id order by date desc;
```
