import {
    createResumableDownload,
    downloadResumable,
    getModelLocalUri,
    type DownloadProgressCallback,
} from "./downloadHelpers";

export interface DownloadResult {
    localPath: string;
}

export async function downloadModelFile(
    modelId: string,
    onProgress: DownloadProgressCallback,
    signal?: AbortSignal,
): Promise<DownloadResult> {
    const resumable = createResumableDownload(modelId, onProgress);
    const result = await downloadResumable(resumable, signal);
    const localPath = result?.uri ?? getModelLocalUri(modelId);

    return { localPath };
}
