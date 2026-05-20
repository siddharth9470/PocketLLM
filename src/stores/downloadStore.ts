import { create } from 'zustand';

import { downloadModelFile } from '../services/downloadModel';
import type { ModelDownloadState } from '../types/models';

interface DownloadStore {
  downloads: Record<string, ModelDownloadState>;
  startDownload: (modelId: string) => Promise<void>;
  getDownload: (modelId: string) => ModelDownloadState;
  isDownloaded: (modelId: string) => boolean;
  getDownloadedModelIds: () => string[];
}

const defaultDownloadState: ModelDownloadState = {
  status: 'idle',
  progress: 0,
};

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  downloads: {},

  getDownload: (modelId) => get().downloads[modelId] ?? defaultDownloadState,

  isDownloaded: (modelId) => get().downloads[modelId]?.status === 'completed',

  getDownloadedModelIds: () =>
    Object.entries(get().downloads)
      .filter(([, state]) => state.status === 'completed')
      .map(([modelId]) => modelId),

  startDownload: async (modelId) => {
    const existing = get().downloads[modelId];
    if (existing?.status === 'downloading' || existing?.status === 'completed') {
      return;
    }

    set((state) => ({
      downloads: {
        ...state.downloads,
        [modelId]: { status: 'downloading', progress: 0 },
      },
    }));

    try {
      const result = await downloadModelFile(modelId, (progress) => {
        set((state) => ({
          downloads: {
            ...state.downloads,
            [modelId]: { status: 'downloading', progress },
          },
        }));
      });

      set((state) => ({
        downloads: {
          ...state.downloads,
          [modelId]: {
            status: 'completed',
            progress: 100,
            localPath: result.localPath,
          },
        },
      }));
    } catch {
      set((state) => ({
        downloads: {
          ...state.downloads,
          [modelId]: { status: 'failed', progress: 0 },
        },
      }));
    }
  },
}));
