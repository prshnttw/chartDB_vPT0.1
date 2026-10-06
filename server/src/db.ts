import pg from 'pg';

/** Minimal surface the app needs; lets tests swap in pg-mem. */
export interface Db {
    query<R = Record<string, unknown>>(
        text: string,
        params?: unknown[]
    ): Promise<{ rows: R[]; rowCount: number | null }>;
}

export interface Pool extends Db {
    connect(): Promise<{
        query: Db['query'];
        release(): void;
    }>;
    end(): Promise<void>;
}

export const createPool = (databaseUrl: string): Pool =>
    new pg.Pool({ connectionString: databaseUrl, max: 10 }) as unknown as Pool;
