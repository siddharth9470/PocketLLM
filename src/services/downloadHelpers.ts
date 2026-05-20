import * as FileSystem from "expo-file-system/legacy";

export type DownloadProgressCallback = (progress: number) => void;

export const MODEL_FILE_EXTENSION = ".gguf";

export function normalizeModelId(modelId: string) {
    return modelId.replace(/[\/\\]+/g, "_");
}

export function getModelFileName(modelId: string) {
    return `${normalizeModelId(modelId)}${MODEL_FILE_EXTENSION}`;
}

export function getModelLocalUri(modelId: string) {
    return `${FileSystem.documentDirectory}${getModelFileName(modelId)}`;
}

export function getModelRemoteUrl(modelId: string) {
    return `https://huggingface.co/${modelId}/resolve/main/${getModelFileName(modelId)}`;
}

export function progressFromEvent({
    totalBytesWritten,
    totalBytesExpectedToWrite,
}: FileSystem.DownloadProgressData) {
    if (!totalBytesExpectedToWrite) {
        return 0;
    }

    return Math.min(
        100,
        Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100),
    );
}

export function createResumableDownload(
    modelId: string,
    onProgress: DownloadProgressCallback,
): FileSystem.DownloadResumable {
    return FileSystem.createDownloadResumable(
        getModelRemoteUrl(modelId),
        getModelLocalUri(modelId),
        {},
        (event) => {
            onProgress(progressFromEvent(event));
        },
    );
}

export async function downloadResumable(
    resumable: FileSystem.DownloadResumable,
    signal?: AbortSignal,
): Promise<FileSystem.FileSystemDownloadResult | undefined> {
    if (signal?.aborted) {
        throw new Error("Download cancelled");
    }

    const downloadAsync = resumable.downloadAsync();

    if (!signal) {
        return downloadAsync;
    }

    let aborted = false;
    const onAbort = async () => {
        aborted = true;
        try {
            await resumable.pauseAsync();
        } catch {
            // Ignore pause failure; cancellation is best effort.
        }
    };

    signal.addEventListener("abort", onAbort, { once: true });

    try {
        const result = await downloadAsync;
        if (aborted) {
            throw new Error("Download cancelled");
        }
        return result;
    } finally {
        signal.removeEventListener("abort", onAbort);
    }
}
