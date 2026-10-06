import React, { Suspense } from 'react';
import { useChartDB } from '@/hooks/use-chartdb';
import { Toaster } from '@/components/toast/toaster';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { FullScreenLoaderProvider } from '@/context/full-screen-spinner-context/full-screen-spinner-provider';
import { LayoutProvider } from '@/context/layout-context/layout-provider';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { StorageProvider } from '@/context/storage-context/storage-provider';
import { ConfigProvider } from '@/context/config-context/config-provider';
import { RedoUndoStackProvider } from '@/context/history-context/redo-undo-stack-provider';
import { ChartDBProvider } from '@/context/chartdb-context/chartdb-provider';
import { HistoryProvider } from '@/context/history-context/history-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import { ReactFlowProvider } from '@xyflow/react';
import { ExportImageProvider } from '@/context/export-image-context/export-image-provider';
import { DialogProvider } from '@/context/dialog-context/dialog-provider';
import { KeyboardShortcutsProvider } from '@/context/keyboard-shortcuts-context/keyboard-shortcuts-provider';
import { Spinner } from '@/components/spinner/spinner';
import { Helmet } from 'react-helmet-async';
import { AlertProvider } from '@/context/alert-context/alert-provider';
import { CanvasProvider } from '@/context/canvas-context/canvas-provider';
import { APP_NAME } from '@/lib/branding';
import { useDiagramLoader } from './use-diagram-loader';
import { DiffProvider } from '@/context/diff-context/diff-provider';
import { TopNavbarMock } from './top-navbar/top-navbar-mock';
import { DiagramSyncProvider } from '@/context/diagram-sync-context/diagram-sync-provider';
import { DiagramFilterProvider } from '@/context/diagram-filter-context/diagram-filter-provider';

export const EditorDesktopLayoutLazy = React.lazy(
    () => import('./editor-desktop-layout')
);

export const EditorMobileLayoutLazy = React.lazy(
    () => import('./editor-mobile-layout')
);

const EditorPageComponent: React.FC = () => {
    const { diagramName } = useChartDB();
    const { isMd: isDesktop } = useBreakpoint('md');
    const { initialDiagram } = useDiagramLoader();

    return (
        <>
            <Helmet>
                <title>
                    {diagramName ? `${APP_NAME} - ${diagramName}` : APP_NAME}
                </title>
            </Helmet>
            <section
                className={`bg-background ${isDesktop ? 'h-screen w-screen' : 'h-dvh w-dvw'} flex select-none flex-col overflow-x-hidden`}
            >
                <Suspense
                    fallback={
                        <>
                            <TopNavbarMock />
                            <div className="flex flex-1 items-center justify-center">
                                <Spinner
                                    size={isDesktop ? 'large' : 'medium'}
                                />
                            </div>
                        </>
                    }
                >
                    {isDesktop ? (
                        <EditorDesktopLayoutLazy
                            initialDiagram={initialDiagram}
                        />
                    ) : (
                        <EditorMobileLayoutLazy
                            initialDiagram={initialDiagram}
                        />
                    )}
                </Suspense>
            </section>
            <Toaster />
        </>
    );
};

export const EditorPage: React.FC = () => (
    <LocalConfigProvider>
        <ThemeProvider>
            <FullScreenLoaderProvider>
                <LayoutProvider>
                    <StorageProvider>
                        <ConfigProvider>
                            <RedoUndoStackProvider>
                                <DiffProvider>
                                    <ChartDBProvider>
                                        <DiagramSyncProvider>
                                            <DiagramFilterProvider>
                                                <HistoryProvider>
                                                    <ReactFlowProvider>
                                                        <CanvasProvider>
                                                            <ExportImageProvider>
                                                                <AlertProvider>
                                                                    <DialogProvider>
                                                                        <KeyboardShortcutsProvider>
                                                                            <EditorPageComponent />
                                                                        </KeyboardShortcutsProvider>
                                                                    </DialogProvider>
                                                                </AlertProvider>
                                                            </ExportImageProvider>
                                                        </CanvasProvider>
                                                    </ReactFlowProvider>
                                                </HistoryProvider>
                                            </DiagramFilterProvider>
                                        </DiagramSyncProvider>
                                    </ChartDBProvider>
                                </DiffProvider>
                            </RedoUndoStackProvider>
                        </ConfigProvider>
                    </StorageProvider>
                </LayoutProvider>
            </FullScreenLoaderProvider>
        </ThemeProvider>
    </LocalConfigProvider>
);
