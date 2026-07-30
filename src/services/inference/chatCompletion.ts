import type { CompletionParams, NativeCompletionResult, RNLlamaOAICompatibleMessage } from "llama.rn";
import { isTavilyConfigured } from "@/config/env";
import { CHAT_ANSWER_WITH_SEARCH_PROMPT, CHAT_SYSTEM_PROMPT, WEB_SEARCH_TOOL } from "@/constants/chat";
import { getActiveContext } from "@/services/inference/llamaRuntime";
import {
  looksLikeTextToolCall,
  resolveWebSearchToolCall,
  stripToolCallTags,
  type WebSearchToolCall,
} from "@/services/inference/toolCallParsing";
import { appLogger, type ScopedLogger } from "@/services/logger";
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
  ragContext?: string;
  /** Correlates LLM/tool logs with the originating Chat send trace. */
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

  const logs = pipelineLogs(options?.traceId);
  const webSearchEnabled = isTavilyConfigured();
  logs.llm.info("completion.started", {
    promptLen: userPrompt.length,
    toolsEnabled: webSearchEnabled,
    hasRagContext: Boolean(options?.ragContext?.trim()),
    promptPreview: userPrompt,
  });

  if (webSearchEnabled) {
    return generateReplyWithToolCalling(userPrompt, onToken, options, logs);
  }

  return generateDirectReply(userPrompt, onToken, options?.ragContext, logs.llm);
}

/**
 * Runs the tool-selection pass, then either performs a web search or returns
 * the model's direct answer.
 */
async function generateReplyWithToolCalling(
  userPrompt: string,
  onToken?: StreamTokenHandler,
  options?: ChatCompletionOptions,
  logs: { llm: ScopedLogger; tool: ScopedLogger } = pipelineLogs(),
): Promise<ChatCompletionResult> {
  logs.llm.info("pass1.tool_selection.started");

  const uiStreamHandler = createUiStreamHandler(onToken);
  const toolSelectionResponse = await runModelCompletion(
    buildConversationMessages(userPrompt, options?.ragContext),
    "toolSelection",
    uiStreamHandler,
  );
  const webSearchRequest = resolveWebSearchToolCall(toolSelectionResponse, userPrompt);

  if (webSearchRequest) {
    logs.llm.info("pass1.tool_call_detected", { tool: "web_search", query: webSearchRequest.query });
    return generateGroundedReply(userPrompt, webSearchRequest, onToken, options, logs);
  }

  const assistantMessageContent = toDisplayContent(readAssistantContent(toolSelectionResponse));
  logs.llm.info("pass1.direct_answer", {
    replyLen: assistantMessageContent.length,
    replyPreview: assistantMessageContent,
  });

  return buildChatCompletionResult(assistantMessageContent, toolSelectionResponse);
}

/**
 * Single-pass reply when web search is unavailable. Tokens stream via `onToken`.
 */
async function generateDirectReply(
  userPrompt: string,
  onToken?: StreamTokenHandler,
  ragContext?: string,
  llm: ScopedLogger = appLogger.domain("LLM"),
): Promise<ChatCompletionResult> {
  llm.info("pass.direct.started");

  const directChatResponse = await runModelCompletion(
    buildConversationMessages(userPrompt, ragContext),
    "directChat",
    createUiStreamHandler(onToken),
  );
  const assistantMessageContent = toDisplayContent(readAssistantContent(directChatResponse));

  llm.info("pass.direct.completed", {
    replyLen: assistantMessageContent.length,
    replyPreview: assistantMessageContent,
  });
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
  logs: { llm: ScopedLogger; tool: ScopedLogger } = pipelineLogs(),
): Promise<ChatCompletionResult> {
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
      createUiStreamHandler(onToken),
    );

    const rawAssistantContent = readAssistantContent(groundedAnswerResponse);
    const assistantMessageContent = replaceLeakedToolCall(rawAssistantContent, groundedSearchContext);
    const displayContent = looksLikeTextToolCall(rawAssistantContent)
      ? assistantMessageContent
      : toDisplayContent(rawAssistantContent);
    logs.llm.info("pass2.grounded_answer.completed", {
      replyLen: displayContent.length,
      replyPreview: displayContent,
    });
    return buildChatCompletionResult(displayContent, groundedAnswerResponse);
  } catch (error) {
    logs.llm.error("pass2.grounded_answer.failed", error);

    const fallbackAnswer = searchResult.answer ?? searchResult.formatted.slice(0, MAX_SEARCH_CONTEXT_CHARS);
    streamToken(onToken, fallbackAnswer);
    logs.tool.warn("web_search.fallback_answer", { replyLen: fallbackAnswer.length });
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
function buildCompletionParams(messages: ChatCompletionMessage[], purpose: CompletionPurpose): CompletionParams {
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
function buildConversationMessages(userPrompt: string, ragContext?: string): ChatCompletionMessage[] {
  const trimmedRagContext = ragContext?.trim();
  const systemContent = trimmedRagContext ? `${CHAT_SYSTEM_PROMPT}\n\n${trimmedRagContext}` : CHAT_SYSTEM_PROMPT;

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userPrompt },
  ];
}

/**
 * Messages for the grounded-answer pass. Search results are embedded in the user
 * turn (not an OAI `tool` role) for broad on-device model compatibility.
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

/** Strips raw tool-call syntax before text is shown or persisted. */
function toDisplayContent(raw: string): string {
  return stripToolCallTags(raw);
}

/** Progressive UI updater shared by every streamed completion pass (including Tavily pass 2). */
function createUiStreamHandler(onToken?: StreamTokenHandler): StreamTokenHandler | undefined {
  if (!onToken) {
    return undefined;
  }

  return (accumulatedContent) => streamToken(onToken, accumulatedContent);
}

/** Substitutes the search context when the model leaks raw tool-call syntax into its reply. */
function replaceLeakedToolCall(assistantMessageContent: string, searchContextFallback: string): string {
  return looksLikeTextToolCall(assistantMessageContent) ? searchContextFallback : assistantMessageContent;
}

/** Forwards sanitized accumulated content to the UI callback. */
function streamToken(onToken: StreamTokenHandler | undefined, accumulatedContent: string): void {
  if (!onToken || accumulatedContent.length === 0) {
    return;
  }

  const displayContent = stripToolCallTags(accumulatedContent);
  if (displayContent.length === 0) {
    return;
  }

  onToken(displayContent);
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
