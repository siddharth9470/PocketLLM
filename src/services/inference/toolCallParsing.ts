import type { NativeCompletionResult } from "llama.rn";

const WEB_SEARCH_TOOL_NAME = "web_search";

/** Gemma emits quotes as this token instead of a plain `"`; normalized before JSON parsing. */
const GEMMA_QUOTE_TOKEN = '<|"|>';

/** Parsed `web_search` request extracted from a llama.rn completion result. */
export interface WebSearchToolCall {
  query: string;
  source: "structured" | "text";
}

/** Shape of the `web_search` tool arguments object once parsed from JSON. */
interface WebSearchArguments {
  query?: string;
  queries?: string[];
}

/**
 * Determines whether a completion requested a web search.
 *
 * Structured `tool_calls` are the source of truth; when a model instead emits the
 * tool call as raw text, we detect it and fall back to `fallbackQuery` (the user's
 * prompt) rather than scraping the query with brittle patterns.
 */
export function resolveWebSearchToolCall(
  result: NativeCompletionResult,
  fallbackQuery: string,
): WebSearchToolCall | null {
  const structuredQuery = readStructuredWebSearchQuery(result);
  if (structuredQuery) {
    return { query: structuredQuery, source: "structured" };
  }

  const rawText = joinResultText(result);
  if (!looksLikeTextToolCall(rawText)) {
    return null;
  }

  const query = readInlineWebSearchQuery(rawText) ?? fallbackQuery.trim();
  return query.length > 0 ? { query, source: "text" } : null;
}

/** True when raw model output contains an inline `web_search` tool invocation. */
export function looksLikeTextToolCall(text: string): boolean {
  const lowerText = text.toLowerCase();
  return lowerText.includes(WEB_SEARCH_TOOL_NAME) && (lowerText.includes("tool_call") || lowerText.includes("call:"));
}

/**
 * Removes raw inline tool-call syntax from model output so it never reaches the chat UI.
 * Handles complete blocks and in-progress streaming fragments (e.g. `<tool_call><function=web`).
 */
export function stripToolCallTags(raw: string): string {
  if (!raw) {
    return "";
  }

  let result = raw;
  let removedToolSyntax = false;
  const markers = ["<|tool_call|>", "<tool_call>", "<function=web", "call:web_search"] as const;

  for (const marker of markers) {
    const index = result.toLowerCase().indexOf(marker);
    if (index !== -1) {
      result = result.slice(0, index);
      removedToolSyntax = true;
    }
  }

  return removedToolSyntax ? result.trimEnd() : result;
}

/** Combines the `content` and `text` channels of a completion result. */
function joinResultText(result: NativeCompletionResult): string {
  return `${result.content ?? ""}\n${result.text ?? ""}`.trim();
}

/** Reads the query from structured `tool_calls`, when a `web_search` call is present. */
function readStructuredWebSearchQuery(result: NativeCompletionResult): string | null {
  const webSearchCall = result.tool_calls?.find((call) => call.function.name === WEB_SEARCH_TOOL_NAME);
  return webSearchCall ? readQueryFromArgumentsJson(webSearchCall.function.arguments) : null;
}

/** Reads the query from an inline tool call by parsing its embedded JSON argument object. */
function readInlineWebSearchQuery(rawText: string): string | null {
  const argumentsJson = extractJsonObject(rawText);
  return argumentsJson ? readQueryFromArgumentsJson(argumentsJson) : null;
}

/**
 * Parses a `web_search` arguments JSON string and returns the first usable query.
 * Gemma quote tokens are normalized to standard quotes so the payload parses.
 */
function readQueryFromArgumentsJson(argumentsJson: string): string | null {
  const normalizedJson = argumentsJson.split(GEMMA_QUOTE_TOKEN).join('"');

  try {
    const parsedArguments = JSON.parse(normalizedJson) as WebSearchArguments;
    return firstUsableQuery(parsedArguments);
  } catch {
    return null;
  }
}

/** Returns the first non-empty `query`, or the first non-empty `queries[]` entry. */
function firstUsableQuery(args: WebSearchArguments): string | null {
  const singleQuery = args.query?.trim();
  if (singleQuery) {
    return singleQuery;
  }

  const listQuery = args.queries?.map((entry) => entry.trim()).find((entry) => entry.length > 0);
  return listQuery ?? null;
}

/** Extracts the outermost `{...}` JSON object substring from text, or null if absent. */
function extractJsonObject(text: string): string | null {
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  return objectStart !== -1 && objectEnd > objectStart ? text.slice(objectStart, objectEnd + 1) : null;
}
