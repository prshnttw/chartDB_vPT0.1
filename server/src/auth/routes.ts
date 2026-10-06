import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { ApiError, wrap } from '../errors.js';
import {
    emailSchema,
    isEmailDomainAllowed,
    nameSchema,
    parse,
    passwordSchema,
} from '../validation.js';
import { getToken, requireAuth } from './middleware.js';
import { hashPassword, verifyDummy, verifyPassword } from './password.js';
import { createSession, deleteSession, type SessionUser } from './sessions.js';

const signupSchema = z.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
});

// No strength rules on login: only check that something was supplied.
const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1).max(128),
});

const publicUser = (u: SessionUser) => ({
    id: u.id,
    name: u.name,
    email: u.email,
});

export const authRouter = (db: Db, config: Config): Router => {
    const router = Router();

    const limiter = (max: number) =>
        rateLimit({
            windowMs: 15 * 60 * 1000,
            limit: max,
            standardHeaders: true,
            legacyHeaders: false,
            skip: () => !config.rateLimitEnabled,
            handler: (_req, _res, next) =>
                next(
                    new ApiError(
                        429,
                        'RATE_LIMITED',
                        'Too many attempts. Please try again later.'
                    )
                ),
        });

    const startSession = async (res: Response, userId: string) => {
        const { token, expiresAt } = await createSession(
            db,
            userId,
            config.sessionTtlMs
        );
        res.cookie(config.cookieName, token, {
            httpOnly: true,
            secure: config.cookieSecure,
            sameSite: 'lax',
            path: '/',
            expires: expiresAt,
        });
    };

    router.post(
        '/signup',
        limiter(10),
        wrap(async (req, res) => {
            if (!config.allowSignup) {
                throw new ApiError(
                    403,
                    'SIGNUP_DISABLED',
                    'Signup is disabled.'
                );
            }
            const { name, email, password } = parse(signupSchema, req.body);

            if (!isEmailDomainAllowed(email, config.allowedEmailDomains)) {
                throw new ApiError(
                    403,
                    'EMAIL_DOMAIN_NOT_ALLOWED',
                    `Signup is restricted to ${config.allowedEmailDomains
                        .map((d) => `@${d}`)
                        .join(', ')} email addresses.`
                );
            }

            const passwordHash = await hashPassword(password);
            const { rows } = await db
                .query<SessionUser>(
                    `INSERT INTO users (email, password_hash, name)
                     VALUES ($1, $2, $3)
                     RETURNING id, name, email, role`,
                    [email, passwordHash, name]
                )
                .catch((err) => {
                    if (err?.code === '23505') {
                        throw new ApiError(
                            409,
                            'EMAIL_TAKEN',
                            'An account with this email already exists.'
                        );
                    }
                    throw err;
                });
            await startSession(res, rows[0].id);
            res.status(201).json({ user: publicUser(rows[0]) });
        })
    );

    router.post(
        '/login',
        limiter(20),
        wrap(async (req, res) => {
            const { email, password } = parse(loginSchema, req.body);
            const { rows } = await db.query<
                SessionUser & { password_hash: string }
            >(
                'SELECT id, name, email, role, password_hash FROM users WHERE email = $1',
                [email]
            );
            const user = rows[0];
            const ok = user
                ? await verifyPassword(user.password_hash, password)
                : (await verifyDummy(password), false);
            if (!user || !ok) {
                throw new ApiError(
                    401,
                    'INVALID_CREDENTIALS',
                    'Invalid email or password.'
                );
            }
            await startSession(res, user.id);
            res.json({ user: publicUser(user) });
        })
    );

    router.post(
        '/logout',
        wrap(async (req, res) => {
            const token = getToken(req, config);
            if (token) await deleteSession(db, token);
            res.clearCookie(config.cookieName, {
                httpOnly: true,
                secure: config.cookieSecure,
                sameSite: 'lax',
                path: '/',
            });
            res.json({ ok: true });
        })
    );

    router.get('/me', requireAuth(db, config), (req, res) => {
        res.json({ user: publicUser(req.user!) });
    });

    return router;
};
