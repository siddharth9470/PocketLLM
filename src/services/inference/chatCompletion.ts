import type { CompletionParams, NativeCompletionResult, RNLlamaOAICompatibleMessage } from "llama.rn";

import {
  CHAT_ANSWER_WITH_SEARCH_PROMPT,
  CHAT_SYSTEM_PROMPT,
  WEB_SEARCH_TOOL,
} from "@/constants/chat";
import { isTavilyConfigured } from "@/config/env";
import { getActiveContext } from "@/services/inference/llamaRuntime";
import {
  looksLikeTextToolCall,
  resolveWebSearchToolCall,
  type WebSearchToolCall,
} from "@/services/inference/toolCallParsing";
import { searchWeb, type WebSearchResult } from "@/services/tavilySearch";

const STOP_WORDS = [
  "</s>",
  "<|end|>",
  "<|eot_id|>",
  "<|end_of_text|>",
  "<|im_end|>",
  "<|EOT|>",
  "<|END_OF_TURN_TOKEN|>",
  "<|end_of_turn|>",
  "<|endoftext|>",
];

const MAX_SEARCH_CONTEXT_CHARS = 3000;
const LOG_PREFIX = "[chatCompletion]";

type CompletionMessage = {
  role: string;
  content?: string;
};

type CompletionMode = "tools" | "answer" | "chat";

export interface ChatCompletionResult {
  text: string;
  metrics?: {
    tokensPerSecond?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTimeMs?: number;
  };
}

export interface ChatCompletionOptions {
  onSearching?: () => void;
}

/**
 * Entry point for generating an assistant reply.
 *
 * When Tavily is configured, pass 1 lets the model decide whether to call
 * `web_search`. If it does, Tavily runs and pass 2 streams the final answer.
 * Otherwise a single on-device completion is returned (streamed when possible).
 */
export async function chatCompletion(
  prompt: string,
  onToken?: (accumulatedText: string) => void,
  options?: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const userPrompt = prompt.trim();
  if (!userPrompt) {
    throw new Error("Prompt is empty");
  }

  console.log(`${LOG_PREFIX} Prompt:`, userPrompt);
  console.log(`${LOG_PREFIX} Tool calling enabled:`, isTavilyConfigured());

  if (isTavilyConfigured()) {
    return runToolCallingCompletion(userPrompt, onToken, options);
  }

  return runDirectCompletion(userPrompt, onToken);
}

/**
 * Pass 1 with tools (no streaming) → optional Tavily search → pass 2 streams answer.
 */
async function runToolCallingCompletion(
  userPrompt: string,
  onToken?: (accumulatedText: string) => void,
  options?: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  console.log(`${LOG_PREFIX} Pass 1: checking if model calls web_search (no streaming)`);

  const pass1Result = await complete(buildInitialMessages(userPrompt), "tools");
  const toolCall = resolveWebSearchToolCall(pass1Result, userPrompt);

  if (toolCall) {
    return answerWithWebSearch(userPrompt, toolCall, onToken, options);
  }

  const text = extractAssistantText(pass1Result);
  console.log(`${LOG_PREFIX} No tool call — direct answer:`, text);

  emitToken(onToken, text);
  return toChatResult(text, pass1Result);
}

/**
 * Single-pass chat when Tavily is not configured. Tokens stream via `onToken`.
 */
async function runDirectCompletion(
  userPrompt: string,
  onToken?: (accumulatedText: string) => void,
): Promise<ChatCompletionResult> {
  console.log(`${LOG_PREFIX} Streaming direct answer (no tools configured)`);

  const result = await complete(buildInitialMessages(userPrompt), "chat", onToken);
  const text = extractAssistantText(result);

  console.log(`${LOG_PREFIX} Response:`, text);
  return toChatResult(text, result);
}

/**
 * Runs Tavily, then streams a second llama.rn pass grounded in search results.
 * Falls back to Tavily text if pass 2 fails.
 */
async function answerWithWebSearch(
  userPrompt: string,
  toolCall: WebSearchToolCall,
  onToken?: (accumulatedText: string) => void,
  options?: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  options?.onSearching?.();

  const searchQuery = userPrompt || toolCall.query;
  console.log(`${LOG_PREFIX} Model requested web_search:`, searchQuery);

  const searchResult = await searchWeb(searchQuery);
  assertSearchHasResults(searchResult);

  const searchContext = compactSearchContext(searchResult);
  console.log(`${LOG_PREFIX} Streaming final answer from llama.rn (pass 2)`);

  try {
    const pass2Result = await complete(
      buildSearchGroundedMessages(userPrompt, searchContext),
      "answer",
      (accumulatedText) => emitToken(onToken, accumulatedText, { skipToolCallText: true }),
    );

    const text = sanitizeAssistantText(extractAssistantText(pass2Result), searchContext);
    console.log(`${LOG_PREFIX} Final answer:`, text);
    return toChatResult(text, pass2Result);
  } catch (error) {
    console.error(`${LOG_PREFIX} Pass 2 failed, falling back to Tavily answer:`, error);

    const fallbackText = searchResult.answer ?? searchResult.formatted.slice(0, MAX_SEARCH_CONTEXT_CHARS);
    emitToken(onToken, fallbackText);
    return { text: fallbackText };
  }
}

