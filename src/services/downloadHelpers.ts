import * as FileSystem from "expo-file-system/legacy";
import { HFModelDetails } from "../types/models";

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

// - -----------------------------------------

export const getDownloadUrlForModel = async (
    modelId: string,
): Promise<{ url: string; filename: string } | null> => {
    try {
        // 1. Fetch the full details for the clicked model repository
        let response = await fetch(
            `https://huggingface.co/api/models/${modelId}`,
        );

        if (!response.ok) throw new Error("Failed to fetch model details");

        let data: HFModelDetails = await response.json();
        let currentModelId = modelId;

        // 2. Extract and filter out only the .gguf files
        let ggufFiles = data.siblings
            ? data.siblings
                  .map((s) => s.rfilename)
                  .filter((name) => name.endsWith(".gguf"))
            : [];

        // 🚀 FALLBACK LOGIC: If no GGUF files exist in this repo, find a GGUF clone!
        if (ggufFiles.length === 0) {
            console.log(
                `No GGUF files found in base repo ${modelId}. Searching for community GGUF clones...`,
            );

            // Extract the base model name (e.g., "Meta-Llama-3-8B-Instruct" from "meta-llama/Meta-Llama-3-8B-Instruct")
            const baseModelName = modelId.split("/").pop();

            // Query the Hugging Face API for repositories matching the model name + "gguf"
            const searchResponse = await fetch(
                `https://huggingface.co/api/models?search=${baseModelName}+gguf&limit=5&sort=downloads&direction=-1`,
            );

            if (searchResponse.ok) {
                const searchResults = await searchResponse.json();

                // If we found alternative GGUF repositories, look inside the most popular one
                if (searchResults && searchResults.length > 0) {
                    const fallbackModelId = searchResults[0].id;
                    console.log(
                        `Found fallback GGUF repository: ${fallbackModelId}`,
                    );

                    // Fetch details for the fallback community GGUF repo
                    const fallbackDetailsResponse = await fetch(
                        `https://huggingface.co/api/models/${fallbackModelId}`,
                    );

                    if (fallbackDetailsResponse.ok) {
                        const fallbackData: HFModelDetails =
                            await fallbackDetailsResponse.json();

                        // Update our tracking variables with the fallback repository data
                        ggufFiles = fallbackData.siblings
                            ? fallbackData.siblings
                                  .map((s) => s.rfilename)
                                  .filter((name) => name.endsWith(".gguf"))
                            : [];

                        currentModelId = fallbackModelId;
                    }
                }
            }
        }

        // If even the fallback search couldn't find a GGUF version, exit gracefully
        if (ggufFiles.length === 0) {
            console.warn(
                "No GGUF files found in the base repo or community clones.",
            );
            return null;
        }

        // 3. Auto-select the best mobile quantization (Q4_K_M) if it exists, otherwise grab the first one
        let targetFilename =
            ggufFiles.find((name) => name.toLowerCase().includes("q4_k_m")) ||
            ggufFiles[0];

        // 🚀 FIX HERE: Strip out any folder paths right now so the UI component never receives them!
        // This changes "prompt_enhancer/mmproj-BF16.gguf" -> "mmproj-BF16.gguf"
        const safeCleanedFilename =
            targetFilename.split("/").pop() || "model.gguf";

        // 4. Construct the raw download URL using the resolved model ID (keep targetFilename here for the URL path!)
        const downloadUrl = `https://huggingface.co/${currentModelId}/resolve/main/${targetFilename}`;

        console.log("Resolved Download Target:", {
            url: downloadUrl,
            filename: safeCleanedFilename,
        });

        return {
            url: downloadUrl,
            filename: safeCleanedFilename, // Returning the safe, folder-free filename
        };
    } catch (error) {
        console.error("Error fetching file list:", error);
        return null;
    }
};
