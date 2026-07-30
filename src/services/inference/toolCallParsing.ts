import type { NativeCompletionResult } from "llama.rn";

const WEB_SEARCH_TOOL_NAME = "web_search";
const LOCAL_SEARCH_TOOL_NAME = "search_local_history";

/** Gemma emits quotes as this token instead of a plain `"`; normalized before JSON parsing. */
const GEMMA_QUOTE_TOKEN = '<|"|>';

/** Tool names PocketLLM exposes to the on-device model during Pass 1. */
export type ChatToolName = typeof WEB_SEARCH_TOOL_NAME | typeof LOCAL_SEARCH_TOOL_NAME;

/** Parsed tool request extracted from a llama.rn completion result. */
export interface ChatToolCall {
  name: ChatToolName;
  query: string;
  source: "structured" | "text";
}

/** @deprecated Prefer `ChatToolCall`. */
export type WebSearchToolCall = ChatToolCall;

const KNOWN_TOOL_NAMES = new Set<string>([WEB_SEARCH_TOOL_NAME, LOCAL_SEARCH_TOOL_NAME]);

/**
 * Cheap gate for the streaming hot path. Avoids allocating / scanning for tool
 * syntax on ordinary prose tokens. Must stay O(1) string includes only — never
 * regex and never toLowerCase over the full accumulated buffer.
 */
export function mayContainToolSyntax(text: string): boolean {
  return (
    text.includes("<|") ||
    text.includes("<tool") ||
    text.includes("<function") ||
    text.includes("call:web") ||
    text.includes("call:search") ||
    text.includes('"web_search"') ||
    text.includes('"search_local_history"')
  );
}

/**
 * Determines whether a completion requested a known tool (`web_search` or
 * `search_local_history`).
 *
 * Resolution order (LLM structured output only — never user-prompt heuristics):
 * 1. Native `tool_calls[]` from llama.rn
 * 2. Plain JSON objects (`{ name, arguments }` / `{ name, query }` / `{ tool, query }`)
 * 3. Inline text tool-call markup (`call:search_local_history{...}`, `<|tool_call|>`, etc.)
 *
 * When a tool name is found but the query cannot be parsed, falls back to
 * `fallbackQuery` (the original user prompt).
 */
export function resolveChatToolCall(result: NativeCompletionResult, fallbackQuery: string): ChatToolCall | null {
  const fallback = fallbackQuery.trim();

  const structuredCall = readStructuredToolCall(result, fallback);
  if (structuredCall) {
    return structuredCall;
  }

  const rawText = joinResultText(result);
  if (!rawText) {
    return null;
  }

  const plainJsonCall = readPlainJsonToolCall(rawText, fallback);
  if (plainJsonCall) {
    return plainJsonCall;
  }

  const textToolName = detectInlineToolName(rawText);
  if (!textToolName) {
    return null;
  }

  const query = readInlineToolQuery(rawText) ?? fallback;
  return query.length > 0 ? { name: textToolName, query, source: "text" } : null;
}

/**
 * Web-search-only resolver used by older call sites and tests.
 * Returns null when the model called a different tool (e.g. local history).
 */
export function resolveWebSearchToolCall(result: NativeCompletionResult, fallbackQuery: string): ChatToolCall | null {
  const resolved = resolveChatToolCall(result, fallbackQuery);
  return resolved?.name === WEB_SEARCH_TOOL_NAME ? resolved : null;
}

/** True when raw model output contains an inline invocation of a known chat tool. */
export function looksLikeTextToolCall(text: string): boolean {
  if (!text) {
    return false;
  }

  if (detectInlineToolName(text)) {
    return true;
  }

  return readPlainJsonToolCall(text, "") !== null;
}

/**
 * Removes raw inline tool-call syntax from model output so it never reaches the chat UI.
 * Intended for finalization and Pass-1 guarded streaming — not Pass-2 hot path.
 */
export function stripToolCallTags(raw: string): string {
  if (!raw) {
    return "";
  }

  if (!mayContainToolSyntax(raw)) {
    return raw;
  }

  let result = raw;
  let removedToolSyntax = false;
  const markers = [
    "<|tool_call|>",
    "<tool_call>",
    "<function=web",
    "<function=search_local",
    "call:web_search",
    "call:search_local_history",
  ] as const;

  for (const marker of markers) {
    const index = result.indexOf(marker);
    const indexInsensitive = index === -1 ? result.toLowerCase().indexOf(marker) : index;
    if (indexInsensitive !== -1) {
      result = result.slice(0, indexInsensitive);
      removedToolSyntax = true;
    }
  }

  return removedToolSyntax ? result.trimEnd() : result;
}

/** Combines the `content` and `text` channels of a completion result. */
function joinResultText(result: NativeCompletionResult): string {
  return `${result.content ?? ""}\n${result.text ?? ""}`.trim();
}

/**
 * Reads the first structured `tool_calls` entry whose function name is a known
 * chat tool. Uses `fallbackQuery` when arguments JSON has no usable query.
 */
