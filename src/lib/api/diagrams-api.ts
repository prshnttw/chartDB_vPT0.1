import type { Diagram } from '@/lib/domain/diagram';
import { apiFetch } from './http';

export interface RemoteDiagramSummary {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface RemoteDiagram extends RemoteDiagramSummary {
    data: Omit<Diagram, 'createdAt' | 'updatedAt'> & {
        createdAt: string;
        updatedAt: string;
    };
}

export const diagramsApi = {
    list: () =>
        apiFetch<{ diagrams: RemoteDiagramSummary[] }>('/diagrams').then(
            (r) => r.diagrams
        ),
    get: (id: string) =>
        apiFetch<{ diagram: RemoteDiagram }>(`/diagrams/${id}`).then(
            (r) => r.diagram
        ),
    create: (diagram: Diagram) =>
        apiFetch<{ diagram: RemoteDiagramSummary }>('/diagrams', {
            method: 'POST',
            body: { id: diagram.id, name: diagram.name, data: diagram },
        }).then((r) => r.diagram),
    update: (diagram: Diagram) =>
        apiFetch<{ diagram: RemoteDiagramSummary }>(`/diagrams/${diagram.id}`, {
            method: 'PUT',
            body: { name: diagram.name, data: diagram },
        }).then((r) => r.diagram),
    remove: (id: string) =>
        apiFetch<void>(`/diagrams/${id}`, { method: 'DELETE' }),
};
