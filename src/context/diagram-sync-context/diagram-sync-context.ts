import { createContext } from 'react';
import { emptyFn } from '@/lib/utils';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface DiagramSyncContext {
    status: SyncStatus;
    /** Reconcile IndexedDB with the server. Never rejects. */
    pullAll: () => Promise<void>;
    /** Push the open diagram right now (the "Save" action). */
    saveNow: () => Promise<void>;
}

export const diagramSyncContext = createContext<DiagramSyncContext>({
    status: 'idle',
    pullAll: emptyFn,
    saveNow: emptyFn,
});
