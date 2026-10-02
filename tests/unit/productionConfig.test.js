'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '../..');
const persistentDir = path.join(require('os').tmpdir(), 'metro-memory-data');
const productionEnv = {
    PATH: process.env.PATH,
    NODE_ENV: 'production',
    MEMORY_DB_TYPE: 'mysql',
    MYSQL_HOST: 'mysql.example.invalid',
    MYSQL_USER: 'metro_test',
    MYSQL_PASSWORD: 'test-only-password',
    MYSQL_DATABASE: 'metro_test',
    BASE_URL: 'https://memory.example.invalid',
    SESSION_SECRET: 'test-only-session-secret-'.padEnd(40, 'x'),
    FIRST_ADMIN_PASSWORD: 'test-only-admin-password',
    BCRYPT_ROUNDS: '12',
    PERSISTENT_DATA_DIR: persistentDir
};

function loadConf(overrides = {}) {
    return spawnSync(
        process.execPath,
        ['-e', `const c=require('./conf'); console.log(JSON.stringify(c.storage));`],
        {
            cwd: projectRoot,
            env: { ...productionEnv, ...overrides },
            encoding: 'utf8'
        }
    );
}

describe('production deployment configuration', () => {
    test('requires MySQL instead of silently starting with SQLite', () => {
        const result = loadConf({ MEMORY_DB_TYPE: 'sqlite' });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('MEMORY_DB_TYPE=mysql is required in production');
    });

    test('requires an absolute persistent-volume mount path', () => {
        const result = loadConf({ PERSISTENT_DATA_DIR: 'var/lib/metro-memory' });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('PERSISTENT_DATA_DIR must be an absolute');
    });

    test('places uploads, sessions, and backups beneath the persistent volume', () => {
        const result = loadConf({ BACKUP_DIR: 'daily-backups' });
        expect(result.status).toBe(0);
        const storage = JSON.parse(result.stdout.trim());
        expect(storage.uploadsDir).toBe(path.join(persistentDir, 'uploads'));
        expect(storage.sessionsDir).toBe(path.join(persistentDir, 'sessions'));
        expect(storage.sessionDbPath).toBe(path.join(persistentDir, 'sessions', 'sessions.sqlite'));
        expect(storage.backupDir).toBe(path.join(persistentDir, 'daily-backups'));
    });

    test('rejects a backup directory outside the mounted volume', () => {
        const result = loadConf({ BACKUP_DIR: '../outside-backups' });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('BACKUP_DIR must be inside PERSISTENT_DATA_DIR');
    });
});