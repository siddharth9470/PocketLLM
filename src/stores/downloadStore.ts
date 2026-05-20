import { createContext, createElement, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';

import { downloadModelFile } from '../services/downloadModel';
import type { ModelDownloadState } from '../types/models';

interface DownloadStore {
  downloads: Record<string, ModelDownloadState>;
  startDownload: (modelId: string) => Promise<void>;
  getDownload: (modelId: string) => ModelDownloadState;
  isDownloaded: (modelId: string) => boolean;
  getDownloadedModelIds: () => string[];
}

interface DownloadStoreState {
  downloads: Record<string, ModelDownloadState>;
}

type DownloadAction =
  | { type: 'startDownload'; modelId: string }
  | { type: 'progress'; modelId: string; progress: number }
  | { type: 'completed'; modelId: string; localPath: string }
  | { type: 'failed'; modelId: string };

const defaultDownloadState: ModelDownloadState = {
  status: 'idle',
  progress: 0,
};

function downloadReducer(state: DownloadStoreState, action: DownloadAction): DownloadStoreState {
  switch (action.type) {
    case 'startDownload':
      return {
        downloads: {
          ...state.downloads,
          [action.modelId]: { status: 'downloading', progress: 0 },
        },
      };
    case 'progress':
      return {
        downloads: {
          ...state.downloads,
          [action.modelId]: { status: 'downloading', progress: action.progress },
        },
      };
    case 'completed':
      return {
        downloads: {
          ...state.downloads,
          [action.modelId]: {
            status: 'completed',
            progress: 100,
            localPath: action.localPath,
          },
        },
      };
    case 'failed':
      return {
        downloads: {
          ...state.downloads,
          [action.modelId]: { status: 'failed', progress: 0 },
        },
      };
    default:
      return state;
  }
}

const DownloadStoreContext = createContext<DownloadStore | undefined>(undefined);

export function DownloadStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(downloadReducer, { downloads: {} });

  const getDownload = useCallback(
    (modelId: string) => state.downloads[modelId] ?? defaultDownloadState,
    [state.downloads],
  );

  const startDownload = useCallback(
    async (modelId: string) => {
      const existing = state.downloads[modelId];
      if (existing?.status === 'downloading' || existing?.status === 'completed') {
        return;
      }

      dispatch({ type: 'startDownload', modelId });

      try {
        const result = await downloadModelFile(modelId, (progress) => {
          dispatch({ type: 'progress', modelId, progress });
        });

        dispatch({ type: 'completed', modelId, localPath: result.localPath });
      } catch {
        dispatch({ type: 'failed', modelId });
      }
    },
    [state.downloads],
  );

  const value = useMemo<DownloadStore>(
    () => ({
      downloads: state.downloads,
      startDownload,
      getDownload,
      isDownloaded: (modelId) => state.downloads[modelId]?.status === 'completed',
      getDownloadedModelIds: () =>
        Object.entries(state.downloads)
          .filter(([, downloadState]) => downloadState.status === 'completed')
          .map(([modelId]) => modelId),
    }),
    [getDownload, startDownload, state.downloads],
  );

  return createElement(DownloadStoreContext.Provider, { value }, children);
}

export function useDownloadStore<T>(selector: (state: DownloadStore) => T): T {
  const context = useContext(DownloadStoreContext);
  if (!context) {
    throw new Error('useDownloadStore must be used within a DownloadStoreProvider');
  }

  return selector(context);
}
