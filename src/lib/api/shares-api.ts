import type { RemoteDiagram } from './diagrams-api';
import { apiFetch } from './http';

export interface ShareRecipient {
    id: string;
    name: string | null;
    email: string;
}

export interface SharedDiagramSummary {
    id: string;
    name: string;
    updatedAt: string;
    owner: { name: string | null; email: string };
    isOwner?: boolean;
}

export interface SharedDiagram extends SharedDiagramSummary {
    data: RemoteDiagram['data'];
}

export const sharesApi = {
    // Owner side
    listRecipients: (diagramId: string) =>
        apiFetch<{ shares: ShareRecipient[]; linkEnabled: boolean }>(
            `/diagrams/${diagramId}/shares`
        ),
    setLinkAccess: (diagramId: string, enabled: boolean) =>
        apiFetch<{ linkEnabled: boolean }>(
            `/diagrams/${diagramId}/shares/link`,
            { method: 'PUT', body: { enabled } }
        ).then((r) => r.linkEnabled),
    share: (diagramId: string, email: string) =>
        apiFetch<{ share: ShareRecipient }>(`/diagrams/${diagramId}/shares`, {
            method: 'POST',
            body: { email },
        }).then((r) => r.share),
    unshare: (diagramId: string, userId: string) =>
        apiFetch<void>(`/diagrams/${diagramId}/shares/${userId}`, {
            method: 'DELETE',
        }),

    // Recipient side (read-only)
    listSharedWithMe: () =>
        apiFetch<{ diagrams: SharedDiagramSummary[] }>('/shared').then(
            (r) => r.diagrams
        ),
    getShared: (id: string) =>
        apiFetch<{ diagram: SharedDiagram }>(`/shared/${id}`).then(
            (r) => r.diagram
        ),
    leave: (id: string) =>
        apiFetch<void>(`/shared/${id}`, { method: 'DELETE' }),
};
