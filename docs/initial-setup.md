## Initial setup

This repository was created from [https://github.com/bmaupin/langtrends-api](https://github.com/bmaupin/langtrends-api). Here are some of the steps that were used:

1. Check out https://github.com/bmaupin/langtrends-api

1. Filter out everything but `server/boot/classes`

   [Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

   ```
   git filter-repo --path server/boot/classes
   ```

1. Rename `server/boot/classes` to `classes`

   ```
   before=server/boot/classes
   after=classes
   git filter-branch -f --prune-empty --index-filter '
       git ls-files -s $before |
       sed "s@'"$before"'@'"$after"'@" |
       GIT_INDEX_FILE=$GIT_INDEX_FILE.new git update-index --index-info &&
       mv $GIT_INDEX_FILE.new $GIT_INDEX_FILE || true
   ' HEAD
   ```

1. Convert data from PostgreSQL to SQLite

   1. Dump the database

      ```
      pg_dump -h HOST -d DATABASE -U USER --verbose --format=p --create --clean --disable-dollar-quoting --inserts --column-inserts --table "public.language" --table "public.score" > langtrends-postgres-20211007.sql
      ```

   1. Remove `public.` prefix from tables

      ```
      sed -i "s/public.${table_name}/${table_name}/g" langtrends-postgres-20211007.sql
      ```

   1. (Manually) Remove all lines except `INSERT` and `CREATE TABLE`

   1. In `CREATE TABLE` lines, add `PRIMARY KEY` to id columns (this will automatically handle auto increment), e.g.

      ```
      id integer NOT NULL PRIMARY KEY
      ```

      This replaces Postgres' `CREATE SEQUENCE` commands

   1. Convert timestamps to strings

      1. Convert `date timestamp with time zone NOT NULL,` to `date STRING NOT NULL`

      1. `:%s/\ 00:00:00+00/T00:00:00.000Z/g`

   1. Convert the Postgres dump to SQLite

      ```
      sqlite3 langtrends.db -init langtrends-postgres-20211007.sql
      ```

   1. Convert timestamps from strings to integers

      - This will save space while still allowing us to view the timestamps in the database (e.g. `select *, datetime(date, 'unixepoch') from score;`), which isn't so bad given we'd have to convert language IDs anyway (e.g. `select datetime(date, 'unixepoch') as datetime, name, points from score join language on languageid = language.id;`)

      There's probably a better way to do this conversion ... 😅

      ```typescript
      import sqlite3 from 'sqlite3';
      import { open } from 'sqlite';

      const db = await open({
        filename: 'langtrends.db',
        driver: sqlite3.Database,
      });
      const testdb = await open({
        filename: 'test.db',
        driver: sqlite3.Database,
      });

      await testdb.run(`
        CREATE TABLE language (
          name TEXT NOT NULL UNIQUE,
          stackoverflowtag TEXT,
          id INTEGER NOT NULL PRIMARY KEY
        );
      `);

      const languages = await db.all('SELECT * FROM language');
      for (const language of languages) {
        await testdb.run(
          `INSERT INTO language (name, stackoverflowtag)
            VALUES($name, $stackoverflowtag);`,
          {
            $name: language.name,
            $stackoverflowtag: language.stackoverflowtag,
          }
        );
      }

      await testdb.run(`
        CREATE TABLE score (
          date INTEGER NOT NULL,
          points INTEGER NOT NULL,
          id INTEGER NOT NULL PRIMARY KEY,
          languageid INTEGER
        );
      `);

      const results = await db.all('SELECT * FROM score');
      for (const result of results) {
        await testdb.run(
          `INSERT INTO score (date, points, languageid)
            VALUES($date, $points, $languageid);`,
          {
            $date: Number(new Date(result.date)) / 1000,
            $points: result.points,
            $languageid: result.languageid,
          }
        );
      }

      await testdb.close();
      await db.close();
      ```

   1. Convert data from SQLite to JSON

      SQLite ended up not working out as well as expected 😝

      ```typescript
      import { writeFile } from 'fs/promises';
      import sqlite3 from 'sqlite3';
      import { open } from 'sqlite';

      const db = await open({
        filename: 'langtrends.db',
        driver: sqlite3.Database,
      });

      const languagesToExport = [];
      const languagesFromDatabase = await db.all('SELECT * FROM language');
      for (const language of languagesFromDatabase) {
        // Order properties like we want them
        languagesToExport.push({
          id: language.id,
          name: language.name,
          stackoverflowTag: language.stackoverflowtag || undefined,
        });
      }
      await writeFile('languages.json', JSON.stringify(languagesToExport));

      const scoresToExport = [];
      const scoresFromDatabase = await db.all(
        'SELECT * FROM score ORDER BY date ASC, languageid ASC'
      );
      for (const score of scoresFromDatabase) {
        // Remove ID since we don't need it
        // Order properties like we want them
        scoresToExport.push({
          date: convertDateToDateString(convertIntegerToDate(score.date)),
          languageId: score.languageid,
          points: score.points,
        });
      }
      await writeFile('scores.json', JSON.stringify(scoresToExport, null, 2));

      await db.close();
      ```
