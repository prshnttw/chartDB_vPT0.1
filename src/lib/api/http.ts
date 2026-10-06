export class ApiError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string
    ) {
        super(message);
    }
}

// Same-origin by default (Caddy/nginx route /api to the backend, Vite proxies
// it in dev). Override with VITE_API_BASE_URL only for unusual setups.
const BASE = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export const apiFetch = async <T>(
    path: string,
    options: { method?: string; body?: unknown } = {}
): Promise<T> => {
    let res: Response;
    try {
        res = await fetch(`${BASE}/api${path}`, {
            method: options.method ?? 'GET',
            credentials: 'include',
            headers:
                options.body !== undefined
                    ? { 'Content-Type': 'application/json' }
                    : undefined,
            body:
                options.body !== undefined
                    ? JSON.stringify(options.body)
                    : undefined,
        });
    } catch {
        throw new ApiError(0, 'NETWORK', 'Cannot reach the server.');
    }

    if (res.status === 204) return undefined as T;

    const json = await res.json().catch(() => undefined);
    if (!res.ok) {
        throw new ApiError(
            res.status,
            json?.error?.code ?? 'UNKNOWN',
            json?.error?.message ?? 'Something went wrong.'
        );
    }
    return json as T;
};
