import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import type { Diagram } from '@/lib/domain/diagram';
import { DatabaseType } from '@/lib/domain/database-type';
import { ApiError } from '@/lib/api/http';

const state = vi.hoisted(() => ({
    currentDiagram: undefined as unknown,
    storage: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('@/hooks/use-chartdb', () => ({
    useChartDB: () => ({ currentDiagram: state.currentDiagram }),
}));
vi.mock('@/hooks/use-storage', () => ({ useStorage: () => state.storage }));
vi.mock('@/lib/api/diagrams-api', () => ({
    diagramsApi: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
    },
}));

import { diagramsApi } from '@/lib/api/diagrams-api';
import { DiagramSyncProvider } from '../diagram-sync-provider';
import { useDiagramSync } from '@/hooks/use-diagram-sync';
import type { DiagramSyncContext } from '../diagram-sync-context';

const api = vi.mocked(diagramsApi);

const diagram = (id: string, updatedAt: number, name = id): Diagram => ({
    id,
    name,
    databaseType: DatabaseType.POSTGRESQL,
    tables: [],
    createdAt: new Date(1000),
    updatedAt: new Date(updatedAt),
});

const remote = (id: string, updatedAt: number, name = id) => {
    const iso = new Date(updatedAt).toISOString();
    const created = new Date(1000).toISOString();
    return {
        id,
        name,
        createdAt: created,
        updatedAt: iso,
        data: {
            ...diagram(id, updatedAt, name),
            createdAt: created,
            updatedAt: iso,
        },
    };
};

let sync: DiagramSyncContext;
const Probe = () => {
    sync = useDiagramSync();
    return null;
};
const tree = () => (
    <DiagramSyncProvider>
        <Probe />
    </DiagramSyncProvider>
);

beforeEach(() => {
    vi.resetAllMocks();
    state.currentDiagram = undefined;
    state.storage = {
        listDiagrams: vi.fn().mockResolvedValue([]),
        getDiagram: vi.fn(),
        addDiagram: vi.fn().mockResolvedValue(undefined),
        deleteDiagram: vi.fn().mockResolvedValue(undefined),
    };
});

afterEach(() => vi.useRealTimers());

describe('pullAll', () => {
    it('downloads diagrams that exist only on the server', async () => {
        const r = remote('r1', 5000, 'Remote');
        api.list.mockResolvedValue([r]);
        api.get.mockResolvedValue(r as never);
        render(tree());
        await act(() => sync.pullAll());
        const added = state.storage.addDiagram.mock.calls[0][0].diagram;
        expect(added.id).toBe('r1');
        expect(added.updatedAt).toBeInstanceOf(Date);
        expect(sync.status).toBe('synced');
    });

    it('replaces a stale local copy without deleting it on the server', async () => {
        state.storage.listDiagrams.mockResolvedValue([diagram('r1', 1000)]);
        const r = remote('r1', 5000);
        api.list.mockResolvedValue([r]);
        api.get.mockResolvedValue(r as never);
        render(tree());
        await act(() => sync.pullAll());
        expect(state.storage.deleteDiagram).toHaveBeenCalledWith('r1', {
            localOnly: true,
        });
        expect(api.remove).not.toHaveBeenCalled();
    });

    it('uploads local-only diagrams', async () => {
        const local = diagram('l1', 2000);
        state.storage.listDiagrams.mockResolvedValue([local]);
        state.storage.getDiagram.mockResolvedValue(local);
        api.list.mockResolvedValue([]);
        api.create.mockResolvedValue({} as never);
        render(tree());
        await act(() => sync.pullAll());
        expect(api.create).toHaveBeenCalledWith(local);
    });

    it('never rejects and reports an error status when offline', async () => {
        api.list.mockRejectedValue(new ApiError(0, 'NETWORK', 'offline'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(tree());
        await act(() => sync.pullAll());
        expect(sync.status).toBe('error');
        spy.mockRestore();
    });
});

describe('saving the open diagram', () => {
    it('saveNow pushes the current diagram', async () => {
        api.create.mockResolvedValue({} as never);
        api.update.mockResolvedValue({} as never);
        state.currentDiagram = diagram('d1', 1000);
        render(tree());
        await act(async () => {}); // let the initial create settle
        await act(() => sync.saveNow());
        expect(api.update).toHaveBeenCalledTimes(1);
        expect(sync.status).toBe('synced');
    });

    it('autosave is debounced and only fires after a real change', async () => {
        vi.useFakeTimers();
        api.create.mockResolvedValue({} as never);
        api.update.mockResolvedValue({} as never);
        state.currentDiagram = diagram('d1', 1000);
        const { rerender } = render(tree());
        // First sight of an unknown diagram creates it once.
        await act(() => vi.advanceTimersByTimeAsync(10));
        expect(api.create).toHaveBeenCalledTimes(1);

        // Three quick edits -> a single update after the debounce.
        for (const t of [2000, 3000, 4000]) {
            state.currentDiagram = diagram('d1', t);
            rerender(tree());
            await act(() => vi.advanceTimersByTimeAsync(200));
        }
        expect(api.update).not.toHaveBeenCalled();
        await act(() => vi.advanceTimersByTimeAsync(1500));
        expect(api.update).toHaveBeenCalledTimes(1);
        expect(api.update.mock.calls[0][0].updatedAt.getTime()).toBe(4000);
    });
});
