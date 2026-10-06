import type { Request, RequestHandler } from 'express';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { ApiError, wrap } from '../errors.js';
import { findSessionUser, type SessionUser } from './sessions.js';

declare module 'express-serve-static-core' {
    interface Request {
        user?: SessionUser;
    }
}

export const getToken = (req: Request, config: Config): string | undefined =>
    req.cookies?.[config.cookieName];

/** Authenticates from the session cookie; 401 otherwise. */
export const requireAuth = (db: Db, config: Config): RequestHandler =>
    wrap(async (req, _res, next) => {
        const token = getToken(req, config);
        const user = token ? await findSessionUser(db, token) : null;
        if (!user) {
            throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
        }
        req.user = user;
        next();
    });

/**
 * CSRF defence on top of SameSite=Lax cookies: state-changing requests must
 * come from a configured frontend origin. Browsers always send Origin on
 * cross-site POST/PUT/DELETE; if it is absent we fall back to Sec-Fetch-Site.
 */
export const csrfGuard =
    (config: Config): RequestHandler =>
    (req, _res, next) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
        const origin = req.get('origin');
        if (origin) {
            if (!config.frontendOrigins.includes(origin)) {
                return next(
                    new ApiError(403, 'FORBIDDEN', 'Origin not allowed.')
                );
            }
        } else if (req.get('sec-fetch-site') === 'cross-site') {
            return next(new ApiError(403, 'FORBIDDEN', 'Origin not allowed.'));
        }
        next();
    };
