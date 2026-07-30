import type { CompletionParams, NativeCompletionResult, RNLlamaOAICompatibleMessage } from "llama.rn";
import { isTavilyConfigured } from "@/config/env";
import {
  buildChatTools,
  CHAT_ANSWER_WITH_RAG_PROMPT,
  CHAT_ANSWER_WITH_SEARCH_PROMPT,
  CHAT_SYSTEM_PROMPT,
  ChatScreenLabels,
  type ChatToolDefinition,
} from "@/constants/chat";
import { getActiveContext } from "@/services/inference/llamaRuntime";
import {
  type ChatToolCall,
  looksLikeTextToolCall,
  mayContainToolSyntax,
  resolveChatToolCall,
  stripToolCallTags,
} from "@/services/inference/toolCallParsing";
import { appLogger, type ScopedLogger } from "@/services/logger";
import { buildRagContextForQuery } from "@/services/ragService";
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

/** Callback invoked with the accumulated assistant text on each streamed chunk. */
type StreamTokenHandler = (accumulatedContent: string) => void;

type ChatCompletionMessage = {
  role: string;
  content?: string;
};

/**
 * Which llama.rn completion is being run:
 * - `toolSelection`: pass 1, model may emit `web_search` or `search_local_history`
 * - `groundedAnswer`: pass 2, model answers from injected tool results
 */
type CompletionPurpose = "toolSelection" | "groundedAnswer";

/**
 * Streaming mode for llama.rn token callbacks:
 * - `direct`: forward accumulated content as-is (Pass 2 / pure answers)
 * - `guarded`: cheap tool-syntax gate only when markers appear (Pass 1)
 */
type StreamMode = "direct" | "guarded";

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
  /**
   * Invoked immediately before a web/local tool runs so the chat UI can show a
   * status placeholder. Not called for direct answers.
   */
  onSearching?: () => void;
  /** Correlates LLM/tool/RAG logs with the originating Chat send trace. */
  traceId?: string;
}

function pipelineLogs(traceId?: string): { llm: ScopedLogger; tool: ScopedLogger } {
  if (!traceId) {
    return { llm: appLogger.domain("LLM"), tool: appLogger.domain("Tool") };
  }

  return {
    llm: appLogger.forTrace("LLM", traceId),
    tool: appLogger.forTrace("Tool", traceId),
  };
}

/**
 * Generates an assistant reply for a user prompt via on-device tool calling.
 *
 * Flow:
 * 1. Pass 1 (tool selection) — the model may answer directly, call `web_search`,
 *    or call `search_local_history`. No automatic vector search runs here; simple
 *    prompts such as "Hi" complete in a single pass with zero DB KNN latency.
 * 2. If `web_search` — Tavily runs, then Pass 2 streams a grounded answer.
 * 3. If `search_local_history` — sqlite-vec KNN runs for the tool `query`, then
 *    Pass 2 streams an answer grounded in retrieved chat excerpts.
 *
 * Streaming: Pass 2 forwards tokens directly (no per-token parsing). Pass 1 uses
 * a cheap marker gate and only strips tool syntax when markers are present.
 * Background message embedding is owned by the chat store and is never awaited.
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

  const logs = pipelineLogs(options?.traceId);
  const webSearchEnabled = isTavilyConfigured();
  const tools = buildChatTools(webSearchEnabled);

  logs.llm.info("completion.started", {
    promptLen: userPrompt.length,
    toolsEnabled: true,
    webSearchEnabled,
    promptPreview: userPrompt,
  });

  return generateReplyWithToolCalling(userPrompt, tools, onToken, options, logs);
}

/**
 * Runs Pass 1 tool selection, then either executes the requested tool + Pass 2
 * or returns the model's direct answer immediately.
 *
 * Tool routing is driven strictly by the model's structured (or inline) tool
 * output — never by heuristics over the user prompt.
 */
