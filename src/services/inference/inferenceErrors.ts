import { ChatScreenLabels } from "@/constants/chat";

export interface InferenceErrorInfo {
  userMessage: string;
  logMessage: string;
}

/** Maps native inference errors to user-facing alert copy and a log-safe message string. */
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
