import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { ApiError, wrap } from '../errors.js';
import { requireAuth } from '../auth/middleware.js';
import {
    diagramBodySchema,
    diagramCreateSchema,
    parse,
    uuidSchema,
} from '../validation.js';

interface Row {
    id: string;
    name: string;
    diagram_data?: unknown;
    created_at: Date;
    updated_at: Date;
}

const toApi = (r: Row) => ({
    id: r.id,
    name: r.name,
    ...(r.diagram_data !== undefined ? { data: r.diagram_data } : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
});

// The client's own edit time drives last-write-wins sync; clamp to "now" so a
// skewed clock cannot pin a diagram permanently in the future.
const clientUpdatedAt = (data: Record<string, unknown>): Date => {
    const now = Date.now();
    const t =
        typeof data.updatedAt === 'string' ? Date.parse(data.updatedAt) : NaN;
    return new Date(Number.isNaN(t) ? now : Math.min(t, now + 5 * 60 * 1000));
};

const paramId = (v: unknown) => {
    const r = uuidSchema.safeParse(v);
    if (!r.success) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'id: must be a valid UUID');
    }
    return r.data;
};

// Every query below is scoped by user_id taken from the session, never from
// the request, so one user can never reach another user's rows.
export const diagramsRouter = (db: Db, config: Config): Router => {
    const router = Router();
    router.use(requireAuth(db, config));

    router.get(
        '/',
        wrap(async (req, res) => {
            const { rows } = await db.query<Row>(
                `SELECT id, name, created_at, updated_at FROM diagrams
                  WHERE user_id = $1 ORDER BY updated_at DESC`,
                [req.user!.id]
            );
            res.json({ diagrams: rows.map(toApi) });
        })
    );

    router.post(
        '/',
        wrap(async (req, res) => {
            const body = parse(diagramCreateSchema, req.body);
            const { rows } = await db
                .query<Row>(
                    `INSERT INTO diagrams (id, user_id, name, diagram_data, updated_at)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, name, diagram_data, created_at, updated_at`,
                    [
                        body.id ?? randomUUID(),
                        req.user!.id,
                        body.name,
                        JSON.stringify(body.data),
                        clientUpdatedAt(body.data),
                    ]
                )
                .catch((err) => {
                    if (err?.code === '23505') {
                        throw new ApiError(
                            409,
                            'CONFLICT',
                            'Diagram already exists.'
                        );
                    }
                    throw err;
                });
            res.status(201).json({ diagram: toApi(rows[0]) });
        })
    );

    router.get(
        '/:id',
        wrap(async (req, res) => {
            const { rows } = await db.query<Row>(
                `SELECT id, name, diagram_data, created_at, updated_at
                   FROM diagrams WHERE id = $1 AND user_id = $2`,
                [paramId(req.params.id), req.user!.id]
            );
            if (!rows[0]) {
                throw new ApiError(404, 'NOT_FOUND', 'Diagram not found.');
            }
            res.json({ diagram: toApi(rows[0]) });
        })
    );

    router.put(
        '/:id',
        wrap(async (req, res) => {
            const id = paramId(req.params.id);
            const body = parse(diagramBodySchema, req.body);
            const updatedAt = clientUpdatedAt(body.data);
            // Refuse to overwrite a newer version (stale tab / other device).
            const { rows } = await db.query<Row>(
                `UPDATE diagrams
                    SET name = $3, diagram_data = $4, updated_at = $5
                  WHERE id = $1 AND user_id = $2 AND updated_at <= $5
              RETURNING id, name, diagram_data, created_at, updated_at`,
                [
                    id,
                    req.user!.id,
                    body.name,
                    JSON.stringify(body.data),
                    updatedAt,
                ]
            );
            if (rows[0]) {
                res.json({ diagram: toApi(rows[0]) });
                return;
            }
            const exists = await db.query(
                'SELECT 1 FROM diagrams WHERE id = $1 AND user_id = $2',
                [id, req.user!.id]
            );
            if (exists.rows.length === 0) {
                throw new ApiError(404, 'NOT_FOUND', 'Diagram not found.');
            }
            throw new ApiError(
                409,
                'CONFLICT',
                'A newer version of this diagram exists.'
            );
        })
    );

    router.delete(
        '/:id',
        wrap(async (req, res) => {
            const { rowCount } = await db.query(
                'DELETE FROM diagrams WHERE id = $1 AND user_id = $2',
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