async function generateReplyWithToolCalling(
  userPrompt: string,
  tools: ChatToolDefinition[],
  onToken?: StreamTokenHandler,
  options?: ChatCompletionOptions,
  logs: { llm: ScopedLogger; tool: ScopedLogger } = pipelineLogs(),
): Promise<ChatCompletionResult> {
  logs.llm.info("pass1.tool_selection.started");

  const toolSelectionResponse = await runModelCompletion(
    buildConversationMessages(userPrompt),
    "toolSelection",
    tools,
    createStreamHandler(onToken, "guarded"),
    logs.llm,
  );
  const toolCall = resolveChatToolCall(toolSelectionResponse, userPrompt);

  if (toolCall?.name === "web_search") {
    if (!isTavilyConfigured()) {
      logs.llm.warn("pass1.tool_call_ignored", {
        tool: "web_search",
        reason: "web_search_disabled",
      });
    } else {
      logs.llm.info("pass1.tool_call_detected", { tool: "web_search", query: toolCall.query });
      return generateWebGroundedReply(userPrompt, toolCall, onToken, options, logs);
    }
  }

  if (toolCall?.name === "search_local_history") {
    logs.llm.info("pass1.tool_call_detected", { tool: "search_local_history", query: toolCall.query });
    return generateRagGroundedReply(userPrompt, toolCall, onToken, options, logs);
  }

  const assistantMessageContent = toDisplayContent(readAssistantContent(toolSelectionResponse));
  logs.llm.info("pass1.direct_answer", {
    replyLen: assistantMessageContent.length,
    replyPreview: assistantMessageContent,
  });

  return buildChatCompletionResult(assistantMessageContent, toolSelectionResponse);
}

/**
 * Executes the web search requested by the model and streams a grounded Pass 2
 * answer using `CHAT_ANSWER_WITH_SEARCH_PROMPT`. Falls back to Tavily's own text
 * if the second completion fails.
 */
async function generateWebGroundedReply(
  userPrompt: string,
  webSearchRequest: ChatToolCall,
  onToken?: StreamTokenHandler,
  options?: ChatCompletionOptions,
  logs: { llm: ScopedLogger; tool: ScopedLogger } = pipelineLogs(),
): Promise<ChatCompletionResult> {
  if (!isTavilyConfigured()) {
    logs.tool.error("web_search.unavailable");
    throw new Error("Web search is not configured.");
  }

  options?.onSearching?.();

  const searchQuery = userPrompt || webSearchRequest.query;
  logs.tool.info("web_search.started", { query: searchQuery });

  const searchResult = await searchWeb(searchQuery, options?.traceId);
  assertSearchHasResults(searchResult, logs.tool);
  logs.tool.info("web_search.completed", {
    resultCount: searchResult.resultCount,
    hasAnswer: Boolean(searchResult.answer),
  });

  const groundedSearchContext = buildSearchContext(searchResult);
  logs.llm.info("pass2.grounded_answer.started", { contextLen: groundedSearchContext.length });

  try {
    const groundedAnswerResponse = await runModelCompletion(
      buildSearchGroundedMessages(userPrompt, groundedSearchContext),
      "groundedAnswer",
      undefined,
      createStreamHandler(onToken, "direct"),
      logs.llm,
    );

    const rawAssistantContent = readAssistantContent(groundedAnswerResponse);
    const displayContent = finalizeGroundedContent(rawAssistantContent, groundedSearchContext);
    logs.llm.info("pass2.grounded_answer.completed", {
      replyLen: displayContent.length,
      replyPreview: displayContent,
    });
    return buildChatCompletionResult(displayContent, groundedAnswerResponse);
  } catch (error) {
    logs.llm.error("pass2.grounded_answer.failed", error);

    const fallbackAnswer = searchResult.answer ?? searchResult.formatted.slice(0, MAX_SEARCH_CONTEXT_CHARS);
    onToken?.(fallbackAnswer);
    logs.tool.warn("web_search.fallback_answer", { replyLen: fallbackAnswer.length });
    return { text: fallbackAnswer };
  }
}

/**
 * Executes on-demand local history retrieval for a `search_local_history` tool call.
 *
 * Steps:
 * 1. Notify the UI via `onSearching` and stream `SEARCHING_HISTORY` into the bubble.
 * 2. Embed the tool `query` and run sqlite-vec KNN via `buildRagContextForQuery`.
 * 3. Stream Pass 2 with `CHAT_ANSWER_WITH_RAG_PROMPT` (direct token path — no stripping).
 *
 * Empty retrieval still proceeds to Pass 2 so the model can say nothing matched.
 */
