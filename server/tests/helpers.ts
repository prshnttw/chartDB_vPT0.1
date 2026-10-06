import { randomUUID } from 'node:crypto';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Pool } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';

export const setup = async (env: Record<string, string> = {}) => {
    const mem = newDb();
    mem.public.registerFunction({
        name: 'gen_random_uuid',
        returns: DataType.uuid,
        implementation: randomUUID,
        impure: true,
    });
    const pool = new (mem.adapters.createPg().Pool)() as unknown as Pool;
    await runMigrations(pool);
    const config = loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://unused',
        FRONTEND_URL: 'http://localhost:5173',
        ...env,
    });
    return { app: createApp(pool, config), pool, config };
};

export const validUser = (n = 1) => ({
    name: `User ${n}`,
    email: `user${n}@lab.cbr-iisc.ac.in`,
    password: 'correct-horse-9',
});

/** A cookie-carrying agent signed up as the given user. */
export const signedUpAgent = async (
    app: ReturnType<typeof createApp>,
    n = 1
) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/signup').send(validUser(n));
    if (res.status !== 201) throw new Error(`signup failed: ${res.status}`);
    return agent;
};

export const diagramPayload = (name = 'My diagram') => ({
    name,
    data: {
        id: 'local-id',
        name,
        databaseType: 'postgresql',
        tables: [{ id: 't1', name: 'users' }],
        updatedAt: new Date().toISOString(),
    },
});
