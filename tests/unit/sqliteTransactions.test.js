'use strict';

const db = require('../../db');

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, err => err ? reject(err) : resolve());
    });
}

describe('SQLite transaction queue', () => {
    beforeAll(async () => {
        await db.waitForReady();
        await run(`CREATE TABLE IF NOT EXISTS transaction_queue_test (
            id INTEGER PRIMARY KEY,
            marker TEXT UNIQUE NOT NULL
        )`);
    });

    afterAll(async () => {
        await run('DROP TABLE IF EXISTS transaction_queue_test');
        await db.end();
    });

    test('serializes concurrent transactions on the shared SQLite connection', async () => {
        const transactions = Array.from({ length: 12 }, (_, index) => db.transaction(async tx => {
            await tx.run(
                'INSERT INTO transaction_queue_test (id, marker) VALUES (?, ?)',
                [index + 1, `transaction-${index + 1}`]
            );
            await new Promise(resolve => setTimeout(resolve, 2));
            const row = await tx.get(
                'SELECT COUNT(*) AS count FROM transaction_queue_test WHERE id = ?',
                [index + 1]
            );
            expect(row.count).toBe(1);
        }));

        await expect(Promise.all(transactions)).resolves.toHaveLength(12);
        const row = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) AS count FROM transaction_queue_test', (err, result) => {
                err ? reject(err) : resolve(result);
            });
        });
        expect(row.count).toBe(12);
    });
});
