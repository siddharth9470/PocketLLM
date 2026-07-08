import {
  completeHandler,
  createDownloadTask,
  getExistingDownloadTasks,
} from "@kesha-antonov/react-native-background-downloader";

type DownloadTask = ReturnType<typeof createDownloadTask>;

import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getDownloadedModels, getDownloadedModelsList, removeDownloadedModel, saveDownloadedModel } from "@/db/ModelDB";
import { getDownloadUrlForModel, deleteLocalModelFile, localFileBasename, normalizeFileUri } from "@/services/downloadHelpers";
import { releaseModelForPath } from "@/services/chatHelper";
import type { HuggingFaceModel } from "@/types/models";

interface DownloaderSnapshot {
  downloadProgress: Record<string, number>;
  activeDownloads: Record<string, boolean>;
  activeDownloadFilenames: Record<string, string>;
  activeDownloadModels: Record<string, HuggingFaceModel>;
  downloadedModelIds: Record<string, boolean>;
  completedDownloads: Record<string, HuggingFaceModel>;
}

const emptySnapshot: DownloaderSnapshot = {
  downloadProgress: {},
  activeDownloads: {},
  activeDownloadFilenames: {},
  activeDownloadModels: {},
  downloadedModelIds: {},
  completedDownloads: {},
};

let snapshot: DownloaderSnapshot = emptySnapshot;
const listeners = new Set<() => void>();
const activeTasks: Record<string, DownloadTask> = {};
let reattachStarted = false;

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function patchSnapshotKey<K extends keyof DownloaderSnapshot>(
  key: K,
  updater: (prev: DownloaderSnapshot[K]) => DownloaderSnapshot[K],
): void {
  snapshot = { ...snapshot, [key]: updater(snapshot[key]) };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): DownloaderSnapshot {
  return snapshot;
}

function markModelDownloaded(modelId: string): void {
  patchSnapshotKey("downloadedModelIds", (prev) => ({ ...prev, [modelId]: true }));
}

function clearActiveDownload(modelId: string, progress = 0): void {
  patchSnapshotKey("activeDownloads", (prev) => ({ ...prev, [modelId]: false }));
  patchSnapshotKey("activeDownloadFilenames", (prev) => {
    const next = { ...prev };
    delete next[modelId];
    return next;
  });
  patchSnapshotKey("activeDownloadModels", (prev) => {
    const next = { ...prev };
    delete next[modelId];
    return next;
  });
  patchSnapshotKey("downloadProgress", (prev) => ({ ...prev, [modelId]: progress }));
}

function attachTaskListeners(task: DownloadTask, modelId: string, fallbackFileUri?: string): void {
  task.progress(({ bytesDownloaded, bytesTotal }: { bytesDownloaded: number; bytesTotal: number }) => {
    const percentage = (bytesDownloaded / bytesTotal) * 100;
    patchSnapshotKey("downloadProgress", (prev) => ({ ...prev, [modelId]: percentage }));
  });

  task.done(
    async ({
      location,
      bytesDownloaded,
      bytesTotal,
    }: {
      location: string;
      bytesDownloaded: number;
      bytesTotal: number;
    }) => {
      const metadataFileUri = task.metadata.fileUri as string | undefined;
      const fileUri = normalizeFileUri(
        location || metadataFileUri || task.destination || fallbackFileUri || "",
      );

      delete activeTasks[modelId];
      clearActiveDownload(modelId, 100);

      try {
        const current = await getDownloadedModels();
        const existingModel = current[modelId];
        if (existingModel && fileUri) {
          const fileSizeBytes = bytesTotal > 0 ? bytesTotal : existingModel.downloadInfo?.fileSizeBytes;
          await saveDownloadedModel({
            ...existingModel,
            downloadInfo: {
              ...(existingModel.downloadInfo ?? {}),
              localFilePath: fileUri,
              status: "completed",
              downloadedAt: Date.now(),
              fileSizeBytes,
            },
          });
          markModelDownloaded(modelId);
          const completedModel = (await getDownloadedModels())[modelId];
          if (completedModel) {
            patchSnapshotKey("completedDownloads", (prev) => ({ ...prev, [modelId]: completedModel }));
          }
        } else if (!fileUri) {
          console.error(`Download complete for ${modelId}, but no file path was available to persist.`);
        }
      } catch (err) {
        console.error("Failed to save downloaded model metadata", err);
      }

      completeHandler(modelId);
    },
  );

  task.error(({ error }: { error: unknown }) => {
    console.error(`Error downloading ${modelId}:`, error);
    delete activeTasks[modelId];
    clearActiveDownload(modelId, 0);
  });
}

