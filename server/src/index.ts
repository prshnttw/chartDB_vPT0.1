import { createApp } from './app.js';
import { deleteExpiredSessions } from './auth/sessions.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { runMigrations } from './migrate.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

const start = async () => {
    const applied = await runMigrations(pool);
    if (applied.length)
        console.log(`Applied migrations: ${applied.join(', ')}`);

    const cleanup = () =>
        deleteExpiredSessions(pool).catch((e) =>
            console.error('session cleanup failed', e)
        );
    await cleanup();
    setInterval(cleanup, 60 * 60 * 1000).unref();

    const server = createApp(pool, config).listen(config.port, () =>
        console.log(`chartdb-api listening on :${config.port}`)
    );

    const shutdown = () => server.close(() => void pool.end());
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
};

start().catch((err) => {
    console.error(err);
    process.exit(1);
});
