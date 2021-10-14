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

   1. Convert the Postgres dump to SQLite

      ```
      sqlite3 langtrends.db -init langtrends-postgres-20211007.sql
      ```