async function reattachTasks(): Promise<void> {
  try {
    const lostTasks = await getExistingDownloadTasks();
    if (lostTasks.length === 0) {
      return;
    }

    const downloadedModels = await getDownloadedModels();

    for (const nativeTask of lostTasks) {
      const modelId = nativeTask.id;
      if (activeTasks[modelId]) {
        continue;
      }

      const fallbackFileUri = downloadedModels[modelId]?.downloadInfo?.localFilePath;
      const downloadingFilename = localFileBasename(fallbackFileUri);
      const pendingModel = downloadedModels[modelId];

      activeTasks[modelId] = nativeTask;
      patchSnapshotKey("activeDownloads", (prev) => ({ ...prev, [modelId]: true }));
      if (downloadingFilename) {
        patchSnapshotKey("activeDownloadFilenames", (prev) => ({ ...prev, [modelId]: downloadingFilename }));
      }
      if (pendingModel) {
        patchSnapshotKey("activeDownloadModels", (prev) => ({ ...prev, [modelId]: pendingModel }));
      }
      patchSnapshotKey("downloadProgress", (prev) => ({ ...prev, [modelId]: prev[modelId] ?? 0 }));

      attachTaskListeners(nativeTask, modelId, fallbackFileUri);
      nativeTask.pause();
      setTimeout(() => {
        nativeTask.resume();
      }, 500);
    }
  } catch (error) {
    console.error("Failed to reattach background download tasks:", error);
  }
}

async function syncDownloadedModelIds(): Promise<void> {
  const map = await getDownloadedModels();
  const ids: Record<string, boolean> = {};
  const completed: Record<string, HuggingFaceModel> = {};

  for (const [id, model] of Object.entries(map)) {
    if (model.downloadInfo?.status === "completed") {
      ids[id] = true;
      completed[id] = model;
    }
  }

  patchSnapshotKey("downloadedModelIds", () => ids);
  patchSnapshotKey("completedDownloads", () => completed);
}

async function startDownload(
  model: HuggingFaceModel,
  filename: string,
  knownSizeBytes?: number | null,
): Promise<string | null> {
  const modelDownloadUrl = await getDownloadUrlForModel(model, filename, knownSizeBytes);
  if (!modelDownloadUrl) {
    console.error(`Download failed for model: ${model.id}`);
    return null;
  }

  const fileUri = normalizeFileUri(`${FileSystem.documentDirectory ?? ""}${modelDownloadUrl.filename}`);

  await saveDownloadedModel({
    ...model,
    downloadInfo: {
      ...(model.downloadInfo ?? {}),
      localFilePath: fileUri,
      status: "pending",
      downloadedAt: undefined,
      fileSizeBytes: modelDownloadUrl.fileSizeBytes ?? model.ggufFileSizeBytes ?? undefined,
    },
  });

  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (fileInfo.exists) {
    const fileSizeBytes =
      (fileInfo.exists && fileInfo.size != null && fileInfo.size > 0 ? fileInfo.size : undefined) ??
      modelDownloadUrl.fileSizeBytes ??
      undefined;
    await saveDownloadedModel({
      ...model,
      downloadInfo: {
        ...(model.downloadInfo ?? {}),
        status: "completed",
        downloadedAt: Date.now(),
        localFilePath: fileUri,
        fileSizeBytes,
      },
    });
    markModelDownloaded(model.id);
    const completedModel = (await getDownloadedModels())[model.id];
    if (completedModel) {
      patchSnapshotKey("completedDownloads", (prev) => ({ ...prev, [model.id]: completedModel }));
    }
    return fileUri;
  }

  if (activeTasks[model.id]) {
    return null;
  }

  patchSnapshotKey("activeDownloads", (prev) => ({ ...prev, [model.id]: true }));
  patchSnapshotKey("activeDownloadFilenames", (prev) => ({ ...prev, [model.id]: modelDownloadUrl.filename }));
  patchSnapshotKey("activeDownloadModels", (prev) => ({ ...prev, [model.id]: model }));
  patchSnapshotKey("downloadProgress", (prev) => ({ ...prev, [model.id]: 0 }));

  const task = createDownloadTask({
    id: model.id,
    url: modelDownloadUrl.url,
    destination: fileUri,
    metadata: { fileUri },
  });

  activeTasks[model.id] = task;
  attachTaskListeners(task, model.id, fileUri);
  task.start();
  return null;
}

