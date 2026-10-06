import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/button/button';
import { ApiError } from '@/lib/api/http';
import { sharesApi, type SharedDiagramSummary } from '@/lib/api/shares-api';
import { APP_NAME } from '@/lib/branding';
import { Helmet } from 'react-helmet-async';

export const SharedListPage: React.FC = () => {
    const [items, setItems] = useState<SharedDiagramSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        sharesApi
            .listSharedWithMe()
            .then(setItems)
            .catch((e) =>
                setError(e instanceof ApiError ? e.message : 'Could not load.')
            );
    }, []);

    const leave = async (id: string) => {
        await sharesApi.leave(id).catch(() => undefined);
        setItems((list) => list?.filter((d) => d.id !== id) ?? null);
    };

    return (
        <main className="mx-auto max-w-2xl px-4 py-10">
            <Helmet>
                <title>{`Shared with me - ${APP_NAME}`}</title>
            </Helmet>
            <Link
                to="/"
                className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="size-4" /> Back to editor
            </Link>
            <h1 className="mb-1 text-xl font-semibold tracking-tight">
                Shared with me
            </h1>
            <p className="mb-6 text-sm text-muted-foreground">
                Diagrams other people shared with you. View only.
            </p>

            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : items === null ? (
                <p className="text-sm text-muted-foreground" role="status">
                    Loading...
                </p>
            ) : items.length === 0 ? (
                <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                    Nothing has been shared with you yet.
                </div>
            ) : (
                <ul className="divide-y rounded-lg border">
                    {items.map((d) => (
                        <li
                            key={d.id}
                            className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                            <Link
                                to={`/shared/${d.id}`}
                                className="min-w-0 flex-1"
                            >
                                <div className="truncate font-medium">
                                    {d.name}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                    {d.owner.name ?? d.owner.email} &middot;
                                    updated{' '}
                                    {new Date(d.updatedAt).toLocaleString()}
                                </div>
                            </Link>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void leave(d.id)}
                            >
                                Remove
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
};
