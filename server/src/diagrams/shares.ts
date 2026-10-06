import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { ApiError, wrap } from '../errors.js';
import { requireAuth } from '../auth/middleware.js';
import { emailSchema, parse, uuidSchema } from '../validation.js';

const paramId = (v: unknown) => {
    const r = uuidSchema.safeParse(v);
    if (!r.success) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'id: must be a valid UUID');
    }
    return r.data;
};

interface Recipient {
    id: string;
    name: string | null;
    email: string;
}

interface SharedRow {
    id: string;
    name: string;
    diagram_data?: unknown;
    updated_at: Date;
    owner_name: string | null;
    owner_email: string;
    is_owner?: boolean;
}

const toShared = (r: SharedRow) => ({
    id: r.id,
    name: r.name,
    ...(r.diagram_data !== undefined ? { data: r.diagram_data } : {}),
    updatedAt: r.updated_at,
    owner: { name: r.owner_name, email: r.owner_email },
    ...(r.is_owner !== undefined ? { isOwner: r.is_owner } : {}),
});

/** Owner-side management: /api/diagrams/:id/shares (mounted by diagramsRouter). */
export const ownerSharesRouter = (db: Db): Router => {
    const router = Router({ mergeParams: true });

    // Only the owner may see or change who a diagram is shared with. Anything
    // else is a 404 so existence of other people's diagrams is not revealed.
    const assertOwner = async (diagramId: string, userId: string) => {
        const { rows } = await db.query(
            'SELECT 1 FROM diagrams WHERE id = $1 AND user_id = $2',
            [diagramId, userId]
        );
        if (rows.length === 0) {
            throw new ApiError(404, 'NOT_FOUND', 'Diagram not found.');
        }
    };

    router.get(
        '/',
        wrap(async (req, res) => {
            const id = paramId(req.params.id);
            await assertOwner(id, req.user!.id);
            const { rows } = await db.query<Recipient>(
                `SELECT u.id, u.name, u.email
                   FROM diagram_shares s JOIN users u ON u.id = s.user_id
                  WHERE s.diagram_id = $1 ORDER BY s.created_at`,
                [id]
            );
            const link = await db.query<{ link_shared: boolean }>(
                'SELECT link_shared FROM diagrams WHERE id = $1',
                [id]
            );
            res.json({
                shares: rows,
                linkEnabled: link.rows[0]?.link_shared === true,
            });
        })
    );

    // Turn "anyone with the link (signed in) can view" on or off.
    router.put(
        '/link',
        wrap(async (req, res) => {
            const id = paramId(req.params.id);
            const { enabled } = parse(
                z.object({ enabled: z.boolean() }),
                req.body
            );
            const { rowCount } = await db.query(
                'UPDATE diagrams SET link_shared = $3 WHERE id = $1 AND user_id = $2',
                [id, req.user!.id, enabled]
            );
            if (!rowCount) {
                throw new ApiError(404, 'NOT_FOUND', 'Diagram not found.');
            }
            res.json({ linkEnabled: enabled });
        })
    );

    router.post(
        '/',
        wrap(async (req, res) => {
            const id = paramId(req.params.id);
            const { email } = parse(z.object({ email: emailSchema }), req.body);
            await assertOwner(id, req.user!.id);

            if (email === req.user!.email) {
                throw new ApiError(
                    422,
                    'VALIDATION_ERROR',
                    'You already own this diagram.'
                );
            }
            const { rows } = await db.query<Recipient>(
                'SELECT id, name, email FROM users WHERE email = $1',
                [email]
            );
            if (!rows[0]) {
                throw new ApiError(
                    404,
                    'USER_NOT_FOUND',
                    'No account exists with that email.'
                );
            }
            await db
                .query(
                    'INSERT INTO diagram_shares (diagram_id, user_id) VALUES ($1, $2)',
                    [id, rows[0].id]
                )
                .catch((err) => {
                    // Already shared: treat as success (idempotent).
                    if (err?.code !== '23505') throw err;
                });
            res.status(201).json({ share: rows[0] });
        })
    );

    router.delete(
        '/:userId',
        wrap(async (req, res) => {
            const id = paramId(req.params.id);
            await assertOwner(id, req.user!.id);
            await db.query(
                'DELETE FROM diagram_shares WHERE diagram_id = $1 AND user_id = $2',
                [id, paramId(req.params.userId)]
            );
            res.status(204).end();
        })
    );

    return router;
};

/** Recipient side: /api/shared. Strictly read-only. */
export const sharedWithMeRouter = (db: Db, config: Config): Router => {
    const router = Router();
    router.use(requireAuth(db, config));

    router.get(
        '/',
        wrap(async (req, res) => {
            const { rows } = await db.query<SharedRow>(
                `SELECT d.id, d.name, d.updated_at,
                        o.name AS owner_name, o.email AS owner_email
                   FROM diagram_shares s
                   JOIN diagrams d ON d.id = s.diagram_id
                   JOIN users o ON o.id = d.user_id
                  WHERE s.user_id = $1
                  ORDER BY d.updated_at DESC`,
                [req.user!.id]
            );
            res.json({ diagrams: rows.map(toShared) });
        })
    );

    router.get(
        '/:id',
        wrap(async (req, res) => {
            const { rows } = await db.query<SharedRow>(
                `SELECT d.id, d.name, d.diagram_data, d.updated_at,
                        o.name AS owner_name, o.email AS owner_email,
                        (d.user_id = $2) AS is_owner
                   FROM diagrams d
                   JOIN users o ON o.id = d.user_id
                   LEFT JOIN diagram_shares s
                          ON s.diagram_id = d.id AND s.user_id = $2
                  WHERE d.id = $1
                    AND (d.link_shared = TRUE OR d.user_id = $2
                         OR s.user_id IS NOT NULL)`,
                [paramId(req.params.id), req.user!.id]
            );
            if (!rows[0]) {
                throw new ApiError(404, 'NOT_FOUND', 'Diagram not found.');
            }
            res.json({ diagram: toShared(rows[0]) });
        })
    );

    // A recipient can remove a diagram from their own "shared with me" list.
    router.delete(
        '/:id',
        wrap(async (req, res) => {
            const { rowCount } = await db.query(
                'DELETE FROM diagram_shares WHERE diagram_id = $1 AND user_id = $2',
                [paramId(req.params.id), req.user!.id]
            );
            if (!rowCount) {
                throw new ApiError(404, 'NOT_FOUND', 'Diagram not found.');
            }
            res.status(204).end();
        })
    );

    return router;
};
