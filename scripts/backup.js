'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const conf = require('../conf');
const db = require('../db');

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, '..');
const backupRoot = path.resolve(projectRoot, process.env.BACKUP_DIR || 'backups');
const retentionDays = Math.max(1, Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '14', 10) || 14);

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function backupSQLiteFile(source, destination) {
    const sqlite3 = require('sqlite3').verbose();
    return new Promise((resolve, reject) => {
        const sourceDb = new sqlite3.Database(source, sqlite3.OPEN_READONLY, (openErr) => {
            if (openErr) return reject(openErr);
            runSQLiteBackup(sourceDb, destination).then(() => {
                sourceDb.close((closeErr) => {
                    if (closeErr) return reject(closeErr);
                    resolve(destination);
                });
            }, backupErr => {
                sourceDb.close(() => reject(backupErr));
            });
        });
    });
}

function runSQLiteBackup(database, destination) {
    return new Promise((resolve, reject) => {
        const backup = database.backup(destination);
        const step = () => {
            backup.step(-1, (err, done) => {
                if (err) return reject(err);
                if (done) return resolve(destination);
                step();
            });
        };
        step();
    });
}

async function backupDatabase(targetDir) {
    if (conf.dbType === 'sqlite') {
        if (conf.sqlite.filename === ':memory:') {
            throw new Error('Cannot back up an in-memory SQLite database');
        }
        const source = path.resolve(projectRoot, conf.sqlite.filename);
        await db.backup(path.join(targetDir, 'database.sqlite'));

        const sessionsSource = path.join(projectRoot, 'sessions.sqlite');
        if (fs.existsSync(sessionsSource)) {
            await backupSQLiteFile(sessionsSource, path.join(targetDir, 'sessions.sqlite'));
        }
        return ['database.sqlite', ...(fs.existsSync(sessionsSource) ? ['sessions.sqlite'] : [])];
    }

    const dumpPath = path.join(targetDir, 'database.sql');
    await execFileAsync('mysqldump', [
        '--single-transaction',
        '--routines',
        '--events',
        '--triggers',
        '--host', conf.mysql.host,
        '--port', String(conf.mysql.port),
        '--user', conf.mysql.user,
        conf.mysql.database
    ], {
        env: { ...process.env, MYSQL_PWD: conf.mysql.password },
        maxBuffer: 64 * 1024 * 1024
    }).then(({ stdout }) => fs.writeFileSync(dumpPath, stdout, { mode: 0o600 }));
    return ['database.sql'];
}

async function copyUploads(targetDir) {
    const source = path.join(projectRoot, 'public', 'uploads');
    const destination = path.join(targetDir, 'uploads');
    if (!fs.existsSync(source)) return false;
    await fs.promises.cp(source, destination, { recursive: true, force: true });
    return true;
}

async function removeExpiredBackups() {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const entries = await fs.promises.readdir(backupRoot, { withFileTypes: true });
    await Promise.all(entries
        .filter(entry => entry.isDirectory() && entry.name.startsWith('backup-'))
        .map(async entry => {
            const fullPath = path.join(backupRoot, entry.name);
            const stat = await fs.promises.stat(fullPath);
            if (stat.mtimeMs < cutoff) await fs.promises.rm(fullPath, { recursive: true, force: true });
        }));
}

async function main() {
    await db.waitForReady();
    await fs.promises.mkdir(backupRoot, { recursive: true, mode: 0o700 });
    const targetDir = path.join(backupRoot, `backup-${timestamp()}`);
    await fs.promises.mkdir(targetDir, { recursive: true, mode: 0o700 });

    const files = await backupDatabase(targetDir);
    const uploadsCopied = await copyUploads(targetDir);
    const manifest = {
        createdAt: new Date().toISOString(),
        databaseType: conf.dbType,
        files,
        uploadsCopied,
        retentionDays
    };
    await fs.promises.writeFile(
        path.join(targetDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        { mode: 0o600 }
    );
    await removeExpiredBackups();
    console.log(JSON.stringify({ ok: true, directory: path.relative(projectRoot, targetDir), ...manifest }));
}

main().catch(err => {
    console.error(JSON.stringify({ ok: false, error: err.message }));
    process.exitCode = 1;
});