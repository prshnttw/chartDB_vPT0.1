import React from 'react';
import { Cloud, CloudAlert, Loader2 } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useDiagramSync } from '@/hooks/use-diagram-sync';

const labels = {
    idle: 'Save to server',
    syncing: 'Saving...',
    synced: 'Saved to server',
    error: 'Could not reach server. Click to retry.',
} as const;

/** Autosave status; clicking it saves the open diagram immediately. */
export const SyncStatusBadge: React.FC = () => {
    const { status, saveNow } = useDiagramSync();

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    onClick={() => void saveNow()}
                    aria-label={labels[status]}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {status === 'syncing' ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : status === 'error' ? (
                        <CloudAlert className="size-4 text-destructive" />
                    ) : (
                        <Cloud className="size-4" />
                    )}
                </button>
            </TooltipTrigger>
            <TooltipContent>{labels[status]}</TooltipContent>
        </Tooltip>
    );
};