/**
 * Invokes llama.rn `context.completion`. Each callback receives accumulated `data.content`.
 */
async function complete(
  messages: CompletionMessage[],
  mode: CompletionMode,
  onToken?: (accumulatedText: string) => void,
): Promise<NativeCompletionResult> {
  const context = getActiveContext();
  if (!context) {
    throw new Error("No context found");
  }

  return context.completion(buildCompletionParams(messages, mode), (data) => {
    const chunk = data.content ?? "";
    if (chunk.length > 0) {
      onToken?.(chunk);
    }
  });
}

/**
 * Builds llama.rn completion params for the given conversation mode.
 */
function buildCompletionParams(messages: CompletionMessage[], mode: CompletionMode): CompletionParams {
  return {
    messages: toNativeMessages(messages),
    n_predict: 512,
    reasoning_format: "auto",
    thinking_budget_tokens: 96,
    enable_thinking: false,
    stop: STOP_WORDS,
    jinja: true,
    ...(mode === "tools" ? { tools: WEB_SEARCH_TOOL, tool_choice: "auto" } : {}),
    ...(mode === "answer" ? { force_pure_content: true } : {}),
  };
}

/** System + user messages for the first pass / direct chat. */
function buildInitialMessages(userPrompt: string): CompletionMessage[] {
  return [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}

/**
 * System + user messages for pass 2 after Tavily returns.
 * Uses embedded results (not OAI `tool` role) for broad model compatibility.
 */
function buildSearchGroundedMessages(userPrompt: string, searchContext: string): CompletionMessage[] {
  return [
    { role: "system", content: CHAT_ANSWER_WITH_SEARCH_PROMPT },
    {
      role: "user",
      content: `Question: ${userPrompt}\n\nWeb search results:\n${searchContext}\n\nAnswer the question using the search results above.`,
    },
  ];
}

/**
 * Prefers Tavily's concise answer for the LLM context; otherwise truncates raw snippets.
 */
function compactSearchContext(searchResult: WebSearchResult): string {
  if (searchResult.answer?.trim()) {
    return `Answer: ${searchResult.answer.trim()}`;
  }

  return searchResult.formatted.slice(0, MAX_SEARCH_CONTEXT_CHARS);
}

/** Throws when Tavily returns nothing usable. */
function assertSearchHasResults(searchResult: WebSearchResult): void {
  if (searchResult.resultCount === 0 && !searchResult.answer) {
    console.error(`${LOG_PREFIX} Tavily returned no results`);
    throw new Error("Web search returned no results.");
  }
}

/**
 * Returns display-safe assistant text from a llama.rn result (`content`, else `text`).
 */
function extractAssistantText(result: NativeCompletionResult): string {
  return result.content?.trim() || result.text?.trim() || "";
}

/**
 * Replaces raw tool-call output with search context when the model re-emits tool syntax.
 */
function sanitizeAssistantText(text: string, searchFallback: string): string {
  return looksLikeTextToolCall(text) ? searchFallback : text;
}

/** Forwards accumulated text to the UI callback, optionally ignoring tool-call strings. */
function emitToken(
  onToken: ((accumulatedText: string) => void) | undefined,
  text: string,
  options?: { skipToolCallText?: boolean },
): void {
  if (!onToken || text.length === 0) {
    return;
  }

  if (options?.skipToolCallText && looksLikeTextToolCall(text)) {
    return;
  }

  onToken(text);
}

/** Maps a llama.rn result into the public chat completion shape. */
function toChatResult(text: string, result: NativeCompletionResult): ChatCompletionResult {
  return {
    text,
    metrics: mapCompletionMetrics(result),
  };
}

/** Converts llama.rn timing stats into chat metrics. */
function mapCompletionMetrics(result: NativeCompletionResult): ChatCompletionResult["metrics"] {
  const { timings } = result;
  if (!timings) {
    return undefined;
  }

  return {
    tokensPerSecond: timings.predicted_per_second,
    promptTokens: timings.prompt_n,
    completionTokens: timings.predicted_n,
    totalTimeMs: timings.prompt_ms + timings.predicted_ms,
  };
}

/** Casts app messages to the llama.rn OAI-compatible shape. */
function toNativeMessages(messages: CompletionMessage[]): RNLlamaOAICompatibleMessage[] {
  return messages as RNLlamaOAICompatibleMessage[];
}
