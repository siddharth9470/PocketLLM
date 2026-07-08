import {
  completeHandler,
  createDownloadTask,
  getExistingDownloadTasks,
} from "@kesha-antonov/react-native-background-downloader";

type DownloadTask = ReturnType<typeof createDownloadTask>;

import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDownloadedModels, getDownloadedModelsList, removeDownloadedModel, saveDownloadedModel } from "@/db/ModelDB";
import { getDownloadUrlForModel } from "@/services/downloadHelpers";
import type { HuggingFaceModel } from "@/types/models";

export const useModelDownloader = () => {
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [activeDownloads, setActiveDownloads] = useState<Record<string, boolean>>({});
  const [downloadedModelIds, setDownloadedModelIds] = useState<Record<string, boolean>>({});
  const [completedDownloads, setCompletedDownloads] = useState<Record<string, HuggingFaceModel>>({});

  const syncDownloadedModelIds = useCallback(async () => {
    const map = await getDownloadedModels();
    const ids: Record<string, boolean> = {};
    const completed: Record<string, HuggingFaceModel> = {};

    for (const [id, model] of Object.entries(map)) {
      if (model.downloadInfo?.status === "completed") {
        ids[id] = true;
        completed[id] = model;
      }
    }

    setDownloadedModelIds(ids);
    setCompletedDownloads(completed);
  }, []);

  const markModelDownloaded = useCallback((modelId: string) => {
    setDownloadedModelIds((prev) => ({ ...prev, [modelId]: true }));
  }, []);

  useEffect(() => {
    syncDownloadedModelIds();
  }, [syncDownloadedModelIds]);

  // The logbook that holds active native task objects in memory
  const activeTasksRef = useRef<Record<string, DownloadTask>>({});

  // Fixed parameter to be a single destructured object to match ProgressHandler type signature
  const attachTaskListeners = useCallback(
    (task: DownloadTask, modelId: string, fallbackFileUri?: string) => {
      task.progress(({ bytesDownloaded, bytesTotal }: { bytesDownloaded: number; bytesTotal: number }) => {
        const percentage = (bytesDownloaded / bytesTotal) * 100;
        console.log(`Download percentage for ${modelId}: ${percentage.toFixed(2)}%`);
        setDownloadProgress((prev) => ({
          ...prev,
          [modelId]: percentage,
        }));
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
          const fileUri = location || metadataFileUri || task.destination || fallbackFileUri;
          console.log(`Download complete for ${modelId}!`, {
            bytesDownloaded,
            bytesTotal,
            fileUri,
          });
          delete activeTasksRef.current[modelId];
          setActiveDownloads((prev) => ({ ...prev, [modelId]: false }));
          setDownloadProgress((prev) => ({ ...prev, [modelId]: 100 }));

          // Persist metadata for fully downloaded model if we have a fileUri
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
            } else if (!fileUri) {
              console.error(`Download complete for ${modelId}, but no file path was available to persist.`);
            }
          } catch (err) {
            console.error("Failed to save downloaded model metadata", err);
          }

          completeHandler(modelId);
        },
      );

      task.error(({ error }: { error: any }) => {
        console.error(`Error downloading ${modelId}:`, error);
        delete activeTasksRef.current[modelId];
        setActiveDownloads((prev) => ({ ...prev, [modelId]: false }));
        setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 }));
      });
    },
    [markModelDownloaded],
  );

  // --- AUTOMATIC RE-ATTACH LOGIC ON MOUNT ---
  useEffect(() => {
    const reattachTasks = async () => {
      try {
        console.log("Scanning for active background downloads...");
        const lostTasks = await getExistingDownloadTasks();

        if (lostTasks.length === 0) {
          console.log("No active downloads found from previous sessions.");
          return;
        }

        console.log(`Recovered ${lostTasks.length} active downloads. Re-linking listeners...`);

        const downloadedModels = await getDownloadedModels();

        for (const nativeTask of lostTasks) {
          const modelId = nativeTask.id;
          const fallbackFileUri = downloadedModels[modelId]?.downloadInfo?.localFilePath;

          // Save instance ref
          activeTasksRef.current[modelId] = nativeTask;
          setActiveDownloads((prev) => ({ ...prev, [modelId]: true }));

          setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 }));

          // Re-bind direct event assignments
          attachTaskListeners(nativeTask, modelId, fallbackFileUri);

          // THE CPR FIX: Force the Native OS to resync with the new JS Bridge
          nativeTask.pause();

          // Give the OS 500ms to clear the old memory pointers, then resume it
          setTimeout(() => {
            nativeTask.resume();
            console.log(`Forced native bridge resync for ${modelId}`);
          }, 500);
        }
      } catch (error) {
        console.error("Failed to reattach background download tasks:", error);
      }
    };

    reattachTasks();
  }, [attachTaskListeners]);

  const startDownload = async (model: HuggingFaceModel, filename: string, knownSizeBytes?: number | null) => {
    const modelDownloadUrl = await getDownloadUrlForModel(model, filename, knownSizeBytes);
    console.log("modelDownloadUrl : ", modelDownloadUrl);
    if (!modelDownloadUrl) {
      console.error(`Download failed for model: ${model.id}`);
      return null;
    }

    const fileUri = FileSystem.documentDirectory + modelDownloadUrl.filename;

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

    // Check if the specific file exists
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists) {
      console.log("Model already exists at:", fileUri);
      setDownloadProgress((prev) => ({ ...prev, [model.id]: 100 }));
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
      return fileUri;
    }

    if (activeTasksRef.current[model.id]) {
      console.log(`Download task already running for ${model.id}`);
      return null;
    }

    setActiveDownloads((prev) => ({ ...prev, [model.id]: true }));
    setDownloadProgress((prev) => ({ ...prev, [model.id]: 0 }));

    // 1. Create a clean base task instance
    const task = createDownloadTask({
      id: model.id,
      url: modelDownloadUrl.url,
      destination: fileUri,
      metadata: { fileUri: fileUri },
    });

    // 2. Map inside our tracking ref instantly
    activeTasksRef.current[model.id] = task;

    // 3. Attach standard, non-chained progress handlers securely (pass fileUri so completion can persist)
    attachTaskListeners(task, model.id, fileUri);

    // 4. Finally execute the stream download
    task.start();
  };

  const pauseDownload = (modelId: string) => {
    const task = activeTasksRef.current[modelId];
    if (task) {
      task.pause();
      console.log(`Paused download for: ${modelId}`);
    }
  };

  const resumeDownload = (modelId: string) => {
    const task = activeTasksRef.current[modelId];
    if (task) {
      task.resume();
      console.log(`Resumed download for: ${modelId}`);
    }
  };

  const cancelDownload = useCallback(async (modelId: string) => {
    const task = activeTasksRef.current[modelId];
    if (task) {
      task.stop();
      delete activeTasksRef.current[modelId];
    }

    setActiveDownloads((prev) => ({ ...prev, [modelId]: false }));
    setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 }));

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
    console.log(`Canceled download for: ${modelId}`);
  }, []);

  const deleteDownloadedModel = useCallback(async (modelId: string) => {
    const current = await getDownloadedModels();
    const existingModel = current[modelId];
    const filePath = existingModel?.downloadInfo?.localFilePath;

    if (activeTasksRef.current[modelId]) {
      await cancelDownload(modelId);
    }

    if (filePath) {
      try {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      } catch (error) {
        console.error(`Failed to delete model file for ${modelId}:`, error);
        throw error;
      }
    }

    await removeDownloadedModel(modelId);

    setDownloadedModelIds((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
    setCompletedDownloads((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
  }, [cancelDownload]);

  const retreiveCompletedDownloads = async () => {
    /**
     * This function retrieves the list of downloads that were completed
     *  in the background while the application was closed.
     * It checks all pending downloads and sets their status to completed.
     */

    const modelsFromLocalStorage = await getDownloadedModelsList();

    for await (const model of modelsFromLocalStorage) {
      if (model.downloadInfo?.status === "pending") {
        const isModelExist = await isFileAlreadyExistInLocalStorage(model.downloadInfo?.localFilePath);

        if (isModelExist) {
          await saveDownloadedModel({
            ...model,
            downloadInfo: {
              ...(model.downloadInfo ?? {}),
              status: "completed",
              downloadedAt: Date.now(),
            },
          });
          console.log(`Pending Download Model ${model.name}`);
        }
      }
    }
  };

  const isFileAlreadyExistInLocalStorage = async (fileUri: string | undefined): Promise<boolean> => {
    if (!fileUri) return false;
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    return fileInfo.exists;
  };

  return {
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    deleteDownloadedModel,
    downloadProgress,
    activeDownloads,
    downloadedModelIds,
    completedDownloads,
    syncDownloadedModelIds,
    retreiveCompletedDownloads,
  };
};
