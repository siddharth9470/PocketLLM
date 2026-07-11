import * as FileSystem from "expo-file-system/legacy";
import { type ContextParams, initLlama, type LlamaContext } from "llama.rn";
import { Platform } from "react-native";

import { CONTEXT_WINDOW_TOKENS_ANDROID, CONTEXT_WINDOW_TOKENS_IOS } from "@/constants/chat";
import { getDownloadedModels } from "@/db/ModelDB";
import { isLanguageModelGgufFilename } from "@/utils/ggufFileSelection";

let llamaContext: LlamaContext | null = null;
let loadedModelPath: string | null = null;

/** Returns the platform-specific context window size (n_ctx) used when loading a model. */
export function getContextWindowSize(): number {
  return Platform.OS === "android" ? CONTEXT_WINDOW_TOKENS_ANDROID : CONTEXT_WINDOW_TOKENS_IOS;
}

/** Returns the active llama.rn context held by the module singleton, if any. */
export function getActiveContext(): LlamaContext | null {
  return llamaContext;
}

/** Normalizes a local model path to a consistent `file://` URI for filesystem and native bridge use. */
function normalizeModelPath(modelPath: string): string {
  const trimmed = modelPath.trim();
  if (trimmed.startsWith("file://")) {
    return trimmed;
  }

  return `file://${trimmed}`;
}

/** Strips the `file://` prefix so llama.rn receives an absolute filesystem path. */
function toNativeModelPath(modelPath: string): string {
  return normalizeModelPath(modelPath).replace(/^file:\/\//, "");
}

/** Reads the on-disk byte size of a model GGUF file, throwing if the path is missing or not a file. */
async function getModelFileSizeBytes(modelPath: string): Promise<number> {
  const normalizedPath = normalizeModelPath(modelPath);
  const fileInfo = await FileSystem.getInfoAsync(normalizedPath);

  if (!fileInfo.exists || fileInfo.isDirectory) {
    throw new Error(`Model file not found at ${normalizedPath}`);
  }

  return fileInfo.size ?? 0;
}

/** Builds llama.rn context parameters tuned for on-device mobile inference. */
function buildLlamaContextParams(modelPath: string): ContextParams {
  return {
    model: toNativeModelPath(modelPath),
    use_mlock: false,
    use_mmap: true,
    n_ctx: getContextWindowSize(),
    n_gpu_layers: Platform.OS === "ios" ? 99 : 0,
    n_threads: Platform.OS === "android" ? 4 : undefined,
  };
}

/** Validates that a GGUF path is a non-empty language-model weights file and returns the native path for llama.rn. */
async function validateModelForInference(modelPath: string): Promise<string> {
  if (!isLanguageModelGgufFilename(modelPath)) {
    throw new Error("Selected GGUF file is not a language-model weights file.");
  }

  const normalizedPath = normalizeModelPath(modelPath);
  const fileSizeBytes = await getModelFileSizeBytes(normalizedPath);

  if (fileSizeBytes === 0) {
    throw new Error("Model file is empty or unreadable.");
  }

  return toNativeModelPath(normalizedPath);
}

/** Resolves the local GGUF path for a downloaded model id, or null if not completed or not a language model. */
export async function resolveDownloadedModelPath(modelId: string): Promise<string | null> {
  const downloadedModels = await getDownloadedModels();
  const model = downloadedModels[modelId];
  const localFilePath = model?.downloadInfo?.localFilePath;

  if (model?.downloadInfo?.status === "completed" && localFilePath && isLanguageModelGgufFilename(localFilePath)) {
    return localFilePath;
  }

  return null;
}

/** Loads a GGUF model into memory via llama.rn, reusing the existing context when the same path is already active. */
export async function initializeModel(modelPath: string): Promise<void> {
  const normalizedPath = await validateModelForInference(modelPath);

  if (llamaContext && loadedModelPath === normalizedPath) {
    return;
  }

  if (llamaContext) {
    await releaseModel();
  }

  try {
    llamaContext = await initLlama(buildLlamaContextParams(normalizedPath));
    loadedModelPath = normalizedPath;
  } catch (error) {
    llamaContext = null;
    loadedModelPath = null;
    console.error("Failed to initialize Llama model:", error);
    throw error;
  }
}

/** Stops any active completion and frees the loaded llama.rn context and model from memory. */
export async function releaseModel(): Promise<void> {
  if (llamaContext) {
    try {
      await llamaContext.stopCompletion();
      await llamaContext.release();
    } catch (error) {
      console.error("Failed to release Llama model:", error);
    } finally {
      llamaContext = null;
      loadedModelPath = null;
    }
  }
}

/** Releases the llama.rn context only when the given path matches the currently loaded model. */
export async function releaseModelForPath(filePath: string): Promise<void> {
  if (!loadedModelPath || !llamaContext) {
    return;
  }

  if (normalizeModelPath(filePath) === normalizeModelPath(loadedModelPath)) {
    await releaseModel();
  }
}
