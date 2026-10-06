import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from './db.js';

const defaultDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../migrations'
);

/**
 * Tiny forward-only migration runner: applies migrations/*.sql in filename
 * order, each in its own transaction, recording them in schema_migrations.
 */
export const runMigrations = async (
    pool: Pool,
    dir: string = defaultDir
): Promise<string[]> => {
    await pool.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
    );
    const done = new Set(
        (
            await pool.query<{ name: string }>(
                'SELECT name FROM schema_migrations'
            )
        ).rows.map((r) => r.name)
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const applied: string[] = [];

    for (const file of files) {
        if (done.has(file)) continue;
        const sql = await readFile(path.join(dir, file), 'utf8');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query(
                'INSERT INTO schema_migrations (name) VALUES ($1)',
                [file]
            );
            await client.query('COMMIT');
            applied.push(file);
        } catch (err) {
            await client.query('ROLLBACK');
            throw new Error(
                `Migration ${file} failed: ${(err as Error).message}`
            );
        } finally {
            client.release();
        }
    }
    return applied;
};
