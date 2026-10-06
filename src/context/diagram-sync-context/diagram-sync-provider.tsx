import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useChartDB } from '@/hooks/use-chartdb';
import { useStorage } from '@/hooks/use-storage';
import { ApiError } from '@/lib/api/http';
import { diagramsApi, type RemoteDiagram } from '@/lib/api/diagrams-api';
import type { Diagram } from '@/lib/domain/diagram';
import {
    diagramSyncContext,
    type DiagramSyncContext,
    type SyncStatus,
} from './diagram-sync-context';

const AUTOSAVE_DEBOUNCE_MS = 1000;

const fromRemote = (r: RemoteDiagram): Diagram => ({
    ...r.data,
    id: r.id,
    name: r.name,
    createdAt: new Date(r.data.createdAt ?? r.createdAt),
    updatedAt: new Date(r.data.updatedAt ?? r.updatedAt),
});

/**
 * Keeps the server (PostgreSQL) copy of each diagram in step with the local
 * IndexedDB working copy the editor uses. Last write wins by updatedAt.
 */
export const DiagramSyncProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const { currentDiagram } = useChartDB();
    const storage = useStorage();
    // The storage context value changes identity every render; keep callbacks stable.
    const storageRef = useRef(storage);
    storageRef.current = storage;
    const [status, setStatus] = useState<SyncStatus>('idle');

    // id -> updatedAt (ms) of the version the server is known to hold.
    const known = useRef(new Map<string, number>());
    // id -> serialized snapshot last seen/synced, to detect real edits.
    const snapshots = useRef(new Map<string, string>());
    const pullPromise = useRef<Promise<void> | null>(null);

    const push = useCallback(async (diagram: Diagram) => {
        setStatus('syncing');
        try {
            if (known.current.has(diagram.id)) {
                try {
                    await diagramsApi.update(diagram);
                } catch (e) {
                    if (!(e instanceof ApiError) || e.status !== 404) throw e;
                    await diagramsApi.create(diagram);
                }
            } else {
                try {
                    await diagramsApi.create(diagram);
                } catch (e) {
                    if (!(e instanceof ApiError) || e.status !== 409) throw e;
                    await diagramsApi.update(diagram);
                }
            }
            known.current.set(diagram.id, diagram.updatedAt.getTime());
            setStatus('synced');
        } catch (e) {
            // 409 on update = server has a newer version; next pull resolves it.
            setStatus(
                e instanceof ApiError && e.status === 409 ? 'synced' : 'error'
            );
        }
    }, []);

    const pullAll = useCallback(() => {
        pullPromise.current ??= (async () => {
            try {
                setStatus('syncing');
                const remote = await diagramsApi.list();
                const locals = await storageRef.current.listDiagrams();
                const remoteIds = new Set(remote.map((r) => r.id));

                for (const r of remote) {
                    const remoteMs = Date.parse(r.updatedAt);
                    known.current.set(r.id, remoteMs);
                    const local = locals.find((l) => l.id === r.id);
                    if (local && local.updatedAt.getTime() >= remoteMs)
                        continue;

                    const full = fromRemote(await diagramsApi.get(r.id));
                    if (local) {
                        await storageRef.current.deleteDiagram(r.id, {
                            localOnly: true,
                        });
                    }
                    await storageRef.current.addDiagram({ diagram: full });
                }

                // Local work the server has never seen (or older than local).
                for (const local of locals) {
                    const remoteMs = known.current.get(local.id);
                    if (
                        !remoteIds.has(local.id) ||
                        (remoteMs !== undefined &&
                            local.updatedAt.getTime() > remoteMs)
                    ) {
                        const full = await storageRef.current.getDiagram(
                            local.id,
                            {
                                includeTables: true,
                                includeRelationships: true,
                                includeDependencies: true,
                                includeAreas: true,
                                includeCustomTypes: true,
                                includeNotes: true,
                            }
                        );
                        if (full) await push(full);
                    }
                }
                setStatus('synced');
            } catch (e) {
                console.error('Diagram sync failed', e);
                setStatus('error');
            }
        })();
        return pullPromise.current;
    }, [push]);

    const saveNow = useCallback(async () => {
        if (!currentDiagram?.id) return;
        snapshots.current.set(
            currentDiagram.id,
            JSON.stringify(currentDiagram)
        );
        await push(currentDiagram);
    }, [currentDiagram, push]);

    // Debounced autosave of the open diagram.
    useEffect(() => {
        const id = currentDiagram?.id;
        if (!id) return;

        const snapshot = JSON.stringify(currentDiagram);
        const prev = snapshots.current.get(id);

        if (prev === undefined) {
            // First sight of this diagram (just loaded or created).
            snapshots.current.set(id, snapshot);
            if (!known.current.has(id)) void push(currentDiagram);
            return;
        }
        if (prev === snapshot) return;

        const timer = setTimeout(() => {
            snapshots.current.set(id, snapshot);
            void push(currentDiagram);
        }, AUTOSAVE_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [currentDiagram, push]);

    const value: DiagramSyncContext = useMemo(
        () => ({ status, pullAll, saveNow }),
        [status, pullAll, saveNow]
    );

    return (
        <diagramSyncContext.Provider value={value}>
            {children}
        </diagramSyncContext.Provider>
    );
};
