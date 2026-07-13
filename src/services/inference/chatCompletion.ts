import type { NativeCompletionResult, RNLlamaOAICompatibleMessage, TokenData } from "llama.rn";

import {
  GENERATION_TOKEN_BUFFER,
  LONG_USER_PROMPT_MAX_CHARS,
  LONG_USER_PROMPT_N_PREDICT,
  MAX_COMPLETION_TOKENS,
  MEDIUM_USER_PROMPT_MAX_CHARS,
  MEDIUM_USER_PROMPT_N_PREDICT,
  MIN_COMPLETION_TOKENS,
  SHORT_USER_PROMPT_MAX_CHARS,
  SHORT_USER_PROMPT_N_PREDICT,
} from "@/constants/chat";
import { buildContinuationContext } from "@/services/inference/chatContext";
import {
  getActiveContext,
  getCachedJinjaSupported,
  getContextWindowSize,
  initializeModel,
} from "@/services/inference/llamaRuntime";
import type { ChatMessage } from "@/types/chat";
import { buildStopSequences } from "@/utils/inferenceStopTokens";
import { sanitizeAssistantResponse, stripReasoningTagsForStreaming } from "@/utils/reasoningFilter";

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

export type InferenceTokenHandler = (displayText: string) => void;

export interface InferenceOptions {
  /** Character length of the latest user turn; used to cap n_predict for short prompts. */
  userPromptLength?: number;
}

/** Extracts display-safe streaming text from a token callback, stripping hidden reasoning channels. */
function extractStreamingDisplayText(data: TokenData): string {
  const raw = data.content ?? data.accumulated_text ?? "";
  return stripReasoningTagsForStreaming(raw);
}

/** Returns true when the native completion stopped because it hit a token or context limit. */
function isCompletionTruncated(result: NativeCompletionResult): boolean {
  return result.truncated === true || result.stopped_limit > 0 || result.context_full === true;
}

/** Estimates prompt token count from message text without an extra Jinja format pass. */
function estimatePromptTokens(messages: RNLlamaOAICompatibleMessage[]): number {
  let charCount = 0;

  for (const message of messages) {
    if (typeof message.content === "string") {
      charCount += message.content.length;
    }
  }

  return Math.ceil(charCount / 3.5);
}

/**
 * Resolves n_predict using prompt-length heuristics instead of a pre-completion Jinja tokenize pass.
 * Short user prompts get a tight cap so greetings do not trigger long generations.
 */
function resolveNPredict(messages: RNLlamaOAICompatibleMessage[], userPromptLength?: number): number {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const latestUserLength =
    userPromptLength ?? (typeof lastUserMessage?.content === "string" ? lastUserMessage.content.length : 0);

  let promptCap = MIN_COMPLETION_TOKENS;
  if (latestUserLength <= SHORT_USER_PROMPT_MAX_CHARS) {
    promptCap = SHORT_USER_PROMPT_N_PREDICT;
  } else if (latestUserLength <= MEDIUM_USER_PROMPT_MAX_CHARS) {
    promptCap = MEDIUM_USER_PROMPT_N_PREDICT;
  } else if (latestUserLength <= LONG_USER_PROMPT_MAX_CHARS) {
    promptCap = LONG_USER_PROMPT_N_PREDICT;
  }

  const contextWindow = getContextWindowSize();
  const estimatedPromptTokens = estimatePromptTokens(messages);
  const availableTokens = contextWindow - estimatedPromptTokens - GENERATION_TOKEN_BUFFER;

  return Math.min(promptCap, MAX_COMPLETION_TOKENS, Math.max(32, availableTokens));
}

/**
 * Runs a single chat completion against the loaded model: clears KV cache, budgets tokens,
 * applies stop sequences and sampling penalties, and optionally streams sanitized tokens to the caller.
 */
async function executeCompletion(
  modelPath: string,
  messages: RNLlamaOAICompatibleMessage[],
  onToken?: InferenceTokenHandler,
  options?: InferenceOptions,
): Promise<ChatCompletionResult> {
  await initializeModel(modelPath);

  const context = getActiveContext();
  if (!context) {
    throw new Error("Llama context is not initialized.");
  }

  await context.clearCache(false);

  const jinjaSupported = getCachedJinjaSupported() ?? (await context.isJinjaSupported());
  const nPredict = resolveNPredict(messages, options?.userPromptLength);
  const stopSequences = buildStopSequences(modelPath, jinjaSupported);

  const completionParams = {
    messages,
    n_predict: nPredict,
    stop: stopSequences,
    ...SAMPLING_PENALTIES,
    ...(jinjaSupported ? JINJA_CHAT_FORMAT_OPTIONS : {}),
  };

  const msgResult = await context.completion(
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
    text: cleanedText.trim(),
    truncated,
    metrics: {
      ...(timings?.predicted_per_second !== undefined ? { tokensPerSecond: timings.predicted_per_second } : {}),
      ...(msgResult.tokens_evaluated !== undefined ? { promptTokens: msgResult.tokens_evaluated } : {}),
      ...(msgResult.tokens_predicted !== undefined ? { completionTokens: msgResult.tokens_predicted } : {}),
      ...(timings?.predicted_ms !== undefined ? { totalTimeMs: timings.predicted_ms } : {}),
    },
  };
}

/** Generates an assistant reply from a pre-built OAI message list, with optional streaming callbacks. */
export async function runInference(
  modelPath: string,
  messages: RNLlamaOAICompatibleMessage[],
  onToken?: InferenceTokenHandler,
  options?: InferenceOptions,
): Promise<ChatCompletionResult> {
  try {
    return await executeCompletion(modelPath, messages, onToken, options);
  } catch (error) {
    console.error("Error during chat completion:", error);
    throw error;
  }
}

/** Resumes a truncated assistant message by building continuation context and running a new completion. */
export async function runContinueInference(
  modelPath: string,
  messages: ChatMessage[],
  assistantMessageId: string,
  partialAssistantContent: string,
  onToken?: InferenceTokenHandler,
): Promise<ChatCompletionResult> {
  const continuationMessages = buildContinuationContext(messages, assistantMessageId, partialAssistantContent);

  try {
    return await executeCompletion(modelPath, continuationMessages, onToken, {
      userPromptLength: partialAssistantContent.length,
    });
  } catch (error) {
    console.error("Error during continuation completion:", error);
    throw error;
  }
}
