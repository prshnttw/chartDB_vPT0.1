import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { runMigrations } from './migrate.js';

const pool = createPool(loadConfig().databaseUrl);
runMigrations(pool)
    .then((applied) => {
        console.log(
            applied.length ? `Applied: ${applied.join(', ')}` : 'Up to date'
        );
        return pool.end();
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