function readStructuredToolCall(result: NativeCompletionResult, fallbackQuery: string): ChatToolCall | null {
  const knownCall = result.tool_calls?.find((call) => KNOWN_TOOL_NAMES.has(call.function.name));
  if (!knownCall || !isChatToolName(knownCall.function.name)) {
    return null;
  }

  const query = readQueryFromArgumentsJson(knownCall.function.arguments) ?? fallbackQuery;
  return query.length > 0 ? { name: knownCall.function.name, query, source: "structured" } : null;
}

/**
 * Parses a plain JSON tool-call object emitted as model content, e.g.:
 * `{ "name": "search_local_history", "arguments": { "query": "..." } }`
 * `{ "name": "search_local_history", "query": "..." }`
 * `{ "tool": "web_search", "query": "..." }`
 */
function readPlainJsonToolCall(rawText: string, fallbackQuery: string): ChatToolCall | null {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith("{") || !mayContainToolSyntax(trimmed)) {
    return null;
  }

  const argumentsJson = extractJsonObject(trimmed);
  if (!argumentsJson) {
    return null;
  }

  const parsed = parseJsonObject(argumentsJson);
  if (!parsed) {
    return null;
  }

  const name = readToolNameFromObject(parsed);
  if (!name) {
    return null;
  }

  const query = extractQueryFromObject(parsed) ?? fallbackQuery;
  return query.length > 0 ? { name, query, source: "text" } : null;
}

/**
 * Detects a known tool name next to inline tool-call markup
 * (`tool_call`, `call:`, `<function=`). Prefers `search_local_history` when both
 * names appear because it is the longer, more specific token.
 */
function detectInlineToolName(text: string): ChatToolName | null {
  const lowerText = text.toLowerCase();
  const hasToolSyntax =
    lowerText.includes("tool_call") || lowerText.includes("call:") || lowerText.includes("<function=");
  if (!hasToolSyntax) {
    return null;
  }

  if (lowerText.includes(LOCAL_SEARCH_TOOL_NAME)) {
    return LOCAL_SEARCH_TOOL_NAME;
  }

  if (lowerText.includes(WEB_SEARCH_TOOL_NAME)) {
    return WEB_SEARCH_TOOL_NAME;
  }

  return null;
}

/** Reads the query from an inline tool call by parsing its embedded JSON argument object. */
function readInlineToolQuery(rawText: string): string | null {
  const argumentsJson = extractJsonObject(rawText);
  return argumentsJson ? readQueryFromArgumentsJson(argumentsJson) : null;
}

/**
 * Parses tool arguments JSON and returns the first usable query.
 * Supports top-level `query` / `queries`, nested `arguments` objects, and
 * stringified `arguments` payloads. Gemma quote tokens are normalized first.
 */
function readQueryFromArgumentsJson(argumentsJson: string): string | null {
  const parsed = parseJsonObject(argumentsJson);
  return parsed ? extractQueryFromObject(parsed) : null;
}

function parseJsonObject(rawJson: string): Record<string, unknown> | null {
  const normalizedJson = rawJson.split(GEMMA_QUOTE_TOKEN).join('"');

  try {
    const parsed: unknown = JSON.parse(normalizedJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Walks a parsed tool-call / arguments object for a usable query string.
 * Handles nested `{ arguments: { query } }` and stringified `arguments` JSON.
 */
function extractQueryFromObject(value: Record<string, unknown>): string | null {
  const singleQuery = readStringField(value, "query");
  if (singleQuery) {
    return singleQuery;
  }

  const queries = value.queries;
  if (Array.isArray(queries)) {
    const listQuery = queries
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .find((entry) => entry.length > 0);
    if (listQuery) {
      return listQuery;
    }
  }

  const nestedArguments = value.arguments;
  if (typeof nestedArguments === "string" && nestedArguments.trim().length > 0) {
    return readQueryFromArgumentsJson(nestedArguments);
  }

  if (nestedArguments && typeof nestedArguments === "object" && !Array.isArray(nestedArguments)) {
    return extractQueryFromObject(nestedArguments as Record<string, unknown>);
  }

  return null;
}

function readToolNameFromObject(value: Record<string, unknown>): ChatToolName | null {
  const candidates = [value.name, value.tool, value.function];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && isChatToolName(candidate)) {
      return candidate;
    }

    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const nestedName = (candidate as Record<string, unknown>).name;
      if (typeof nestedName === "string" && isChatToolName(nestedName)) {
        return nestedName;
      }
    }
  }

  return null;
}

function readStringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  if (typeof field !== "string") {
    return null;
  }

  const trimmed = field.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Extracts the outermost `{...}` JSON object substring from text, or null if absent. */
function extractJsonObject(text: string): string | null {
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  return objectStart !== -1 && objectEnd > objectStart ? text.slice(objectStart, objectEnd + 1) : null;
}

function isChatToolName(name: string): name is ChatToolName {
  return name === WEB_SEARCH_TOOL_NAME || name === LOCAL_SEARCH_TOOL_NAME;
}
