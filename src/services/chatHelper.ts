import * as FileSystem from "expo-file-system/legacy";
import { initLlama, type ContextParams, type LlamaContext, type RNLlamaOAICompatibleMessage } from "llama.rn";
import { Platform } from "react-native";

import { ChatScreenLabels, DEFAULT_SYSTEM_PROMPT } from "../constants/chat";
import { getDownloadedModels } from "../db/ModelDB";
import type { ChatMessage } from "../types/chat";
import { isLanguageModelGgufFilename } from "../utils/ggufFileSelection";

let llamaContext: LlamaContext | null = null;
let loadedModelPath: string | null = null;

const MAX_CONTEXT_MESSAGES = 20;

export interface ChatCompletionResult {
  text: string;
  metrics?: ChatMessage["metrics"];
}

export interface InferenceErrorInfo {
  userMessage: string;
  logMessage: string;
}

const STOP_WORDS = [
  "</s>",
  "<|end|>",
  "<|eot_id|>",
  "<|end_of_text|>",
  "<|im_end|>",
  "<|user|>",
  "\n<|user|>",
  "User:",
  "<|EOT|>",
  "<|END_OF_TURN_TOKEN|>",
  "<|end_of_turn|>",
  "<|endoftext|>",
];

export function normalizeModelPath(modelPath: string): string {
  const trimmed = modelPath.trim();
  if (trimmed.startsWith("file://")) {
    return trimmed;
  }

  return `file://${trimmed}`;
}

function toNativeModelPath(modelPath: string): string {
  return normalizeModelPath(modelPath).replace(/^file:\/\//, "");
}

async function getModelFileSizeBytes(modelPath: string): Promise<number> {
  const normalizedPath = normalizeModelPath(modelPath);
  const fileInfo = await FileSystem.getInfoAsync(normalizedPath);

  if (!fileInfo.exists || fileInfo.isDirectory) {
    throw new Error(`Model file not found at ${normalizedPath}`);
  }

  return fileInfo.size ?? 0;
}

function buildLlamaContextParams(modelPath: string): ContextParams {
  return {
    model: toNativeModelPath(modelPath),
    use_mlock: false,
    use_mmap: true,
    n_ctx: Platform.OS === "android" ? 1024 : 2048,
    n_gpu_layers: Platform.OS === "ios" ? 99 : 0,
    n_threads: Platform.OS === "android" ? 4 : undefined,
  };
}

export async function resolveDownloadedModelPath(modelId: string): Promise<string | null> {
  const downloadedModels = await getDownloadedModels();
  const model = downloadedModels[modelId];
  const localFilePath = model?.downloadInfo?.localFilePath;

  if (
    model?.downloadInfo?.status === "completed" &&
    localFilePath &&
    isLanguageModelGgufFilename(localFilePath)
  ) {
    return localFilePath;
  }

  return null;
}

export async function validateModelForInference(modelPath: string): Promise<string> {
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

export function buildChatContextFromHistory(
  messages: ChatMessage[],
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
): RNLlamaOAICompatibleMessage[] {
  const context: RNLlamaOAICompatibleMessage[] = [{ role: "system", content: systemPrompt }];

  const eligibleMessages = messages.filter((message) => {
    if (message.role !== "user" && message.role !== "assistant") {
      return false;
    }

    if (message.status === "error" && message.content.trim().length === 0) {
      return false;
    }

    return true;
  });

  const recentMessages = eligibleMessages.slice(-MAX_CONTEXT_MESSAGES);

  for (const message of recentMessages) {
    context.push({
      role: message.role,
      content: message.content,
    });
  }

  return context;
}

export function classifyInferenceError(error: unknown): InferenceErrorInfo {
  const logMessage = error instanceof Error ? error.message : String(error);
  const normalized = logMessage.toLowerCase();

  if (
    normalized.includes("out of memory") ||
    normalized.includes("oom") ||
    normalized.includes("cannot allocate") ||
    normalized.includes("memory allocation") ||
    normalized.includes("lowmemorykiller")
  ) {
    return {
      userMessage: ChatScreenLabels.INFERENCE_OOM,
      logMessage,
    };
  }

  if (
    normalized.includes("context") ||
    normalized.includes("n_ctx") ||
    normalized.includes("token limit") ||
    normalized.includes("exceed") ||
    normalized.includes("too long")
  ) {
    return {
      userMessage: ChatScreenLabels.INFERENCE_CONTEXT_LIMIT,
      logMessage,
    };
  }

  if (normalized.includes("not found") || normalized.includes("unreadable")) {
    return {
      userMessage: ChatScreenLabels.MODEL_UNAVAILABLE,
      logMessage,
    };
  }

  if (
    normalized.includes("failed to load model") ||
    normalized.includes("not a language-model") ||
    normalized.includes("mmproj")
  ) {
    return {
      userMessage: ChatScreenLabels.MODEL_INVALID_WEIGHTS,
      logMessage,
    };
  }

  return {
    userMessage: ChatScreenLabels.INFERENCE_FAILED,
    logMessage,
  };
}

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

export async function runInference(
  modelPath: string,
  messages: RNLlamaOAICompatibleMessage[],
): Promise<ChatCompletionResult> {
  await initializeModel(modelPath);

  if (!llamaContext) {
    throw new Error("Llama context is not initialized.");
  }

  try {
    await llamaContext.clearCache(false);

    const msgResult = await llamaContext.completion(
      {
        messages,
        n_predict: 256,
        stop: STOP_WORDS,
      },
      (_data) => {
        // Future enhancement: stream tokens to UI state as they generate.
      },
    );

    const timings = msgResult.timings;
    const totalTimeMs = timings?.predicted_ms;
    const completionTokens = msgResult.tokens_predicted;
    const promptTokens = msgResult.tokens_evaluated;
    const tokensPerSecond = timings?.predicted_per_second;

    return {
      text: msgResult.text,
      metrics: {
        ...(tokensPerSecond !== undefined ? { tokensPerSecond } : {}),
        ...(promptTokens !== undefined ? { promptTokens } : {}),
        ...(completionTokens !== undefined ? { completionTokens } : {}),
        ...(totalTimeMs !== undefined ? { totalTimeMs } : {}),
      },
    };
  } catch (error) {
    console.error("Error during chat completion:", error);
    throw error;
  }
}

export async function releaseModel(): Promise<void> {
  if (llamaContext) {
    try {
      await llamaContext.release();
    } catch (error) {
      console.error("Failed to release Llama model:", error);
    } finally {
      llamaContext = null;
      loadedModelPath = null;
    }
  }
}

export function isModelLoaded(): boolean {
  return llamaContext !== null;
}
