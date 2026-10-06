import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ReactFlowProvider } from '@xyflow/react';
import { ArrowLeft, Eye } from 'lucide-react';
import { DiffProvider } from '@/context/diff-context/diff-provider';
import { ChartDBProvider } from '@/context/chartdb-context/chartdb-provider';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import { ApiError } from '@/lib/api/http';
import { sharesApi, type SharedDiagram } from '@/lib/api/shares-api';
import { APP_NAME } from '@/lib/branding';
import type { Diagram } from '@/lib/domain/diagram';
import { Canvas } from '../editor-page/canvas/canvas';

const toDiagram = (d: SharedDiagram): Diagram => ({
    ...d.data,
    id: d.id,
    name: d.name,
    createdAt: new Date(d.data.createdAt),
    updatedAt: new Date(d.data.updatedAt),
});

const SharedDiagramView: React.FC = () => {
    const { diagramId } = useParams<{ diagramId: string }>();
    const [shared, setShared] = useState<SharedDiagram | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!diagramId) return;
        setShared(null);
        setError(null);
        sharesApi
            .getShared(diagramId)
            .then(setShared)
            .catch((e) =>
                setError(
                    e instanceof ApiError && e.status === 404
                        ? 'Diagram not found, or it is no longer shared with you.'
                        : 'Could not load this diagram.'
                )
            );
    }, [diagramId]);

    if (error) {
        return (
            <main className="flex h-screen flex-col items-center justify-center gap-3">
                <p role="alert">{error}</p>
                <Link to="/shared" className="text-sm underline">
                    Back to shared diagrams
                </Link>
            </main>
        );
    }
    if (!shared) {
        return (
            <div
                className="flex h-screen items-center justify-center text-muted-foreground"
                role="status"
            >
                Loading diagram...
            </div>
        );
    }

    const diagram = toDiagram(shared);

    return (
        <div className="flex h-screen flex-col">
            <Helmet>
                <title>{`${shared.name} (view only) - ${APP_NAME}`}</title>
            </Helmet>
            <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
                <Link
                    to="/shared"
                    aria-label="Back to shared diagrams"
                    className="text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="size-4" />
                </Link>
                <span className="truncate font-medium">{shared.name}</span>
                <span className="hidden truncate text-sm text-muted-foreground sm:inline">
                    shared by {shared.owner.name ?? shared.owner.email}
                </span>
                <span className="ml-auto inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs text-muted-foreground">
                    <Eye className="size-3" /> View only
                </span>
            </header>
            <div className="min-h-0 flex-1">
                <DiffProvider>
                    <ChartDBProvider diagram={diagram} readonly>
                        <Canvas initialTables={diagram.tables ?? []} />
                    </ChartDBProvider>
                </DiffProvider>
            </div>
        </div>
    );
};

export const SharedDiagramPage: React.FC = () => (
    <LocalConfigProvider>
        <ThemeProvider>
            <ReactFlowProvider>
                <SharedDiagramView />
            </ReactFlowProvider>
        </ThemeProvider>
    </LocalConfigProvider>
);
