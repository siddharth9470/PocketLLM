import * as FileSystem from "expo-file-system/legacy";
import {
  type ContextParams,
  initLlama,
  type LlamaContext,
  type NativeCompletionResult,
  type RNLlamaOAICompatibleMessage,
  type TokenData,
} from "llama.rn";
import { Platform } from "react-native";

import {
  ChatScreenLabels,
  CONTEXT_WINDOW_TOKENS_ANDROID,
  CONTEXT_WINDOW_TOKENS_IOS,
  CONTINUE_USER_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  GENERATION_TOKEN_BUFFER,
  MAX_COMPLETION_TOKENS,
  MIN_COMPLETION_TOKENS,
} from "@/constants/chat";
import { getDownloadedModels } from "@/db/ModelDB";
import type { ChatMessage } from "@/types/chat";
import { isLanguageModelGgufFilename } from "@/utils/ggufFileSelection";
import { buildStopSequences } from "@/utils/inferenceStopTokens";
import { sanitizeAssistantResponse, stripReasoningTags, stripReasoningTagsForStreaming } from "@/utils/reasoningFilter";

let llamaContext: LlamaContext | null = null;
let loadedModelPath: string | null = null;

const MAX_CONTEXT_MESSAGES = 20;

const JINJA_CHAT_FORMAT_OPTIONS = {
  jinja: true,
  enable_thinking: false,
  reasoning_format: "none" as const,
  chat_template_kwargs: { enable_thinking: false },
};

const SAMPLING_PENALTIES = {
  penalty_repeat: 1.08,
  penalty_freq: 0.05,
  penalty_last_n: 128,
};

export interface ChatCompletionResult {
  text: string;
  truncated?: boolean;
  metrics?: ChatMessage["metrics"];
}

export interface InferenceErrorInfo {
  userMessage: string;
  logMessage: string;
}

export type InferenceTokenHandler = (displayText: string) => void;

function getContextWindowSize(): number {
  return Platform.OS === "android" ? CONTEXT_WINDOW_TOKENS_ANDROID : CONTEXT_WINDOW_TOKENS_IOS;
}

function extractStreamingDisplayText(data: TokenData): string {
  const raw = data.content ?? data.accumulated_text ?? "";
  return stripReasoningTagsForStreaming(raw);
}

function isCompletionTruncated(result: NativeCompletionResult): boolean {
  return result.truncated === true || result.stopped_limit > 0 || result.context_full === true;
}

function finalizeCompletionText(cleanedText: string): string {
  return cleanedText.trim();
}

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
    n_ctx: getContextWindowSize(),
    n_gpu_layers: Platform.OS === "ios" ? 99 : 0,
    n_threads: Platform.OS === "android" ? 4 : undefined,
  };
}

async function resolveGenerationBudget(
  context: LlamaContext,
  messages: RNLlamaOAICompatibleMessage[],
  jinjaSupported: boolean,
): Promise<number> {
  const contextWindow = getContextWindowSize();
  let promptTokens = Math.floor(contextWindow * 0.45);

  try {
    if (jinjaSupported) {
      const formatted = await context.getFormattedChat(messages, null, JINJA_CHAT_FORMAT_OPTIONS);

      if (formatted.type === "jinja" && formatted.prompt) {
        const tokenized = await context.tokenize(formatted.prompt);
        promptTokens = tokenized.tokens.length;
      }
    } else {
      const serialized = messages
        .map((message) => (typeof message.content === "string" ? message.content : ""))
        .join("\n");
      const tokenized = await context.tokenize(serialized);
      promptTokens = tokenized.tokens.length;
    }
  } catch (error) {
    console.warn("Failed to measure prompt tokens; using conservative generation budget.", error);
  }

  const availableTokens = contextWindow - promptTokens - GENERATION_TOKEN_BUFFER;

  return Math.min(MAX_COMPLETION_TOKENS, Math.max(MIN_COMPLETION_TOKENS, availableTokens));
}

