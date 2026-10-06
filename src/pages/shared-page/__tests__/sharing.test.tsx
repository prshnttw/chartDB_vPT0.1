import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { TooltipProvider } from '@/components/tooltip/tooltip';
import { ApiError } from '@/lib/api/http';

vi.mock('@/lib/api/shares-api', () => ({
    sharesApi: {
        listRecipients: vi.fn(),
        share: vi.fn(),
        unshare: vi.fn(),
        listSharedWithMe: vi.fn(),
        getShared: vi.fn(),
        leave: vi.fn(),
    },
}));
vi.mock('@/hooks/use-chartdb', () => ({
    useChartDB: () => ({ currentDiagram: { id: 'd1', name: 'Orders' } }),
}));
const saveNow = vi.fn();
vi.mock('@/hooks/use-diagram-sync', () => ({
    useDiagramSync: () => ({ saveNow }),
}));
// The canvas needs the full editor; the viewer wiring is what we test here.
vi.mock('../../editor-page/canvas/canvas', () => ({
    Canvas: () => <div>CANVAS</div>,
}));

import { sharesApi } from '@/lib/api/shares-api';
import { ShareDialog } from '@/pages/editor-page/top-navbar/share-dialog';
import { SharedListPage } from '../shared-list-page';
import { SharedDiagramPage } from '../shared-diagram-page';
const api = vi.mocked(sharesApi);

const bob = { id: 'u2', name: 'Bob', email: 'bob@cbr-iisc.ac.in' };

beforeEach(() => {
    vi.resetAllMocks();
    saveNow.mockResolvedValue(undefined);
    window.matchMedia ??= vi.fn().mockReturnValue({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
});

describe('ShareDialog', () => {
    const open = async () => {
        render(
            <TooltipProvider>
                <ShareDialog />
            </TooltipProvider>
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Share diagram' })
        );
    };

    it('saves the diagram first, then lists current recipients', async () => {
        api.listRecipients.mockResolvedValue([bob]);
        await open();
        expect(
            await screen.findByText('bob@cbr-iisc.ac.in', { exact: false })
        ).toBeInTheDocument();
        expect(saveNow).toHaveBeenCalled();
        expect(api.listRecipients).toHaveBeenCalledWith('d1');
    });

    it('shares by email and shows the new recipient', async () => {
        api.listRecipients.mockResolvedValue([]);
        api.share.mockResolvedValue(bob);
        await open();
        await userEvent.type(
            await screen.findByLabelText('Email'),
            'bob@cbr-iisc.ac.in'
        );
        await userEvent.click(screen.getByRole('button', { name: 'Share' }));
        expect(await screen.findByText('Bob')).toBeInTheDocument();
        expect(api.share).toHaveBeenCalledWith('d1', 'bob@cbr-iisc.ac.in');
    });

    it('shows the server error for an unknown email', async () => {
        api.listRecipients.mockResolvedValue([]);
        api.share.mockRejectedValue(
            new ApiError(
                404,
                'USER_NOT_FOUND',
                'No account exists with that email.'
            )
        );
        await open();
        await userEvent.type(
            await screen.findByLabelText('Email'),
            'x@cbr-iisc.ac.in'
        );
        await userEvent.click(screen.getByRole('button', { name: 'Share' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'No account exists with that email.'
        );
    });

    it('removes a recipient', async () => {
        api.listRecipients.mockResolvedValue([bob]);
        api.unshare.mockResolvedValue(undefined);
        await open();
        await userEvent.click(
            await screen.findByRole('button', {
                name: 'Remove bob@cbr-iisc.ac.in',
            })
        );
        expect(api.unshare).toHaveBeenCalledWith('d1', 'u2');
        expect(
            await screen.findByText('Not shared with anyone yet.')
        ).toBeInTheDocument();
    });
});

describe('Shared with me', () => {
    const renderList = () =>
        render(
            <HelmetProvider>
                <MemoryRouter>
                    <SharedListPage />
                </MemoryRouter>
            </HelmetProvider>
        );

    it('lists diagrams with their owner', async () => {
        api.listSharedWithMe.mockResolvedValue([
            {
                id: 'd9',
                name: 'Billing',
                updatedAt: new Date().toISOString(),
                owner: { name: 'Alice', email: 'alice@cbr-iisc.ac.in' },
            },
        ]);
        renderList();
        expect(await screen.findByText('Billing')).toBeInTheDocument();
        expect(screen.getByText(/Alice/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Billing/ })).toHaveAttribute(
            'href',
            '/shared/d9'
        );
    });

    it('shows an empty state', async () => {
        api.listSharedWithMe.mockResolvedValue([]);
        renderList();
        expect(
            await screen.findByText('Nothing has been shared with you yet.')
        ).toBeInTheDocument();
    });
});

describe('shared diagram viewer', () => {
    const renderViewer = () =>
        render(
            <HelmetProvider>
                <MemoryRouter initialEntries={['/shared/d9']}>
                    <Routes>
                        <Route
                            path="/shared/:diagramId"
                            element={<SharedDiagramPage />}
                        />
                    </Routes>
                </MemoryRouter>
            </HelmetProvider>
        );

    it('renders the diagram in view-only mode', async () => {
        const iso = new Date().toISOString();
        api.getShared.mockResolvedValue({
            id: 'd9',
            name: 'Billing',
            updatedAt: iso,
            owner: { name: 'Alice', email: 'alice@cbr-iisc.ac.in' },
            data: {
                id: 'x',
                name: 'Billing',
                databaseType: 'postgresql',
                tables: [],
                createdAt: iso,
                updatedAt: iso,
            },
        } as never);
        renderViewer();
        expect(await screen.findByText('CANVAS')).toBeInTheDocument();
        expect(screen.getByText('View only')).toBeInTheDocument();
        expect(screen.getByText(/shared by Alice/)).toBeInTheDocument();
    });

    it('shows a friendly message when access is missing', async () => {
        api.getShared.mockRejectedValue(
            new ApiError(404, 'NOT_FOUND', 'Diagram not found.')
        );
        renderViewer();
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'no longer shared with you'
        );
    });
});
