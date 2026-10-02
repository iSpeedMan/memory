'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const conf = require('../conf');

async function assertWritableDirectory(directory) {
    const probePath = path.join(
        directory,
        `.metro-memory-write-check-${process.pid}-${crypto.randomUUID()}`
    );
    let handle;
    try {
        handle = await fs.promises.open(probePath, 'wx', 0o600);
        await handle.writeFile('ok');
        await handle.close();
        handle = null;
        await fs.promises.unlink(probePath);
    } catch (err) {
        if (handle) {
            try { await handle.close(); } catch (_) {}
        }
        try { await fs.promises.unlink(probePath); } catch (_) {}
        throw new Error(`Persistent storage is not writable at ${directory}: ${err.message}`);
    }
}

async function preparePersistentStorage() {
    if (!conf.isProduction) return;

    const root = conf.storage.persistentDataDir;
    let rootStat;
    try {
        rootStat = await fs.promises.stat(root);
    } catch (_) {
        throw new Error(`Persistent volume is not mounted at PERSISTENT_DATA_DIR: ${root}`);
    }
    if (!rootStat.isDirectory()) {
        throw new Error(`PERSISTENT_DATA_DIR is not a directory: ${root}`);
    }

    await assertWritableDirectory(root);
    const directories = [
        conf.storage.uploadsDir,
        conf.storage.sessionsDir,
        conf.storage.backupDir
    ];
    for (const directory of directories) {
        await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
        await assertWritableDirectory(directory);
    }
}

module.exports = { preparePersistentStorage };