export async function resolveDownloadedModelPath(modelId: string): Promise<string | null> {
  const downloadedModels = await getDownloadedModels();
  const model = downloadedModels[modelId];
  const localFilePath = model?.downloadInfo?.localFilePath;

  if (model?.downloadInfo?.status === "completed" && localFilePath && isLanguageModelGgufFilename(localFilePath)) {
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

    if (message.status === "streaming" || message.status === "pending") {
      return false;
    }

    if (message.status === "error" && message.content.trim().length === 0) {
      return false;
    }

    return true;
  });

  const recentMessages = eligibleMessages.slice(-MAX_CONTEXT_MESSAGES);

  for (const message of recentMessages) {
    const content = message.role === "assistant" ? stripReasoningTags(message.content) : message.content;

    if (message.role === "assistant" && content.length === 0) {
      continue;
    }

    context.push({
      role: message.role,
      content,
    });
  }

  return context;
}

export function buildContinuationContext(
  messages: ChatMessage[],
  assistantMessageId: string,
  partialAssistantContent: string,
): RNLlamaOAICompatibleMessage[] {
  const assistantIndex = messages.findIndex((message) => message.id === assistantMessageId);
  const priorMessages = assistantIndex >= 0 ? messages.slice(0, assistantIndex) : messages;

  const baseContext = buildChatContextFromHistory(priorMessages);
  const cleanedPartial = stripReasoningTags(partialAssistantContent);

  return [
    ...baseContext,
    { role: "assistant", content: cleanedPartial },
    { role: "user", content: CONTINUE_USER_PROMPT },
  ];
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

async function executeCompletion(
  modelPath: string,
  messages: RNLlamaOAICompatibleMessage[],
  onToken?: InferenceTokenHandler,
): Promise<ChatCompletionResult> {
  await initializeModel(modelPath);

  if (!llamaContext) {
    throw new Error("Llama context is not initialized.");
  }

  await llamaContext.clearCache(false);

  const jinjaSupported = await llamaContext.isJinjaSupported();
  const nPredict = await resolveGenerationBudget(llamaContext, messages, jinjaSupported);
  const stopSequences = buildStopSequences(modelPath, jinjaSupported);

  const completionParams = {
    messages,
    n_predict: nPredict,
    stop: stopSequences,
    ...SAMPLING_PENALTIES,
    ...(jinjaSupported ? JINJA_CHAT_FORMAT_OPTIONS : {}),
  };

  const msgResult = await llamaContext.completion(
    completionParams,
    onToken
      ? (data: TokenData) => {
          onToken(extractStreamingDisplayText(data));
        }
      : undefined,
  );

  const timings = msgResult.timings;
  const cleanedText = sanitizeAssistantResponse(msgResult.text, msgResult.content);
  const truncated = isCompletionTruncated(msgResult);

  return {
    text: finalizeCompletionText(cleanedText),
    truncated,
    metrics: {
      ...(timings?.predicted_per_second !== undefined ? { tokensPerSecond: timings.predicted_per_second } : {}),
      ...(msgResult.tokens_evaluated !== undefined ? { promptTokens: msgResult.tokens_evaluated } : {}),
      ...(msgResult.tokens_predicted !== undefined ? { completionTokens: msgResult.tokens_predicted } : {}),
      ...(timings?.predicted_ms !== undefined ? { totalTimeMs: timings.predicted_ms } : {}),
    },
  };
}

export async function runInference(
  modelPath: string,
  messages: RNLlamaOAICompatibleMessage[],
  onToken?: InferenceTokenHandler,
): Promise<ChatCompletionResult> {
  try {
    return await executeCompletion(modelPath, messages, onToken);
  } catch (error) {
    console.error("Error during chat completion:", error);
    throw error;
  }
}

export async function runContinueInference(
  modelPath: string,
  messages: ChatMessage[],
  assistantMessageId: string,
  partialAssistantContent: string,
  onToken?: InferenceTokenHandler,
): Promise<ChatCompletionResult> {
  const continuationMessages = buildContinuationContext(messages, assistantMessageId, partialAssistantContent);

  try {
    return await executeCompletion(modelPath, continuationMessages, onToken);
  } catch (error) {
    console.error("Error during continuation completion:", error);
    throw error;
  }
}

export async function stopInference(): Promise<void> {
  if (!llamaContext) {
    return;
  }

  try {
    await llamaContext.stopCompletion();
  } catch (error) {
    console.error("Failed to stop Llama completion:", error);
  }
}

export async function releaseModelForPath(filePath: string): Promise<void> {
  if (!loadedModelPath || !llamaContext) {
    return;
  }

  if (normalizeModelPath(filePath) === normalizeModelPath(loadedModelPath)) {
    await releaseModel();
  }
}

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

export function isModelLoaded(): boolean {
  return llamaContext !== null;
}
