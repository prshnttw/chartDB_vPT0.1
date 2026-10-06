import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { diagramPayload, setup, signedUpAgent } from './helpers.js';

describe('diagrams', () => {
    it('requires authentication on every endpoint', async () => {
        const { app } = await setup();
        const id = randomUUID();
        for (const [method, url] of [
            ['get', '/api/diagrams'],
            ['post', '/api/diagrams'],
            ['get', `/api/diagrams/${id}`],
            ['put', `/api/diagrams/${id}`],
            ['delete', `/api/diagrams/${id}`],
        ] as const) {
            const res = await request(app)[method](url).send(diagramPayload());
            expect(res.status, `${method} ${url}`).toBe(401);
        }
    });

    it('creates, lists, reads, updates and deletes own diagram', async () => {
        const { app } = await setup();
        const a = await signedUpAgent(app, 1);

        const created = await a
            .post('/api/diagrams')
            .send(diagramPayload('One'));
        expect(created.status).toBe(201);
        const id = created.body.diagram.id;

        const list = await a.get('/api/diagrams');
        expect(list.body.diagrams).toHaveLength(1);
        expect(list.body.diagrams[0]).toMatchObject({ id, name: 'One' });
        expect(list.body.diagrams[0].data).toBeUndefined();

        const read = await a.get(`/api/diagrams/${id}`);
        expect(read.status).toBe(200);
        expect(read.body.diagram.data.tables[0].name).toBe('users');

        const updated = await a
            .put(`/api/diagrams/${id}`)
            .send(diagramPayload('Renamed'));
        expect(updated.status).toBe(200);
        expect(updated.body.diagram.name).toBe('Renamed');

        expect((await a.delete(`/api/diagrams/${id}`)).status).toBe(204);
        expect((await a.get(`/api/diagrams/${id}`)).status).toBe(404);
    });

    it('accepts a client-supplied id and rejects duplicates with 409', async () => {
        const { app } = await setup();
        const a = await signedUpAgent(app, 1);
        const id = randomUUID();
        expect(
            (await a.post('/api/diagrams').send({ ...diagramPayload(), id }))
                .status
        ).toBe(201);
        expect(
            (await a.post('/api/diagrams').send({ ...diagramPayload(), id }))
                .status
        ).toBe(409);
    });

    it('ignores a user_id supplied in the body', async () => {
        const { app, pool } = await setup();
        const a = await signedUpAgent(app, 1);
        await signedUpAgent(app, 2);
        const { rows: users } = await pool.query<{ id: string; email: string }>(
            'SELECT id, email FROM users ORDER BY email'
        );
        const victim = users[1].id;
        const res = await a
            .post('/api/diagrams')
            .send({ ...diagramPayload(), user_id: victim, userId: victim });
        expect(res.status).toBe(201);
        const { rows } = await pool.query<{ user_id: string }>(
            'SELECT user_id FROM diagrams'
        );
        expect(rows[0].user_id).toBe(users[0].id);
    });

    it('rejects stale writes with 409 and bad input with 422', async () => {
        const { app } = await setup();
        const a = await signedUpAgent(app, 1);
        const id = (await a.post('/api/diagrams').send(diagramPayload())).body
            .diagram.id;

        const stale = diagramPayload();
        stale.data.updatedAt = new Date(Date.now() - 3600_000).toISOString();
        expect((await a.put(`/api/diagrams/${id}`).send(stale)).status).toBe(
            409
        );

        expect((await a.get('/api/diagrams/not-a-uuid')).status).toBe(422);
        expect(
            (await a.post('/api/diagrams').send({ name: '', data: {} })).status
        ).toBe(422);
    });

    describe('authorization boundaries', () => {
        it("user B cannot read, update or delete user A's diagram", async () => {
            const { app } = await setup();
            const a = await signedUpAgent(app, 1);
            const b = await signedUpAgent(app, 2);
            const id = (
                await a.post('/api/diagrams').send(diagramPayload('A1'))
            ).body.diagram.id;

            expect((await b.get(`/api/diagrams/${id}`)).status).toBe(404);
            expect(
                (
                    await b
                        .put(`/api/diagrams/${id}`)
                        .send(diagramPayload('Hacked'))
                ).status
            ).toBe(404);
            expect((await b.delete(`/api/diagrams/${id}`)).status).toBe(404);
            expect((await b.get('/api/diagrams')).body.diagrams).toHaveLength(
                0
            );

            // Untouched for the owner.
            const still = await a.get(`/api/diagrams/${id}`);
            expect(still.body.diagram.name).toBe('A1');
        });

        it("user B cannot take over A's diagram by POSTing the same id", async () => {
            const { app } = await setup();
            const a = await signedUpAgent(app, 1);
            const b = await signedUpAgent(app, 2);
            const id = (
                await a.post('/api/diagrams').send(diagramPayload('A1'))
            ).body.diagram.id;
            const res = await b
                .post('/api/diagrams')
                .send({ ...diagramPayload('B'), id });
            expect(res.status).toBe(409);
            expect((await a.get(`/api/diagrams/${id}`)).body.diagram.name).toBe(
                'A1'
            );
        });
    });
});
