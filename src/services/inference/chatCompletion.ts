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

const COMPLETION_STOP_WORDS = [
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

/** Callback invoked with the accumulated assistant text on each streamed chunk. */
type StreamTokenHandler = (accumulatedContent: string) => void;

type ChatCompletionMessage = {
  role: string;
  content?: string;
};

/**
 * Which llama.rn completion is being run:
 * - `toolSelection`: pass 1, model may emit a `web_search` tool call
 * - `groundedAnswer`: pass 2, model answers from injected search results
 * - `directChat`: single-pass reply with no tools
 */
type CompletionPurpose = "toolSelection" | "groundedAnswer" | "directChat";

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
 * Generates an assistant reply for a user prompt.
 *
 * With Tavily configured the model first decides whether to call `web_search`;
 * if it does, Tavily runs and a second pass streams a grounded answer. Without
 * Tavily, a single on-device completion is streamed directly.
 */
export async function chatCompletion(
  prompt: string,
  onToken?: StreamTokenHandler,
  options?: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const userPrompt = prompt.trim();
  if (!userPrompt) {
    throw new Error("Prompt is empty");
  }

  const webSearchEnabled = isTavilyConfigured();
  console.log(`${LOG_PREFIX} Prompt:`, userPrompt);
  console.log(`${LOG_PREFIX} Tool calling enabled:`, webSearchEnabled);

  if (webSearchEnabled) {
    return generateReplyWithToolCalling(userPrompt, onToken, options);
  }

  return generateDirectReply(userPrompt, onToken);
}

/**
 * Runs the tool-selection pass, then either performs a web search or returns
 * the model's direct answer.
 */
async function generateReplyWithToolCalling(
  userPrompt: string,
  onToken?: StreamTokenHandler,
  options?: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  console.log(`${LOG_PREFIX} Pass 1: checking if model calls web_search (no streaming)`);

  const toolSelectionResponse = await runModelCompletion(
    buildConversationMessages(userPrompt),
    "toolSelection",
  );
  const webSearchRequest = resolveWebSearchToolCall(toolSelectionResponse, userPrompt);

  if (webSearchRequest) {
    return generateGroundedReply(userPrompt, webSearchRequest, onToken, options);
  }

  const assistantMessageContent = readAssistantContent(toolSelectionResponse);
  console.log(`${LOG_PREFIX} No tool call — direct answer:`, assistantMessageContent);

  streamToken(onToken, assistantMessageContent);
  return buildChatCompletionResult(assistantMessageContent, toolSelectionResponse);
}

/**
 * Single-pass reply when web search is unavailable. Tokens stream via `onToken`.
 */
async function generateDirectReply(
  userPrompt: string,
  onToken?: StreamTokenHandler,
): Promise<ChatCompletionResult> {
  console.log(`${LOG_PREFIX} Streaming direct answer (no tools configured)`);

  const directChatResponse = await runModelCompletion(
    buildConversationMessages(userPrompt),
    "directChat",
    onToken,
  );
  const assistantMessageContent = readAssistantContent(directChatResponse);

  console.log(`${LOG_PREFIX} Response:`, assistantMessageContent);
  return buildChatCompletionResult(assistantMessageContent, directChatResponse);
}

/**
 * Executes the web search requested by the model and streams a grounded answer.
 * Falls back to Tavily's own text if the second completion fails.
 */
async function generateGroundedReply(
  userPrompt: string,
  webSearchRequest: WebSearchToolCall,
  onToken?: StreamTokenHandler,
  options?: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  options?.onSearching?.();

  const searchQuery = userPrompt || webSearchRequest.query;
  console.log(`${LOG_PREFIX} Model requested web_search:`, searchQuery);

  const searchResult = await searchWeb(searchQuery);
  assertSearchHasResults(searchResult);

  const groundedSearchContext = buildSearchContext(searchResult);
  console.log(`${LOG_PREFIX} Streaming final answer from llama.rn (pass 2)`);

  try {
    const groundedAnswerResponse = await runModelCompletion(
      buildSearchGroundedMessages(userPrompt, groundedSearchContext),
      "groundedAnswer",
      (accumulatedContent) => streamToken(onToken, accumulatedContent, { skipToolCallText: true }),
    );

    const assistantMessageContent = replaceLeakedToolCall(
      readAssistantContent(groundedAnswerResponse),
      groundedSearchContext,
    );
    console.log(`${LOG_PREFIX} Final answer:`, assistantMessageContent);
    return buildChatCompletionResult(assistantMessageContent, groundedAnswerResponse);
  } catch (error) {
    console.error(`${LOG_PREFIX} Pass 2 failed, falling back to Tavily answer:`, error);

    const fallbackAnswer =
      searchResult.answer ?? searchResult.formatted.slice(0, MAX_SEARCH_CONTEXT_CHARS);
    streamToken(onToken, fallbackAnswer);
    return { text: fallbackAnswer };
  }
}

/**
 * Invokes llama.rn `context.completion`, forwarding each accumulated content
 * chunk to `onToken` when provided.
 */
async function runModelCompletion(
  messages: ChatCompletionMessage[],
  purpose: CompletionPurpose,
  onToken?: StreamTokenHandler,
): Promise<NativeCompletionResult> {
  const context = getActiveContext();
  if (!context) {
    throw new Error("No context found");
  }

  return context.completion(buildCompletionParams(messages, purpose), (data) => {
    const accumulatedContent = data.content ?? "";
    if (accumulatedContent.length > 0) {
      onToken?.(accumulatedContent);
    }
  });
}

/** Builds llama.rn completion params tuned for the given completion purpose. */
function buildCompletionParams(
  messages: ChatCompletionMessage[],
  purpose: CompletionPurpose,
): CompletionParams {
  return {
    messages: toNativeMessages(messages),
    n_predict: 512,
    reasoning_format: "auto",
    thinking_budget_tokens: 96,
    enable_thinking: false,
    stop: COMPLETION_STOP_WORDS,
    jinja: true,
    ...(purpose === "toolSelection" ? { tools: WEB_SEARCH_TOOL, tool_choice: "auto" } : {}),
    ...(purpose === "groundedAnswer" ? { force_pure_content: true } : {}),
  };
}

/** System + user messages for the tool-selection pass or a direct chat reply. */
function buildConversationMessages(userPrompt: string): ChatCompletionMessage[] {
  return [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}

/**
 * Messages for the grounded-answer pass. Search results are embedded in the user
 * turn (not an OAI `tool` role) for broad on-device model compatibility.
 */
function buildSearchGroundedMessages(
  userPrompt: string,
  groundedSearchContext: string,
): ChatCompletionMessage[] {
  return [
    { role: "system", content: CHAT_ANSWER_WITH_SEARCH_PROMPT },
    {
      role: "user",
      content: `Question: ${userPrompt}\n\nWeb search results:\n${groundedSearchContext}\n\nAnswer the question using the search results above.`,
    },
  ];
}

/** Prefers Tavily's concise answer as model context; otherwise truncates raw snippets. */
function buildSearchContext(searchResult: WebSearchResult): string {
  if (searchResult.answer?.trim()) {
    return `Answer: ${searchResult.answer.trim()}`;
  }

  return searchResult.formatted.slice(0, MAX_SEARCH_CONTEXT_CHARS);
}

/** Throws when Tavily returns neither an answer nor any results. */
function assertSearchHasResults(searchResult: WebSearchResult): void {
  if (searchResult.resultCount === 0 && !searchResult.answer) {
    console.error(`${LOG_PREFIX} Tavily returned no results`);
    throw new Error("Web search returned no results.");
  }
}

/** Returns display-safe assistant text from a llama.rn result (`content`, else `text`). */
function readAssistantContent(response: NativeCompletionResult): string {
  return response.content?.trim() || response.text?.trim() || "";
}

/** Substitutes the search context when the model leaks raw tool-call syntax into its reply. */
function replaceLeakedToolCall(assistantMessageContent: string, searchContextFallback: string): string {
  return looksLikeTextToolCall(assistantMessageContent) ? searchContextFallback : assistantMessageContent;
}

/** Forwards accumulated content to the UI callback, optionally suppressing tool-call syntax. */
function streamToken(
  onToken: StreamTokenHandler | undefined,
  accumulatedContent: string,
  options?: { skipToolCallText?: boolean },
): void {
  if (!onToken || accumulatedContent.length === 0) {
    return;
  }

  if (options?.skipToolCallText && looksLikeTextToolCall(accumulatedContent)) {
    return;
  }

  onToken(accumulatedContent);
}

/** Maps a llama.rn result into the public chat completion shape. */
function buildChatCompletionResult(
  assistantMessageContent: string,
  response: NativeCompletionResult,
): ChatCompletionResult {
  return {
    text: assistantMessageContent,
    metrics: mapCompletionMetrics(response),
  };
}

/** Converts llama.rn timing stats into chat metrics. */
function mapCompletionMetrics(response: NativeCompletionResult): ChatCompletionResult["metrics"] {
  const { timings } = response;
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
function toNativeMessages(messages: ChatCompletionMessage[]): RNLlamaOAICompatibleMessage[] {
  return messages as RNLlamaOAICompatibleMessage[];
}
