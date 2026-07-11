import type { LlamaContext, NativeCompletionResult, RNLlamaOAICompatibleMessage, TokenData } from "llama.rn";

import { GENERATION_TOKEN_BUFFER, MAX_COMPLETION_TOKENS, MIN_COMPLETION_TOKENS } from "@/constants/chat";
import { buildContinuationContext } from "@/services/inference/chatContext";
import { getActiveContext, getContextWindowSize, initializeModel } from "@/services/inference/llamaRuntime";
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

/** Extracts display-safe streaming text from a token callback, stripping hidden reasoning channels. */
function extractStreamingDisplayText(data: TokenData): string {
  const raw = data.content ?? data.accumulated_text ?? "";
  return stripReasoningTagsForStreaming(raw);
}

/** Returns true when the native completion stopped because it hit a token or context limit. */
function isCompletionTruncated(result: NativeCompletionResult): boolean {
  return result.truncated === true || result.stopped_limit > 0 || result.context_full === true;
}

/**
 * Computes how many completion tokens can be generated without exceeding n_ctx.
 * Measures the prompt via Jinja formatting when supported, otherwise falls back to a conservative estimate.
 */
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

/**
 * Runs a single chat completion against the loaded model: clears KV cache, budgets tokens,
 * applies stop sequences and sampling penalties, and optionally streams sanitized tokens to the caller.
 */
async function executeCompletion(
  modelPath: string,
  messages: RNLlamaOAICompatibleMessage[],
  onToken?: InferenceTokenHandler,
): Promise<ChatCompletionResult> {
  await initializeModel(modelPath);

  const context = getActiveContext();
  if (!context) {
    throw new Error("Llama context is not initialized.");
  }

  await context.clearCache(false);

  const jinjaSupported = await context.isJinjaSupported();
  const nPredict = await resolveGenerationBudget(context, messages, jinjaSupported);
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
): Promise<ChatCompletionResult> {
  try {
    return await executeCompletion(modelPath, messages, onToken);
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
    return await executeCompletion(modelPath, continuationMessages, onToken);
  } catch (error) {
    console.error("Error during continuation completion:", error);
    throw error;
  }
}
