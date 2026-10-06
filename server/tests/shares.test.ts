import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { diagramPayload, setup, signedUpAgent, validUser } from './helpers.js';

// Users: 1 = owner, 2 = recipient, 3 = outsider.
const scenario = async () => {
    const { app, pool } = await setup();
    const owner = await signedUpAgent(app, 1);
    const viewer = await signedUpAgent(app, 2);
    const outsider = await signedUpAgent(app, 3);
    const id = (
        await owner.post('/api/diagrams').send(diagramPayload('Shared'))
    ).body.diagram.id as string;
    return { app, pool, owner, viewer, outsider, id };
};

describe('sharing a diagram (view only)', () => {
    it('requires authentication', async () => {
        const { app } = await setup();
        const id = randomUUID();
        for (const [m, url] of [
            ['get', `/api/diagrams/${id}/shares`],
            ['post', `/api/diagrams/${id}/shares`],
            ['get', '/api/shared'],
            ['get', `/api/shared/${id}`],
        ] as const) {
            expect((await request(app)[m](url).send({})).status).toBe(401);
        }
    });

    it('owner shares by email; recipient lists and reads it', async () => {
        const { owner, viewer, id } = await scenario();
        const res = await owner
            .post(`/api/diagrams/${id}/shares`)
            .send({ email: validUser(2).email.toUpperCase() });
        expect(res.status).toBe(201);
        expect(res.body.share.email).toBe(validUser(2).email);
        expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

        const list = await viewer.get('/api/shared');
        expect(list.body.diagrams).toHaveLength(1);
        expect(list.body.diagrams[0]).toMatchObject({
            id,
            name: 'Shared',
            owner: { email: validUser(1).email },
        });
        expect(list.body.diagrams[0].data).toBeUndefined();

        const read = await viewer.get(`/api/shared/${id}`);
        expect(read.status).toBe(200);
        expect(read.body.diagram.data.tables[0].name).toBe('users');
    });

    it('recipient cannot modify, delete, re-share or manage shares', async () => {
        const { owner, viewer, id } = await scenario();
        await owner
            .post(`/api/diagrams/${id}/shares`)
            .send({ email: validUser(2).email });

        expect(
            (await viewer.put(`/api/diagrams/${id}`).send(diagramPayload('X')))
                .status
        ).toBe(404);
        expect((await viewer.delete(`/api/diagrams/${id}`)).status).toBe(404);
        expect((await viewer.get(`/api/diagrams/${id}`)).status).toBe(404);
        expect((await viewer.get(`/api/diagrams/${id}/shares`)).status).toBe(
            404
        );
        expect(
            (
                await viewer
                    .post(`/api/diagrams/${id}/shares`)
                    .send({ email: validUser(3).email })
            ).status
        ).toBe(404);

        // Unchanged for the owner.
        const still = await owner.get(`/api/diagrams/${id}`);
        expect(still.body.diagram.name).toBe('Shared');
    });

    it('an outsider cannot read a diagram that was not shared with them', async () => {
        const { owner, viewer, outsider, id } = await scenario();
        await owner
            .post(`/api/diagrams/${id}/shares`)
            .send({ email: validUser(2).email });
        expect((await outsider.get(`/api/shared/${id}`)).status).toBe(404);
        expect((await outsider.get('/api/shared')).body.diagrams).toHaveLength(
            0
        );
        expect((await viewer.get(`/api/shared/${id}`)).status).toBe(200);
    });

    it('owner can list and revoke; access disappears immediately', async () => {
        const { owner, viewer, id } = await scenario();
        const target = (
            await owner
                .post(`/api/diagrams/${id}/shares`)
                .send({ email: validUser(2).email })
        ).body.share;
        const shares = await owner.get(`/api/diagrams/${id}/shares`);
        expect(shares.body.shares.map((s: { id: string }) => s.id)).toEqual([
            target.id,
        ]);

        expect(
            (await owner.delete(`/api/diagrams/${id}/shares/${target.id}`))
                .status
        ).toBe(204);
        expect((await viewer.get(`/api/shared/${id}`)).status).toBe(404);
    });

    it('sharing twice is idempotent', async () => {
        const { owner, id } = await scenario();
        const body = { email: validUser(2).email };
        expect(
            (await owner.post(`/api/diagrams/${id}/shares`).send(body)).status
        ).toBe(201);
        expect(
            (await owner.post(`/api/diagrams/${id}/shares`).send(body)).status
        ).toBe(201);
        expect(
            (await owner.get(`/api/diagrams/${id}/shares`)).body.shares
        ).toHaveLength(1);
    });

    it('rejects unknown emails, self-share and bad input', async () => {
        const { owner, id } = await scenario();
        const url = `/api/diagrams/${id}/shares`;
        const unknown = await owner
            .post(url)
            .send({ email: 'ghost@cbr-iisc.ac.in' });
        expect(unknown.status).toBe(404);
        expect(unknown.body.error.code).toBe('USER_NOT_FOUND');
        expect(
            (await owner.post(url).send({ email: validUser(1).email })).status
        ).toBe(422);
        expect((await owner.post(url).send({ email: 'nope' })).status).toBe(
            422
        );
        expect(
            (
                await owner.post(`/api/diagrams/${randomUUID()}/shares`).send({
                    email: validUser(2).email,
                })
            ).status
        ).toBe(404);
    });

    it('recipient can leave; deleting the diagram removes shares', async () => {
        const { owner, viewer, pool, id } = await scenario();
        await owner
            .post(`/api/diagrams/${id}/shares`)
            .send({ email: validUser(2).email });
        expect((await viewer.delete(`/api/shared/${id}`)).status).toBe(204);
        expect((await viewer.get(`/api/shared/${id}`)).status).toBe(404);

        await owner
            .post(`/api/diagrams/${id}/shares`)
            .send({ email: validUser(2).email });
        await owner.delete(`/api/diagrams/${id}`);
        const { rows } = await pool.query('SELECT * FROM diagram_shares');
        expect(rows).toHaveLength(0);
        expect((await viewer.get(`/api/shared/${id}`)).status).toBe(404);
    });
});