async function cancelDownload(modelId: string): Promise<void> {
  const task = activeTasks[modelId];
  if (task) {
    task.stop();
    delete activeTasks[modelId];
  }

  clearActiveDownload(modelId, 0);

  try {
    const current = await getDownloadedModels();
    const existingModel = current[modelId];
    if (existingModel?.downloadInfo?.status === "pending" || existingModel?.downloadInfo?.status === "downloading") {
      await saveDownloadedModel({
        ...existingModel,
        downloadInfo: {
          ...(existingModel.downloadInfo ?? {}),
          status: "idle",
          downloadedAt: undefined,
        },
      });
    }
  } catch (error) {
    console.error(`Failed to reset download metadata for ${modelId}:`, error);
  }

  completeHandler(modelId);
}

async function deleteDownloadedModel(modelId: string): Promise<void> {
  const current = await getDownloadedModels();
  const existingModel = current[modelId];
  const filePath = existingModel?.downloadInfo?.localFilePath;

  if (activeTasks[modelId]) {
    await cancelDownload(modelId);
  }

  completeHandler(modelId);

  if (filePath) {
    await releaseModelForPath(filePath);
    await deleteLocalModelFile(filePath);
  }

  await removeDownloadedModel(modelId);

  patchSnapshotKey("downloadedModelIds", (prev) => {
    const next = { ...prev };
    delete next[modelId];
    return next;
  });
  patchSnapshotKey("completedDownloads", (prev) => {
    const next = { ...prev };
    delete next[modelId];
    return next;
  });
  clearActiveDownload(modelId, 0);
}

async function retreiveCompletedDownloads(): Promise<void> {
  const modelsFromLocalStorage = await getDownloadedModelsList();

  for await (const model of modelsFromLocalStorage) {
    if (model.downloadInfo?.status === "pending") {
      const fileInfo = model.downloadInfo.localFilePath
        ? await FileSystem.getInfoAsync(model.downloadInfo.localFilePath)
        : null;

      if (fileInfo?.exists) {
        await saveDownloadedModel({
          ...model,
          downloadInfo: {
            ...(model.downloadInfo ?? {}),
            status: "completed",
            downloadedAt: Date.now(),
          },
        });
      }
    }
  }

  await syncDownloadedModelIds();
}

export const useModelDownloader = () => {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void syncDownloadedModelIds();
    if (!reattachStarted) {
      reattachStarted = true;
      void reattachTasks();
    }
  }, []);

  return {
    startDownload: useCallback(startDownload, []),
    pauseDownload: useCallback((modelId: string) => {
      activeTasks[modelId]?.pause();
    }, []),
    resumeDownload: useCallback((modelId: string) => {
      activeTasks[modelId]?.resume();
    }, []),
    cancelDownload: useCallback(cancelDownload, []),
    deleteDownloadedModel: useCallback(deleteDownloadedModel, []),
    syncDownloadedModelIds: useCallback(syncDownloadedModelIds, []),
    retreiveCompletedDownloads: useCallback(retreiveCompletedDownloads, []),
    ...state,
  };
};
