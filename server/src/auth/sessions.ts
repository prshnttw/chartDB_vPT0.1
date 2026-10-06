import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db.js';

export interface SessionUser {
    id: string;
    name: string | null;
    email: string;
    role: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Creates a session; returns the raw token (only ever sent in the cookie). */
export const createSession = async (
    db: Db,
    userId: string,
    ttlMs: number
): Promise<{ token: string; expiresAt: Date }> => {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlMs);
    await db.query(
        'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
        [sha256(token), userId, expiresAt]
    );
    return { token, expiresAt };
};

export const findSessionUser = async (
    db: Db,
    token: string
): Promise<SessionUser | null> => {
    const { rows } = await db.query<SessionUser>(
        `SELECT u.id, u.name, u.email, u.role
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > $2`,
        [sha256(token), new Date()]
    );
    return rows[0] ?? null;
};

export const deleteSession = async (db: Db, token: string) => {
    await db.query('DELETE FROM sessions WHERE token_hash = $1', [
        sha256(token),
    ]);
};

export const deleteExpiredSessions = async (db: Db) => {
    await db.query('DELETE FROM sessions WHERE expires_at <= $1', [new Date()]);
};
