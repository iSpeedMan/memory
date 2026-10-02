'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const conf = require('../conf');
const db = require('../db');
const uploadService = require('../services/uploadService');
const { preparePersistentStorage } = require('../services/persistentStorage');

const projectRoot = path.resolve(__dirname, '..');
const backupRoot = conf.storage.backupDir;
const retentionDays = conf.storage.backupRetentionDays;

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

async function runMySqlDump(destination) {
    const command = process.env.MYSQLDUMP_BIN || 'mysqldump';
    const args = [
        '--single-transaction',
        '--routines',
        '--events',
        '--triggers',
        '--host', conf.mysql.host,
        '--port', String(conf.mysql.port),
        '--user', conf.mysql.user,
        conf.mysql.database
    ];
    const child = spawn(command, args, {
        env: { ...process.env, MYSQL_PWD: conf.mysql.password },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    child.stderr.on('data', chunk => {
        stderr = (stderr + chunk.toString()).slice(-8192);
    });

    const output = fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 });
    const completed = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => {
            if (code === 0) return resolve();
            reject(new Error(
                `${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}` +
                (stderr.trim() ? `: ${stderr.trim()}` : '')
            ));
        });
    });

    try {
        await Promise.all([pipeline(child.stdout, output), completed]);
        await fs.promises.chmod(destination, 0o600);
    } catch (err) {
        try { child.kill('SIGTERM'); } catch (_) {}
        try { await fs.promises.unlink(destination); } catch (_) {}
        throw err;
    }
}

async function backupDatabase(targetDir) {
    if (conf.dbType === 'sqlite') {
        if (conf.sqlite.filename === ':memory:') {
            throw new Error('Cannot back up an in-memory SQLite database');
        }
        await db.backup(path.join(targetDir, 'database.sqlite'));

        const sessionsSource = conf.storage.sessionDbPath;
        if (fs.existsSync(sessionsSource)) {
            await backupSQLiteFile(sessionsSource, path.join(targetDir, 'sessions.sqlite'));
        }
        return ['database.sqlite', ...(fs.existsSync(sessionsSource) ? ['sessions.sqlite'] : [])];
    }

    const dumpPath = path.join(targetDir, 'database.sql');
    await runMySqlDump(dumpPath);
    const files = ['database.sql'];
    const sessionsSource = conf.storage.sessionDbPath;
    if (fs.existsSync(sessionsSource)) {
        await backupSQLiteFile(sessionsSource, path.join(targetDir, 'sessions.sqlite'));
        files.push('sessions.sqlite');
    }
    return files;
}

async function copyUploads(targetDir) {
    const source = uploadService.uploadsRoot;
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

async function createBackup() {
    await preparePersistentStorage();
    await db.waitForReady();
    await fs.promises.mkdir(backupRoot, { recursive: true, mode: 0o700 });
    const targetDir = path.join(backupRoot, `backup-${timestamp()}`);
    await fs.promises.mkdir(targetDir, { recursive: true, mode: 0o700 });

    try {
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
        return { directory: targetDir, ...manifest };
    } catch (err) {
        await fs.promises.rm(targetDir, { recursive: true, force: true });
        throw err;
    }
}

async function main() {
    const result = await createBackup();
    console.log(JSON.stringify({ ok: true, ...result }));
}

if (require.main === module) {
    main().catch(err => {
        console.error(JSON.stringify({ ok: false, error: err.message }));
        process.exitCode = 1;
    });
}

module.exports = { createBackup };