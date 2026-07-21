import type { NativeCompletionResult } from "llama.rn";

const WEB_SEARCH_TOOL_NAME = "web_search";
const DEFAULT_TOOL_CALL_ID = "web_search_0";

/** Detects Gemma-style inline tool syntax in model output. */
const TEXT_TOOL_CALL_PATTERN =
  /(?:<\|tool_call\|>|<tool_call\|>|call:web_search)/i;

type ToolArguments = {
  query?: string;
  queries?: string[];
};

/** Parsed `web_search` request extracted from a llama.rn completion result. */
export interface WebSearchToolCall {
  query: string;
  mode: "structured" | "text";
  toolCallId: string;
  assistantToolCalls?: NativeCompletionResult["tool_calls"];
  assistantContent?: string;
}

/**
 * Determines whether a llama.rn pass 1 result requested a web search.
 * Checks structured `tool_calls` first, then Gemma-style text tool syntax.
 */
export function resolveWebSearchToolCall(
  result: NativeCompletionResult,
  fallbackQuery: string,
): WebSearchToolCall | null {
  const fromStructured = parseStructuredToolCall(result);
  if (fromStructured) {
    return fromStructured;
  }

  return parseTextToolCall(result, fallbackQuery);
}

/**
 * Returns true when the text looks like an inline `web_search` tool invocation
 * (common with models that emit tool syntax as plain text).
 */
export function looksLikeTextToolCall(text: string): boolean {
  return /web_search/i.test(text) && TEXT_TOOL_CALL_PATTERN.test(text);
}

/**
 * Extracts a search query string from raw tool-call text.
 * Supports Gemma token formats, JSON arguments, and simple `query` fields.
 */
export function extractWebSearchQueryFromText(text: string): string | null {
  for (const extract of QUERY_TEXT_EXTRACTORS) {
    const query = extract(text);
    if (query) {
      return query;
    }
  }

  return null;
}

/**
 * Combines `content` and `text` from a llama.rn result for tool-call detection.
 */
function combineResultText(result: NativeCompletionResult): string {
  return `${result.content ?? ""}\n${result.text ?? ""}`.trim();
}

/**
 * Reads a structured `web_search` entry from llama.rn `tool_calls`.
 */
function parseStructuredToolCall(result: NativeCompletionResult): WebSearchToolCall | null {
  const call = result.tool_calls?.find((entry) => entry.function.name === WEB_SEARCH_TOOL_NAME);
  if (!call) {
    return null;
  }

  const query = parseToolArguments(call.function.arguments);
  if (!isUsableQuery(query)) {
    return null;
  }

  return {
    query,
    mode: "structured",
    toolCallId: call.id ?? DEFAULT_TOOL_CALL_ID,
    assistantToolCalls: result.tool_calls,
    assistantContent: result.content ?? "",
  };
}

/**
 * Reads a text-embedded `web_search` call when structured `tool_calls` are absent.
 */
function parseTextToolCall(
  result: NativeCompletionResult,
  fallbackQuery: string,
): WebSearchToolCall | null {
  const rawText = combineResultText(result);
  if (!looksLikeTextToolCall(rawText)) {
    return null;
  }

  const query = extractWebSearchQueryFromText(rawText) || fallbackQuery.trim();
  if (!isUsableQuery(query)) {
    return null;
  }

  return {
    query,
    mode: "text",
    toolCallId: DEFAULT_TOOL_CALL_ID,
    assistantContent: result.content ?? "",
  };
}

/**
 * Parses tool `arguments` JSON, falling back to text extraction for malformed payloads.
 */
function parseToolArguments(argumentsJson: string): string {
  const fromJson = readQueryFromJson(argumentsJson);
  if (fromJson) {
    return fromJson;
  }

  return extractWebSearchQueryFromText(argumentsJson) ?? argumentsJson.trim();
}

/** Parses `{ query }` or `{ queries: [...] }` from a JSON string. */
function readQueryFromJson(json: string): string | null {
  try {
    const parsed = JSON.parse(json) as ToolArguments;
    return firstQueryFromArgs(parsed);
  } catch {
    return null;
  }
}

/** Returns the first non-empty query from parsed tool arguments. */
function firstQueryFromArgs(args: ToolArguments): string | null {
  const direct = trimOrNull(args.query);
  if (direct) {
    return direct;
  }

  const fromList = args.queries?.map((entry) => trimOrNull(entry)).find(Boolean);
  return fromList ?? null;
}

/** Query is usable when non-empty and not itself a nested tool-call string. */
function isUsableQuery(query: string): boolean {
  return query.length > 0 && !looksLikeTextToolCall(query);
}

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/** Ordered text extractors — first match wins. */
const QUERY_TEXT_EXTRACTORS: Array<(text: string) => string | null> = [
  extractGemmaQuotedQuery,
  extractQueriesArrayQuery,
  extractQueryField,
  extractCallBodyQuery,
];

/** Gemma: `queries:[<|"|>search terms<|"|>]` */
function extractGemmaQuotedQuery(text: string): string | null {
  return trimOrNull(text.match(/queries:\s*\[[^\]]*<\|"\|>([^<]+)<\|"\|>/i)?.[1]);
}

/** Bracket list: `queries:["search terms"]` or unquoted variant. */
function extractQueriesArrayQuery(text: string): string | null {
  return trimOrNull(text.match(/queries:\s*\[\s*["']?([^"'[\]]+)["']?\s*\]/i)?.[1]);
}

/** Single field: `"query": "search terms"` */
function extractQueryField(text: string): string | null {
  return trimOrNull(text.match(/["']?query["']?\s*:\s*["']([^"']+)["']/i)?.[1]);
}

/** Body after `call:web_search{...}` — tries JSON, then unquoted array fallback. */
function extractCallBodyQuery(text: string): string | null {
  const body = text.match(/call:web_search\s*(\{[\s\S]*?\})/i)?.[1];
  if (!body) {
    return null;
  }

  const fromJson = readQueryFromJson(body.replace(/<\|"\|>/g, '"'));
  if (fromJson) {
    return fromJson;
  }

  return trimOrNull(body.match(/queries:\s*\[\s*([^[\]{}]+?)\s*\]/i)?.[1]);
}
