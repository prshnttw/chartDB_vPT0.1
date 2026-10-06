import { useContext } from 'react';
import { diagramSyncContext } from '@/context/diagram-sync-context/diagram-sync-context';

export const useDiagramSync = () => useContext(diagramSyncContext);