async function generateRagGroundedReply(
  userPrompt: string,
  localSearchRequest: ChatToolCall,
  onToken?: StreamTokenHandler,
  options?: ChatCompletionOptions,
  logs: { llm: ScopedLogger; tool: ScopedLogger } = pipelineLogs(),
): Promise<ChatCompletionResult> {
  options?.onSearching?.();
  onToken?.(ChatScreenLabels.SEARCHING_HISTORY);

  const searchQuery = localSearchRequest.query.trim() || userPrompt;
  logs.tool.info("local_history.started", { query: searchQuery });

  const ragContext = await buildRagContextForQuery(searchQuery, options?.traceId);
  const hasContext = ragContext.trim().length > 0;
  logs.tool.info("local_history.completed", {
    hasContext,
    contextLen: ragContext.length,
  });

  const groundedContext = hasContext ? ragContext : "No relevant past conversation excerpts were found for this query.";

  logs.llm.info("pass2.grounded_answer.started", { contextLen: groundedContext.length });

  const groundedAnswerResponse = await runModelCompletion(
    buildRagGroundedMessages(userPrompt, groundedContext),
    "groundedAnswer",
    undefined,
    createStreamHandler(onToken, "direct"),
    logs.llm,
  );

  const rawAssistantContent = readAssistantContent(groundedAnswerResponse);
  const displayContent = finalizeGroundedContent(rawAssistantContent, groundedContext);

  logs.llm.info("pass2.grounded_answer.completed", {
    replyLen: displayContent.length,
    replyPreview: displayContent,
  });
  return buildChatCompletionResult(displayContent, groundedAnswerResponse);
}

/**
 * Invokes llama.rn `context.completion`, forwarding each accumulated content
 * chunk to `onToken` when provided. Tools are attached only for Pass 1.
 *
 * Immediately before the native call, logs the exact system + user payload via
 * AppLogger so the outgoing inference messages remain inspectable in the trace.
 */
async function runModelCompletion(
  messages: ChatCompletionMessage[],
  purpose: CompletionPurpose,
  tools: ChatToolDefinition[] | undefined,
  onToken?: StreamTokenHandler,
  llm: ScopedLogger = appLogger.domain("LLM"),
): Promise<NativeCompletionResult> {
  const context = getActiveContext();
  if (!context) {
    throw new Error("No context found");
  }

  logOutgoingInferencePayload(llm, messages, purpose);

  return context.completion(buildCompletionParams(messages, purpose, tools), (data) => {
    const accumulatedContent = data.content ?? "";
    if (accumulatedContent.length > 0) {
      onToken?.(accumulatedContent);
    }
  });
}

/**
 * Emits hierarchical payload logs for the messages about to be sent to llama.rn.
 * System and user turns are logged as separate tree branches with bounded previews
 * so large grounded/RAG system prompts stay readable without flooding the console.
 */
function logOutgoingInferencePayload(
  llm: ScopedLogger,
  messages: ChatCompletionMessage[],
  purpose: CompletionPurpose,
): void {
  const systemContent = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content?.trim() ?? "")
    .filter((content) => content.length > 0)
    .join("\n\n");

  const userContent = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content?.trim() ?? "")
    .filter((content) => content.length > 0)
    .join("\n\n");

  const roles = messages.map((message) => message.role).join(",");

  llm.info("payload.system_prompt", {
    purpose,
    systemPromptLen: systemContent.length,
    systemPromptPreview: systemContent,
  });

  llm.info("payload.messages", {
    purpose,
    messageCount: messages.length,
    roles,
    userPromptPreview: userContent,
  });
}

/** Builds llama.rn completion params tuned for the given completion purpose. */
function buildCompletionParams(
  messages: ChatCompletionMessage[],
  purpose: CompletionPurpose,
  tools: ChatToolDefinition[] | undefined,
): CompletionParams {
  return {
    messages: toNativeMessages(messages),
    n_predict: 512,
    reasoning_format: "auto",
    thinking_budget_tokens: 96,
    enable_thinking: false,
    stop: COMPLETION_STOP_WORDS,
    jinja: true,
    ...(purpose === "toolSelection" && tools ? { tools, tool_choice: "auto" } : {}),
    ...(purpose === "groundedAnswer" ? { force_pure_content: true } : {}),
  };
}

