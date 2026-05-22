import {
    completeHandler,
    createDownloadTask,
    getExistingDownloadTasks,
} from "@kesha-antonov/react-native-background-downloader";
import type { DownloadTask } from "@kesha-antonov/react-native-background-downloader/src/DownloadTask";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HuggingFaceModel } from "../types/models";
import { getDownloadUrlForModel } from "./downloadHelpers";

export const useModelDownloader = () => {
    const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
    const [activeDownloads, setActiveDownloads] = useState<Record<string, boolean>>({});

    // The logbook that holds active native task objects in memory
    const activeTasksRef = useRef<Record<string, DownloadTask>>({});

    // Shared listener attachment logic wrapped in useCallback to prevent dependency warnings
    const attachListeners = useCallback((task: DownloadTask, modelId: string) => {
        task.progress(({ bytesDownloaded, bytesTotal }: { bytesDownloaded: number; bytesTotal: number }) => {
            const percentage = (bytesDownloaded / bytesTotal) * 100;
            setDownloadProgress((prev) => ({
                ...prev,
                [modelId]: percentage,
            }));
        })
            .done(({ bytesDownloaded, bytesTotal }: { bytesDownloaded: number; bytesTotal: number }) => {
                console.log(`Download complete for ${modelId}!`, { bytesDownloaded, bytesTotal });
                delete activeTasksRef.current[modelId];
                setActiveDownloads((prev) => ({ ...prev, [modelId]: false }));
                setDownloadProgress((prev) => ({ ...prev, [modelId]: 100 }));

                completeHandler(modelId);
            })
            .error(({ error }: { error: any }) => {
                console.error(`Error downloading ${modelId}:`, error);
                delete activeTasksRef.current[modelId];
                setActiveDownloads((prev) => ({ ...prev, [modelId]: false }));
                setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 }));
            });
    }, []);

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

                for (const task of lostTasks) {
                    const modelId = task.id;

                    // Re-populate our tracking objects
                    activeTasksRef.current[modelId] = task;
                    setActiveDownloads((prev) => ({ ...prev, [modelId]: true }));

                    // Re-attach execution event listeners
                    attachListeners(task, modelId);
                }
            } catch (error) {
                console.error("Failed to reattach background download tasks:", error);
            }
        };

        reattachTasks();
    }, [attachListeners]); // Safely tracked by adding attachListeners here

    const startDownload = async (model: HuggingFaceModel) => {
        const modelDownloadUrl = await getDownloadUrlForModel(model.id);
        if (!modelDownloadUrl) {
            console.error(`Download failed for model: ${model.id}`);
            return null;
        }

        const fileUri = FileSystem.documentDirectory + modelDownloadUrl.filename;

        // Check if the specific file exists
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (fileInfo.exists) {
            console.log("Model already exists at:", fileUri);
            setDownloadProgress((prev) => ({ ...prev, [model.id]: 100 }));
            return fileUri;
        }

        // If the task is already running, don't duplicate it
        if (activeTasksRef.current[model.id]) {
            console.log(`Download task already running for ${model.id}`);
            return null;
        }

        setActiveDownloads((prev) => ({ ...prev, [model.id]: true }));

        const task = createDownloadTask({
            id: model.id,
            url: modelDownloadUrl.url,
            destination: fileUri,
            metadata: {},
        });

        // Store the task in our logbook
        activeTasksRef.current[model.id] = task;

        // Attach listeners and run it
        attachListeners(task, model.id);
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

    const cancelDownload = (modelId: string) => {
        const task = activeTasksRef.current[modelId];
        if (task) {
            task.stop(); // Stops native task completely
            delete activeTasksRef.current[modelId];

            setActiveDownloads((prev) => ({ ...prev, [modelId]: false }));
            setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 }));
            console.log(`Canceled download for: ${modelId}`);
        }
    };

    return {
        startDownload,
        pauseDownload,
        resumeDownload,
        cancelDownload,
        downloadProgress, // Dictionary of percentages mapped by model ID
        activeDownloads, // Dictionary of boolean download statuses mapped by model ID
    };
};
