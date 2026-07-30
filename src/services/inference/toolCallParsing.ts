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
    text.includes("```") ||
    text.includes('"web_search"') ||
    text.includes('"search_local_history"') ||
    text.includes("web_search") ||
    text.includes("search_local_history")
  );
}

/**
 * Returns the raw Pass 1 model text (`content` + `text`) for debug logging
 * before any tool-call parsing runs.
 */
export function readCompletionRawText(result: NativeCompletionResult): string {
  return joinResultText(result);
}

/**
 * Determines whether a completion requested a known tool (`web_search` or
 * `search_local_history`).
 *
 * Resolution order (LLM structured output only — never user-prompt heuristics):
 * 1. Native `tool_calls[]` from llama.rn
 * 2. JSON objects (optionally wrapped in markdown fences / prose)
 * 3. XML-style `<tool_call>` / `<parameter name="query">` blocks
 * 4. Inline text tool-call markup (`call:search_local_history{...}`, etc.)
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

  const normalizedText = normalizeToolCallText(rawText);

  const jsonCall = readJsonToolCallFromText(normalizedText, fallback);
  if (jsonCall) {
    return jsonCall;
  }

  const xmlCall = readXmlStyleToolCall(normalizedText, fallback);
  if (xmlCall) {
    return xmlCall;
  }

  const textToolName = detectInlineToolName(normalizedText);
  if (!textToolName) {
    return null;
  }

  const query = readInlineToolQuery(normalizedText) ?? extractQueryByScan(normalizedText) ?? fallback;
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

  const normalized = normalizeToolCallText(text);
  if (detectInlineToolName(normalized)) {
    return true;
  }

  return readJsonToolCallFromText(normalized, "") !== null || readXmlStyleToolCall(normalized, "") !== null;
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
    "```",
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
 * Normalizes Gemma quote tokens and unwraps markdown ``` / ```json fences so
 * downstream JSON/XML parsers see a flat tool-call payload.
 */
function normalizeToolCallText(rawText: string): string {
  const withQuotes = rawText.split(GEMMA_QUOTE_TOKEN).join('"');
  return stripMarkdownFences(withQuotes).trim();
}

/**
 * Unwraps a fenced code block (```json ... ``` or ``` ... ```) when present.
 * Uses index scanning only — no regex. Returns the original text when no fence exists.
 */
function stripMarkdownFences(text: string): string {
  const fenceOpen = text.indexOf("```");
  if (fenceOpen === -1) {
    return text;
  }

  const afterTicks = text.slice(fenceOpen + 3);
  const newlineIndex = afterTicks.indexOf("\n");
  const body = newlineIndex === -1 ? afterTicks : afterTicks.slice(newlineIndex + 1);
  const fenceClose = body.lastIndexOf("```");
  return (fenceClose === -1 ? body : body.slice(0, fenceClose)).trim();
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

  const query =
    readQueryFromArgumentsJson(knownCall.function.arguments) ??
    extractQueryByScan(knownCall.function.arguments) ??
    fallbackQuery;
  return query.length > 0 ? { name: knownCall.function.name, query, source: "structured" } : null;
}

/**
 * Parses a JSON tool-call object from model text, including payloads that sit
 * inside prose or markdown fences (fence already stripped by normalize).
 * Accepts `{ name, arguments }`, `{ name, query }`, and `{ tool, query }`.
 */
function readJsonToolCallFromText(rawText: string, fallbackQuery: string): ChatToolCall | null {
  if (!containsKnownToolName(rawText)) {
    return null;
  }

  const argumentsJson = extractJsonObject(rawText);
  if (!argumentsJson) {
    return null;
  }

  const parsed = parseJsonObject(argumentsJson) ?? parseLooseObjectLiteral(argumentsJson);
  if (!parsed) {
    return null;
  }

  const name = readToolNameFromObject(parsed);
  if (!name) {
    return null;
  }

  const query = extractQueryFromObject(parsed) ?? extractQueryByScan(argumentsJson) ?? fallbackQuery;
  return query.length > 0 ? { name, query, source: "text" } : null;
}

/**
 * Parses XML-ish Gemma/Hermes tool calls, e.g.:
 * `<tool_call>search_local_history<parameter name="query">color</parameter></tool_call>`
 * or `<function=search_local_history>{"query":"..."}`.
 */
function readXmlStyleToolCall(rawText: string, fallbackQuery: string): ChatToolCall | null {
  const lowerText = rawText.toLowerCase();
  const hasXmlSyntax =
    lowerText.includes("<tool_call") || lowerText.includes("<function") || lowerText.includes("<parameter");
  if (!hasXmlSyntax) {
    return null;
  }

  const name = detectToolNameToken(rawText);
  if (!name) {
    return null;
  }

  const parameterQuery = readXmlParameterQuery(rawText);
  if (parameterQuery) {
    return { name, query: parameterQuery, source: "text" };
  }

  const jsonQuery = readInlineToolQuery(rawText) ?? extractQueryByScan(rawText);
  const query = jsonQuery ?? fallbackQuery;
  return query.length > 0 ? { name, query, source: "text" } : null;
}

