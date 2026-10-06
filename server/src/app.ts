import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { authRouter } from './auth/routes.js';
import { csrfGuard } from './auth/middleware.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { diagramsRouter } from './diagrams/routes.js';
import { sharedWithMeRouter } from './diagrams/shares.js';
import { errorHandler, notFoundHandler } from './errors.js';

export const createApp = (db: Db, config: Config): Express => {
    const app = express();
    app.disable('x-powered-by');
    // Behind Caddy/nginx: trust X-Forwarded-For / -Proto for client IPs & rate limits.
    if (config.trustProxy) app.set('trust proxy', config.trustProxy);

    app.use(helmet());
    app.use(
        cors({
            // Exact origins only; never "*" because we use credentials.
            origin: config.frontendOrigins,
            credentials: true,
        })
    );
    app.use(express.json({ limit: '10mb' }));
    app.use(cookieParser());

    app.get('/api/health', (_req, res) => {
        res.json({ ok: true });
    });

    app.use('/api', csrfGuard(config));
    app.use('/api/auth', authRouter(db, config));
    app.use('/api/diagrams', diagramsRouter(db, config));
    app.use('/api/shared', sharedWithMeRouter(db, config));

    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
};