describe('"anyone with the link" access', () => {
    it('is off by default: signed-in strangers get 404', async () => {
        const { outsider, id, owner } = await scenario();
        expect((await outsider.get(`/api/shared/${id}`)).status).toBe(404);
        expect(
            (await owner.get(`/api/diagrams/${id}/shares`)).body.linkEnabled
        ).toBe(false);
    });

    it('when enabled, any signed-in user can view but not edit', async () => {
        const { outsider, owner, id } = await scenario();
        const on = await owner
            .put(`/api/diagrams/${id}/shares/link`)
            .send({ enabled: true });
        expect(on.status).toBe(200);
        expect(on.body.linkEnabled).toBe(true);

        const read = await outsider.get(`/api/shared/${id}`);
        expect(read.status).toBe(200);
        expect(read.body.diagram.data.tables[0].name).toBe('users');
        expect(read.body.diagram.isOwner).toBe(false);

        expect(
            (
                await outsider
                    .put(`/api/diagrams/${id}`)
                    .send(diagramPayload('X'))
            ).status
        ).toBe(404);
        expect((await outsider.delete(`/api/diagrams/${id}`)).status).toBe(404);
    });

    it('requires login even when enabled', async () => {
        const { app, owner, id } = await scenario();
        await owner
            .put(`/api/diagrams/${id}/shares/link`)
            .send({ enabled: true });
        expect((await request(app).get(`/api/shared/${id}`)).status).toBe(401);
    });

    it('turning it off revokes access immediately', async () => {
        const { outsider, owner, id } = await scenario();
        const url = `/api/diagrams/${id}/shares/link`;
        await owner.put(url).send({ enabled: true });
        expect((await outsider.get(`/api/shared/${id}`)).status).toBe(200);
        await owner.put(url).send({ enabled: false });
        expect((await outsider.get(`/api/shared/${id}`)).status).toBe(404);
    });

    it('explicit email shares keep working when the link is off', async () => {
        const { viewer, owner, id } = await scenario();
        await owner
            .post(`/api/diagrams/${id}/shares`)
            .send({ email: validUser(2).email });
        expect((await viewer.get(`/api/shared/${id}`)).status).toBe(200);
    });

    it('only the owner can toggle it', async () => {
        const { outsider, owner, id } = await scenario();
        const url = `/api/diagrams/${id}/shares/link`;
        expect((await outsider.put(url).send({ enabled: true })).status).toBe(
            404
        );
        expect((await owner.put(url).send({ enabled: 'yes' })).status).toBe(
            422
        );
        expect((await outsider.get(`/api/shared/${id}`)).status).toBe(404);
    });

    it('the owner opening their own link is flagged as owner', async () => {
        const { owner, id } = await scenario();
        const res = await owner.get(`/api/shared/${id}`);
        expect(res.status).toBe(200);
        expect(res.body.diagram.isOwner).toBe(true);
    });
});
