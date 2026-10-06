import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { setup, signedUpAgent, validUser } from './helpers.js';

describe('signup', () => {
    it('creates a user, sets an HttpOnly cookie and hides secrets', async () => {
        const { app } = await setup();
        const res = await request(app)
            .post('/api/auth/signup')
            .send(validUser());
        expect(res.status).toBe(201);
        expect(res.body.user).toMatchObject({
            name: 'User 1',
            email: 'user1@lab.cbr-iisc.ac.in',
        });
        expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
        const cookie = res.headers['set-cookie'][0];
        expect(cookie).toMatch(/chartdb_sid=/);
        expect(cookie).toMatch(/HttpOnly/);
        expect(cookie).toMatch(/SameSite=Lax/);
    });

    it('stores an argon2id hash, never the plaintext', async () => {
        const { app, pool } = await setup();
        await request(app).post('/api/auth/signup').send(validUser());
        const { rows } = await pool.query<{ password_hash: string }>(
            'SELECT password_hash FROM users'
        );
        expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
        expect(rows[0].password_hash).not.toContain('correct-horse-9');
    });

    it('normalizes email and rejects duplicates case-insensitively (409)', async () => {
        const { app } = await setup();
        await request(app).post('/api/auth/signup').send(validUser());
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ ...validUser(), email: ' USER1@Lab.CBR-IISC.ac.in ' });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it.each([
        ['invalid email', { email: 'nope' }],
        ['short password', { password: 'abc1' }],
        ['password without digit', { password: 'onlyletterspassword' }],
        ['missing name', { name: undefined }],
        ['missing password', { password: undefined }],
    ])('rejects %s with 422', async (_label, patch) => {
        const { app } = await setup();
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ ...validUser(), ...patch });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('only allows *.cbr-iisc.ac.in emails', async () => {
        const { app } = await setup();
        const bad = await request(app)
            .post('/api/auth/signup')
            .send({ ...validUser(), email: 'x@gmail.com' });
        expect(bad.status).toBe(403);
        expect(bad.body.error.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');

        const lookalike = await request(app)
            .post('/api/auth/signup')
            .send({ ...validUser(), email: 'x@evilcbr-iisc.ac.in' });
        expect(lookalike.status).toBe(403);

        const ok = await request(app)
            .post('/api/auth/signup')
            .send({ ...validUser(), email: 'x@cbr-iisc.ac.in' });
        expect(ok.status).toBe(201);
    });

    it('can be disabled with ALLOW_SIGNUP=false', async () => {
        const { app } = await setup({ ALLOW_SIGNUP: 'false' });
        const res = await request(app)
            .post('/api/auth/signup')
            .send(validUser());
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('SIGNUP_DISABLED');
    });
});

describe('login', () => {
    it('logs in with the correct password and creates a session', async () => {
        const { app, pool } = await setup();
        await request(app).post('/api/auth/signup').send(validUser());
        const { email, password } = validUser();
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email, password });
        expect(res.status).toBe(200);
        expect(res.body.user.email).toBe(email);
        const { rows } = await pool.query('SELECT * FROM sessions');
        expect(rows.length).toBe(2); // signup + login
    });

    it('stores only a hash of the session token', async () => {
        const { app, pool } = await setup();
        const signup = await request(app)
            .post('/api/auth/signup')
            .send(validUser());
        const token = /chartdb_sid=([^;]+)/.exec(
            signup.headers['set-cookie'][0]
        )![1];
        const { rows } = await pool.query<{ token_hash: string }>(
            'SELECT token_hash FROM sessions'
        );
        expect(rows[0].token_hash).not.toBe(token);
        expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns the same generic 401 for wrong password and unknown email', async () => {
        const { app } = await setup();
        await request(app).post('/api/auth/signup').send(validUser());
        const wrong = await request(app)
            .post('/api/auth/login')
            .send({ email: validUser().email, password: 'wrong-password-1' });
        const unknown = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'ghost@cbr-iisc.ac.in',
                password: 'wrong-password-1',
            });
        expect(wrong.status).toBe(401);
        expect(unknown.status).toBe(401);
        expect(wrong.body).toEqual(unknown.body);
        expect(wrong.body.error.message).toBe('Invalid email or password.');
    });
});

describe('me / logout', () => {
    it('/me returns the user when authenticated', async () => {
        const { app } = await setup();
        const agent = await signedUpAgent(app);
        const res = await agent.get('/api/auth/me');
        expect(res.status).toBe(200);
        expect(res.body.user.email).toBe(validUser().email);
    });

    it('/me is 401 when unauthenticated', async () => {
        const { app } = await setup();
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
    });

    it('logout deletes the session, clears the cookie and blocks protected routes', async () => {
        const { app, pool } = await setup();
        const agent = await signedUpAgent(app);
        const res = await agent.post('/api/auth/logout');
        expect(res.status).toBe(200);
        expect(res.headers['set-cookie'][0]).toMatch(/chartdb_sid=;/);
        const { rows } = await pool.query('SELECT * FROM sessions');
        expect(rows.length).toBe(0);
        expect((await agent.get('/api/auth/me')).status).toBe(401);
        expect((await agent.get('/api/diagrams')).status).toBe(401);
    });

    it('rejects an expired session', async () => {
        const { app, pool } = await setup();
        const agent = await signedUpAgent(app);
        await pool.query('UPDATE sessions SET expires_at = $1', [
            new Date(Date.now() - 1000),
        ]);
        expect((await agent.get('/api/auth/me')).status).toBe(401);
    });
});

describe('csrf / origin guard', () => {
    it('rejects state-changing requests from a foreign origin', async () => {
        const { app } = await setup();
        const res = await request(app)
            .post('/api/auth/login')
            .set('Origin', 'https://evil.example')
            .send({ email: 'a@cbr-iisc.ac.in', password: 'x' });
        expect(res.status).toBe(403);
    });

    it('accepts the configured frontend origin', async () => {
        const { app } = await setup();
        const res = await request(app)
            .post('/api/auth/login')
            .set('Origin', 'http://localhost:5173')
            .send({ email: 'a@cbr-iisc.ac.in', password: 'x' });
        expect(res.status).toBe(401);
    });
});
