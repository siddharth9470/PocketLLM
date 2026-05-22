import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import type { ModelDownloadState } from "../types/models";

interface DownloadStore {
    downloads: Record<string, ModelDownloadState>;
    startDownload: (modelId: string) => Promise<void>;
    getDownload: (modelId: string) => ModelDownloadState;
    isDownloaded: (modelId: string) => boolean;
    getDownloadedModelIds: () => string[];
}

const defaultDownloadState: ModelDownloadState = {
    status: "idle",
    progress: 0,
};

function mergeDownloadState(
    existing: ModelDownloadState | undefined,
    updates: Partial<ModelDownloadState>,
): ModelDownloadState {
    return { ...defaultDownloadState, ...existing, ...updates };
}

function useModelDownloads() {
    const [downloads, setDownloads] = useState<
        Record<string, ModelDownloadState>
    >({});

    const setDownloadState = useCallback(
        (modelId: string, updates: Partial<ModelDownloadState>) => {
            setDownloads((current) => ({
                ...current,
                [modelId]: mergeDownloadState(current[modelId], updates),
            }));
        },
        [],
    );

    const getDownload = useCallback(
        (modelId: string) => downloads[modelId] ?? defaultDownloadState,
        [downloads],
    );

    const startDownload = useCallback(
        async (modelId: string) => {
            const existing = downloads[modelId];
            if (
                existing?.status === "downloading" ||
                existing?.status === "completed"
            ) {
                return;
            }

            setDownloadState(modelId, { status: "downloading", progress: 0 });

            // try {
            //     const result = await downloadModelFile(modelId, (progress) => {
            //         setDownloadState(modelId, {
            //             status: "downloading",
            //             progress,
            //         });
            //     });

            //     setDownloadState(modelId, {
            //         status: "completed",
            //         progress: 100,
            //         localPath: result.localPath,
            //     });
            // } catch {
            //     setDownloadState(modelId, { status: "failed", progress: 0 });
            // }
        },
        [downloads, setDownloadState],
    );

    const isDownloaded = useCallback(
        (modelId: string) => downloads[modelId]?.status === "completed",
        [downloads],
    );

    const getDownloadedModelIds = useCallback(
        () =>
            Object.entries(downloads)
                .filter(([, state]) => state.status === "completed")
                .map(([modelId]) => modelId),
        [downloads],
    );

    return {
        downloads,
        getDownload,
        isDownloaded,
        getDownloadedModelIds,
        startDownload,
    };
}

const DownloadStoreContext = createContext<DownloadStore | undefined>(
    undefined,
);

export function DownloadStoreProvider({ children }: { children: ReactNode }) {
    const value = useModelDownloads();

    return createElement(DownloadStoreContext.Provider, { value }, children);
}

export function useDownloadStore<T>(selector: (state: DownloadStore) => T): T {
    const context = useContext(DownloadStoreContext);
    if (!context) {
        throw new Error(
            "useDownloadStore must be used within a DownloadStoreProvider",
        );
    }

    return selector(context);
}
