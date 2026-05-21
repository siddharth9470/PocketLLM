import { useState, useRef } from "react";
import * as FileSystem from "expo-file-system/legacy";

export const useModelDownloader = () => {
    const [progress, setProgress] = useState(0);
    const [isDownloading, setIsDownloading] = useState(false);

    // We keep a reference to the download object so you can add pause/cancel features later
    const downloadResumableRef = useRef<ReturnType<
        typeof FileSystem.createDownloadResumable
    > | null>(null);

    const startDownload = async (
        downloadUrl: string,
        filename: string,
    ): Promise<string | null> => {
        setIsDownloading(true);
        setProgress(0);

        // 1. Define the permanent, safe path on the device
        const fileUri = FileSystem.documentDirectory + filename;

        try {
            // 2. Check if the file is already there so we don't waste data
            const fileInfo = await FileSystem.getInfoAsync(fileUri);
            if (fileInfo.exists) {
                console.log("Model already exists at:", fileUri);
                setIsDownloading(false);
                return fileUri; // Return the path so llama.rn can use it immediately
            }

            console.log("Starting download to:", fileUri);

            // 3. Create the resumable download task
            const downloadResumable = FileSystem.createDownloadResumable(
                downloadUrl,
                fileUri,
                {},
                (downloadProgress) => {
                    // Calculate percentage for your UI
                    const currentProgress = Math.round(
                        (downloadProgress.totalBytesWritten /
                            downloadProgress.totalBytesExpectedToWrite) *
                            100,
                    );
                    setProgress(currentProgress);
                },
            );

            downloadResumableRef.current = downloadResumable;

            // 4. Execute the download
            const result = await downloadResumable.downloadAsync();

            if (result && result.uri) {
                console.log("Download complete!", result.uri);
                return result.uri;
            }

            return null;
        } catch (error) {
            console.error("Download failed:", error);
            return null;
        } finally {
            setIsDownloading(false);
        }
    };

    // Optional utility to cancel a running download
    const cancelDownload = async () => {
        if (downloadResumableRef.current) {
            await downloadResumableRef.current.cancelAsync();
            setIsDownloading(false);
            setProgress(0);
        }
    };

    return { startDownload, cancelDownload, progress, isDownloading };
};