/** System + user messages for the tool-selection pass (no pre-injected RAG). */
function buildConversationMessages(userPrompt: string): ChatCompletionMessage[] {
  return [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}

/**
 * Messages for the web-search grounded-answer pass. Search results are embedded
 * in the user turn (not an OAI `tool` role) for broad on-device model compatibility.
 */
function buildSearchGroundedMessages(userPrompt: string, groundedSearchContext: string): ChatCompletionMessage[] {
  return [
    { role: "system", content: CHAT_ANSWER_WITH_SEARCH_PROMPT },
    {
      role: "user",
      content: `Question: ${userPrompt}\n\nWeb search results:\n${groundedSearchContext}\n\nAnswer the question using the search results above.`,
    },
  ];
}

/**
 * Messages for the local-history grounded-answer pass. Retrieved chat excerpts
 * are embedded in the user turn using `CHAT_ANSWER_WITH_RAG_PROMPT`.
 */
function buildRagGroundedMessages(userPrompt: string, ragContext: string): ChatCompletionMessage[] {
  return [
    { role: "system", content: CHAT_ANSWER_WITH_RAG_PROMPT },
    {
      role: "user",
      content: `Question: ${userPrompt}\n\nPast conversation excerpts:\n${ragContext}\n\nAnswer the question using the excerpts above when relevant.`,
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
function assertSearchHasResults(searchResult: WebSearchResult, tool: ScopedLogger = appLogger.domain("Tool")): void {
  if (searchResult.resultCount === 0 && !searchResult.answer) {
    tool.error("web_search.empty_results");
    throw new Error("Web search returned no results.");
  }
}

/** Returns display-safe assistant text from a llama.rn result (`content`, else `text`). */
function readAssistantContent(response: NativeCompletionResult): string {
  return response.content?.trim() || response.text?.trim() || "";
}

/** Strips raw tool-call syntax before text is persisted as the final reply. */
function toDisplayContent(raw: string): string {
  return stripToolCallTags(raw);
}

/**
 * Builds the UI stream callback for a completion pass.
 * `direct` is the hot path (Pass 2): zero parsing per token.
 * `guarded` is Pass 1: only strips when cheap marker detection hits.
 */
function createStreamHandler(
  onToken: StreamTokenHandler | undefined,
  mode: StreamMode,
): StreamTokenHandler | undefined {
  if (!onToken) {
    return undefined;
  }

  if (mode === "direct") {
    return (accumulatedContent) => {
      if (accumulatedContent.length > 0) {
        onToken(accumulatedContent);
      }
    };
  }

  return (accumulatedContent) => streamGuardedToken(onToken, accumulatedContent);
}

/**
 * Pass-1 streaming helper. Ordinary prose is forwarded immediately. When tool
 * markers appear, strips the tool payload once so partial JSON never paints the UI.
 * Pure JSON tool objects are suppressed entirely until Pass 1 resolves.
 */
function streamGuardedToken(onToken: StreamTokenHandler, accumulatedContent: string): void {
  if (accumulatedContent.length === 0) {
    return;
  }

  if (!mayContainToolSyntax(accumulatedContent)) {
    onToken(accumulatedContent);
    return;
  }

  const trimmed = accumulatedContent.trim();
  if (trimmed.startsWith("{") && (trimmed.includes('"search_local_history"') || trimmed.includes('"web_search"'))) {
    return;
  }

  const displayContent = stripToolCallTags(accumulatedContent);
  if (displayContent.length > 0) {
    onToken(displayContent);
  }
}

/** Finalizes Pass-2 text once: replace leaked tool calls, otherwise light strip. */
function finalizeGroundedContent(rawAssistantContent: string, contextFallback: string): string {
  if (looksLikeTextToolCall(rawAssistantContent)) {
    return contextFallback;
  }

  return toDisplayContent(rawAssistantContent);
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
