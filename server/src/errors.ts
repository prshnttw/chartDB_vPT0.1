import type { ErrorRequestHandler, RequestHandler } from 'express';

export class ApiError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string
    ) {
        super(message);
    }
}

export const notFoundHandler: RequestHandler = (_req, _res, next) =>
    next(new ApiError(404, 'NOT_FOUND', 'Resource not found.'));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ApiError) {
        res.status(err.status).json({
            error: { code: err.code, message: err.message },
        });
        return;
    }
    // body-parser errors (bad JSON, too large)
    if (err?.type === 'entity.too.large') {
        res.status(413).json({
            error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large.' },
        });
        return;
    }
    if (err?.type === 'entity.parse.failed') {
        res.status(400).json({
            error: { code: 'BAD_REQUEST', message: 'Malformed JSON body.' },
        });
        return;
    }
    console.error(err); // never leaked to the client
    res.status(500).json({
        error: { code: 'INTERNAL', message: 'Something went wrong.' },
    });
};

/** Wrap async handlers so rejections reach errorHandler (Express 4). */
export const wrap =
    (fn: RequestHandler): RequestHandler =>
    (req, res, next) =>
        Promise.resolve(fn(req, res, next)).catch(next);
