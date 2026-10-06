import React, { useCallback, useEffect, useState } from 'react';
import { Check, Link2, Loader2, Share2, X } from 'lucide-react';
import { Button } from '@/components/button/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/dialog/dialog';
import { Checkbox } from '@/components/checkbox/checkbox';
import { Input } from '@/components/input/input';
import { Label } from '@/components/label/label';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useChartDB } from '@/hooks/use-chartdb';
import { useDiagramSync } from '@/hooks/use-diagram-sync';
import { ApiError } from '@/lib/api/http';
import { sharesApi, type ShareRecipient } from '@/lib/api/shares-api';

const message = (e: unknown) =>
    e instanceof ApiError && e.status >= 400 && e.status < 500
        ? e.message
        : 'Something went wrong. Please try again.';

/** Share the open diagram, view-only, with other registered users. */
export const ShareDialog: React.FC = () => {
    const { currentDiagram } = useChartDB();
    const { saveNow } = useDiagramSync();
    const diagramId = currentDiagram?.id;

    const [open, setOpen] = useState(false);
    const [recipients, setRecipients] = useState<ShareRecipient[]>([]);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [linkEnabled, setLinkEnabled] = useState(false);

    const load = useCallback(async () => {
        if (!diagramId) return;
        setLoading(true);
        setError(null);
        try {
            // The server needs a copy of the diagram before it can be shared.
            await saveNow();
            const res = await sharesApi.listRecipients(diagramId);
            setRecipients(res.shares);
            setLinkEnabled(res.linkEnabled);
        } catch (e) {
            setError(message(e));
        } finally {
            setLoading(false);
        }
    }, [diagramId, saveNow]);

    useEffect(() => {
        if (open) void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, diagramId]);

    const onShare = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!diagramId) return;
        setBusy(true);
        setError(null);
        try {
            const share = await sharesApi.share(diagramId, email);
            setRecipients((list) =>
                list.some((r) => r.id === share.id) ? list : [...list, share]
            );
            setEmail('');
        } catch (err) {
            setError(message(err));
        } finally {
            setBusy(false);
        }
    };

    const onRemove = async (userId: string) => {
        if (!diagramId) return;
        setError(null);
        try {
            await sharesApi.unshare(diagramId, userId);
            setRecipients((list) => list.filter((r) => r.id !== userId));
        } catch (err) {
            setError(message(err));
        }
    };

    const link = `${window.location.origin}/shared/${diagramId}`;

    const toggleLink = async (enabled: boolean) => {
        if (!diagramId) return;
        setError(null);
        try {
            setLinkEnabled(await sharesApi.setLinkAccess(diagramId, enabled));
        } catch (err) {
            setError(message(err));
        }
    };

    const copyLink = async () => {
        try {
            // Copying a link that does not work yet would be confusing.
            if (!linkEnabled) await toggleLink(true);
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setError(
                'Could not copy automatically. Select the link and copy it.'
            );
        }
    };

    if (!diagramId) return null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                        <Button
                            type="button"
                            size="sm"
                            aria-label="Share diagram"
                            className="h-8 gap-1.5"
                        >
                            <Share2 className="size-4" />
                            Share
                        </Button>
                    </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Share (view only)</TooltipContent>
            </Tooltip>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        Share &ldquo;{currentDiagram.name}&rdquo;
                    </DialogTitle>
                    <DialogDescription>
                        Share a view-only link, or add people by email. Viewers
                        can never edit.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={onShare} className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                        <Label htmlFor="share-email">Add by email</Label>
                        <Input
                            id="share-email"
                            type="email"
                            required
                            autoComplete="off"
                            placeholder="name@cbr-iisc.ac.in"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <Button type="submit" disabled={busy || loading}>
                        {busy && (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                        )}
                        Share
                    </Button>
                </form>

                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}

                <div className="space-y-1.5">
                    <Label htmlFor="share-link">Link</Label>
                    <div className="flex gap-2">
                        <Input
                            id="share-link"
                            readOnly
                            value={link}
                            onFocus={(e) => e.currentTarget.select()}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void copyLink()}
                        >
                            {copied ? (
                                <Check className="mr-1 size-4" />
                            ) : (
                                <Link2 className="mr-1 size-4" />
                            )}
                            {copied ? 'Copied' : 'Copy'}
                        </Button>
                    </div>
                    <div className="flex items-start gap-2 pt-1">
                        <Checkbox
                            id="share-link-enabled"
                            checked={linkEnabled}
                            onCheckedChange={(v) => void toggleLink(v === true)}
                        />
                        <Label
                            htmlFor="share-link-enabled"
                            className="text-xs font-normal leading-snug text-muted-foreground"
                        >
                            Anyone with this link can view (view only). They are
                            asked to sign in or sign up first.
                        </Label>
                    </div>
                </div>

                <div>
                    <h3 className="mb-2 text-sm font-medium">Shared with</h3>
                    {loading ? (
                        <p className="text-sm text-muted-foreground">
                            Loading...
                        </p>
                    ) : recipients.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Not shared with anyone yet.
                        </p>
                    ) : (
                        <ul className="divide-y rounded-md border">
                            {recipients.map((r) => (
                                <li
                                    key={r.id}
                                    className="flex items-center justify-between gap-2 px-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate text-sm">
                                            {r.name ?? r.email}
                                        </div>
                                        <div className="truncate text-xs text-muted-foreground">
                                            {r.email} &middot; can view
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Remove ${r.email}`}
                                        onClick={() => void onRemove(r.id)}
                                    >
                                        <X className="size-4" />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
