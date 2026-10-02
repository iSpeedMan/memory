'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '../..');

function prepareVolume(root) {
    return spawnSync(
        process.execPath,
        [
            '-e',
            `require('./services/persistentStorage').preparePersistentStorage()` +
            `.then(()=>console.log('ready')).catch(err=>{console.error(err.message);process.exit(1)})`
        ],
        {
            cwd: projectRoot,
            env: {
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
                PERSISTENT_DATA_DIR: root
            },
            encoding: 'utf8'
        }
    );
}

function checkUploadPath(root) {
    return spawnSync(
        process.execPath,
        [
            '-e',
            `const fs=require('fs'); const path=require('path'); ` +
            `const s=require('./services/uploadService'); ` +
            `const file=path.join(s.uploadsRoot,'categories','sample.png'); ` +
            `fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,'test'); ` +
            `const url=s.publicUrlForFile({path:file}); ` +
            `if(url!=='/uploads/categories/sample.png'||s.resolveUploadPath(url)!==file) process.exit(2); ` +
            `let rejected=false; try{s.resolveUploadPath('/uploads/../../escape')}catch(_){rejected=true}; ` +
            `if(!rejected) process.exit(3); console.log(url);`
        ],
        {
            cwd: projectRoot,
            env: {
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
                PERSISTENT_DATA_DIR: root
            },
            encoding: 'utf8'
        }
    );
}

describe('persistent volume preflight', () => {
    let tempRoot;

    beforeEach(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metro-memory-volume-'));
    });

    afterEach(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('creates and verifies the application data directories on the mounted volume', () => {
        const result = prepareVolume(tempRoot);
        expect(result.status).toBe(0);
        for (const directory of ['uploads', 'sessions', 'backups']) {
            expect(fs.statSync(path.join(tempRoot, directory)).isDirectory()).toBe(true);
        }
        expect(fs.readdirSync(tempRoot).sort()).toEqual(['backups', 'sessions', 'uploads']);
    });

    test('fails startup when the configured mount path does not exist', () => {
        const missingMount = path.join(tempRoot, 'not-mounted');
        const result = prepareVolume(missingMount);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Persistent volume is not mounted');
    });

    test('maps uploaded files to stable public URLs while storing bytes on the volume', () => {
        const result = checkUploadPath(tempRoot);
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe('/uploads/categories/sample.png');
        expect(fs.existsSync(path.join(tempRoot, 'uploads', 'categories', 'sample.png'))).toBe(true);
    });
});