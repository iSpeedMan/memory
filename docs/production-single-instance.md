# Single-instance production deployment

This application can run as one Node.js process with MySQL as its primary database
and a mounted persistent volume for uploaded files, SQLite sessions, and backups.
The actual host and volume mount must be configured outside this repository.

## Host requirements

- Run exactly one application replica/process. Game rooms and some rate-limit
  state are in memory and are not shared between app instances.
- Attach a writable persistent volume and mount it before starting the process.
  Set `PERSISTENT_DATA_DIR` to that existing absolute mount path. Startup fails if
  the directory is missing or not writable.
- Install Node.js 20+ and a MySQL-compatible dump client (`mysqldump`, or set
  `MYSQLDUMP_BIN` to the installed executable, such as `mariadb-dump`).
- Build with `npm run build` and start with `node server.js`.

The application creates these directories below `PERSISTENT_DATA_DIR`:

- `uploads/` — images served at `/uploads/...`
- `sessions/` — the SQLite session-store database
- `backups/` — database dumps, session database, uploaded files, and manifest

Do not point `PERSISTENT_DATA_DIR` at an ordinary container directory. The
directory must be backed by the host's persistent-volume service.

## Required production settings

Set these in the host's environment or secrets manager. Never put credentials in
the repository:

```text
NODE_ENV=production
MEMORY_DB_TYPE=mysql
BASE_URL=https://your-domain.example
MYSQL_HOST=...
MYSQL_PORT=3306
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=...
PERSISTENT_DATA_DIR=/absolute/path/to/mounted-volume
SESSION_SECRET=<random value of at least 32 bytes>
FIRST_ADMIN_PASSWORD=<at least 12 characters>
BCRYPT_ROUNDS=12
```

Optional backup settings:

```text
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_DAYS=14
# BACKUP_DIR=backups
# MYSQLDUMP_BIN=mysqldump
```

The server schedules the first automatic backup one minute after startup, then
uses `BACKUP_INTERVAL_HOURS`; after a failure it retries within an hour. Failures
and completions appear in application logs. A manual backup can be created with
`npm run backup`.

`/ready` must return HTTP 200 before traffic is considered healthy. It checks the
MySQL schema; startup also checks that the configured volume exists and is
writable.

## Restore outline

Stop the application before restoring session or upload files. Preserve the
current volume contents first. For a backup containing `database.sql`,
restore it into the already-created MySQL database with the host's MySQL client.
Then restore `sessions.sqlite` to
`$PERSISTENT_DATA_DIR/sessions/sessions.sqlite` and the backup's `uploads/`
directory to `$PERSISTENT_DATA_DIR/uploads/`. Restart the application and check
`/ready` and a known uploaded image before reopening traffic.

The backup folder is on the same persistent volume as uploads and sessions. It
survives ordinary process restarts and app releases, but it is not protection
against loss of that volume or its host. Configure the host's volume snapshots or
an offsite copy if recovery from provider or disk failure is required.