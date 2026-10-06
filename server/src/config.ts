export interface Config {
    nodeEnv: string;
    port: number;
    databaseUrl: string;
    frontendOrigins: string[];
    cookieSecure: boolean;
    cookieName: string;
    sessionTtlMs: number;
    trustProxy: number;
    allowedEmailDomains: string[];
    allowSignup: boolean;
    rateLimitEnabled: boolean;
}

const bool = (v: string | undefined, fallback: boolean) =>
    v === undefined || v === '' ? fallback : v.toLowerCase() === 'true';

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
    const nodeEnv = env.NODE_ENV ?? 'development';
    const isProd = nodeEnv === 'production';

    if (!env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required');
    }
    // Sessions are random server-side tokens (hashed in the DB), but we still
    // refuse to boot in production with an unset/placeholder secret.
    if (isProd && (!env.SESSION_SECRET || env.SESSION_SECRET === 'CHANGE_ME')) {
        throw new Error('SESSION_SECRET must be set in production');
    }

    return {
        nodeEnv,
        port: Number(env.PORT ?? 3001),
        databaseUrl: env.DATABASE_URL,
        frontendOrigins: (env.FRONTEND_URL ?? 'http://localhost:5173')
            .split(',')
            .map((s) => s.trim().replace(/\/+$/, ''))
            .filter(Boolean),
        cookieSecure: bool(env.COOKIE_SECURE, isProd),
        cookieName: 'chartdb_sid',
        sessionTtlMs: Number(env.SESSION_TTL_DAYS ?? 14) * 24 * 60 * 60 * 1000,
        trustProxy: Number(env.TRUST_PROXY ?? (isProd ? 1 : 0)),
        allowedEmailDomains: (env.ALLOWED_EMAIL_DOMAINS ?? 'cbr-iisc.ac.in')
            .split(',')
            .map((s) =>
                s
                    .trim()
                    .toLowerCase()
                    .replace(/^[@*.]+/, '')
            )
            .filter(Boolean),
        allowSignup: bool(env.ALLOW_SIGNUP, true),
        rateLimitEnabled: bool(env.RATE_LIMIT_ENABLED, true),
    };
};