/** Reads `<parameter name="query">...</parameter>` without regex. */
function readXmlParameterQuery(rawText: string): string | null {
  const lowerText = rawText.toLowerCase();
  const markers = ['name="query"', "name='query'", "name=query"] as const;

  for (const marker of markers) {
    const markerIndex = lowerText.indexOf(marker);
    if (markerIndex === -1) {
      continue;
    }

    const afterMarker = rawText.slice(markerIndex + marker.length);
    const openTagEnd = afterMarker.indexOf(">");
    if (openTagEnd === -1) {
      continue;
    }

    const valueStart = openTagEnd + 1;
    const closeIndex = afterMarker.toLowerCase().indexOf("</parameter>");
    if (closeIndex > valueStart) {
      const value = afterMarker.slice(valueStart, closeIndex).trim();
      if (value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

/**
 * Detects a known tool name next to inline tool-call markup
 * (`tool_call`, `call:`, `<function=`, `tool(`). Prefers `search_local_history`
 * when both names appear because it is the longer, more specific token.
 */
function detectInlineToolName(text: string): ChatToolName | null {
  const lowerText = text.toLowerCase();
  if (!hasToolInvocationSyntax(lowerText)) {
    return null;
  }

  return detectToolNameToken(text);
}

function hasToolInvocationSyntax(lowerText: string): boolean {
  return (
    lowerText.includes("tool_call") ||
    lowerText.includes("call:") ||
    lowerText.includes("call ") ||
    lowerText.includes("<function") ||
    lowerText.includes("<parameter") ||
    lowerText.includes("search_local_history(") ||
    lowerText.includes("web_search(") ||
    lowerText.includes('"name"') ||
    lowerText.includes("'name'")
  );
}

function detectToolNameToken(text: string): ChatToolName | null {
  const lowerText = text.toLowerCase();
  if (lowerText.includes(LOCAL_SEARCH_TOOL_NAME)) {
    return LOCAL_SEARCH_TOOL_NAME;
  }

  if (lowerText.includes(WEB_SEARCH_TOOL_NAME)) {
    return WEB_SEARCH_TOOL_NAME;
  }

  return null;
}

function containsKnownToolName(text: string): boolean {
  return detectToolNameToken(text) !== null;
}

/** Reads the query from an inline tool call by parsing its embedded JSON argument object. */
function readInlineToolQuery(rawText: string): string | null {
  const argumentsJson = extractJsonObject(rawText);
  if (!argumentsJson) {
    return null;
  }

  return readQueryFromArgumentsJson(argumentsJson) ?? extractQueryByScan(argumentsJson);
}

/**
 * Parses tool arguments JSON and returns the first usable query.
 * Supports top-level `query` / `queries`, nested `arguments` objects, and
 * stringified `arguments` payloads. Gemma quote tokens are normalized first.
 */
function readQueryFromArgumentsJson(argumentsJson: string): string | null {
  const parsed = parseJsonObject(argumentsJson) ?? parseLooseObjectLiteral(argumentsJson);
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
 * Best-effort parse for lightly malformed object literals Gemma sometimes emits
 * (unquoted keys / single quotes). Uses string rewriting, not regex.
 */
function parseLooseObjectLiteral(rawJson: string): Record<string, unknown> | null {
  let candidate = rawJson.split(GEMMA_QUOTE_TOKEN).join('"').trim();
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
    return null;
  }

  candidate = candidate.split("'").join('"');

  // Quote bare keys: {name: "x"} → {"name": "x"}
  let repaired = "";
  let index = 0;
  while (index < candidate.length) {
    const char = candidate[index];
    if (char === "{" || char === ",") {
      repaired += char;
      index += 1;
      while (index < candidate.length && candidate[index] === " ") {
        repaired += " ";
        index += 1;
      }

      if (index < candidate.length && isUnquotedKeyStart(candidate[index])) {
        const keyStart = index;
        while (index < candidate.length && isUnquotedKeyChar(candidate[index])) {
          index += 1;
        }
        const key = candidate.slice(keyStart, index);
        while (index < candidate.length && candidate[index] === " ") {
          index += 1;
        }
        if (candidate[index] === ":") {
          repaired += `"${key}"`;
          continue;
        }

        repaired += key;
        continue;
      }

      continue;
    }

    repaired += char;
    index += 1;
  }

  try {
    const parsed: unknown = JSON.parse(repaired);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function isUnquotedKeyStart(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || char === "_";
}

function isUnquotedKeyChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || char === "_";
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
    return readQueryFromArgumentsJson(nestedArguments) ?? extractQueryByScan(nestedArguments);
  }

  if (nestedArguments && typeof nestedArguments === "object" && !Array.isArray(nestedArguments)) {
    return extractQueryFromObject(nestedArguments as Record<string, unknown>);
  }

  return null;
}

/**
 * Last-resort query extraction by scanning for a `query` key and its string value.
 * Handles `"query":"..."`, `'query':'...'`, and bare `query: value` forms.
 */
function extractQueryByScan(text: string): string | null {
  const lowerText = text.toLowerCase();
  const keyMarkers = ['"query"', "'query'", "query"] as const;

  for (const marker of keyMarkers) {
    const keyIndex = lowerText.indexOf(marker);
    if (keyIndex === -1) {
      continue;
    }

    let cursor = keyIndex + marker.length;
    while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t")) {
      cursor += 1;
    }
    if (text[cursor] !== ":") {
      continue;
    }
    cursor += 1;
    while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t" || text[cursor] === "\n")) {
      cursor += 1;
    }

    const quote = text[cursor];
    if (quote === '"' || quote === "'") {
      cursor += 1;
      const end = text.indexOf(quote, cursor);
      if (end === -1) {
        continue;
      }
      const value = text.slice(cursor, end).trim();
      if (value.length > 0) {
        return value;
      }
      continue;
    }

    const endCandidates = [text.indexOf(",", cursor), text.indexOf("}", cursor), text.indexOf("\n", cursor)].filter(
      (value) => value !== -1,
    );
    const end = endCandidates.length > 0 ? Math.min(...endCandidates) : text.length;
    const value = text.slice(cursor, end).trim();
    if (value.length > 0) {
      return value;
    }
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
