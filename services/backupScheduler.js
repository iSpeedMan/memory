'use strict';

const conf = require('../conf');
const logger = require('../utils/logger');
const { createBackup } = require('../scripts/backup');

function startBackupScheduler() {
    if (!conf.isProduction) return { stop: async () => {} };

    const intervalMs = conf.storage.backupIntervalHours * 60 * 60 * 1000;
    const retryMs = Math.min(intervalMs, 60 * 60 * 1000);
    let timer = null;
    let activeBackup = null;
    let stopped = false;

    function schedule(delayMs) {
        if (stopped) return;
        timer = setTimeout(run, delayMs);
        if (timer.unref) timer.unref();
    }

    async function run() {
        if (stopped) return;
        let nextDelay = intervalMs;
        activeBackup = createBackup();
        try {
            const result = await activeBackup;
            logger.info({ directory: result.directory }, 'Scheduled backup completed');
        } catch (err) {
            nextDelay = retryMs;
            logger.error({ err }, 'Scheduled backup failed; retry scheduled');
        } finally {
            activeBackup = null;
            schedule(nextDelay);
        }
    }

    logger.info({ intervalHours: conf.storage.backupIntervalHours }, 'Automatic backups enabled');
    schedule(60 * 1000);

    return {
        async stop() {
            stopped = true;
            if (timer) clearTimeout(timer);
            if (activeBackup) {
                try { await activeBackup; } catch (_) {}
            }
        }
    };
}

module.exports = { startBackupScheduler };