import type { NativeCompletionResult } from "llama.rn";

export interface WebSearchToolCall {
  query: string;
  mode: "structured" | "text";
  toolCallId: string;
  assistantToolCalls?: NativeCompletionResult["tool_calls"];
  assistantContent?: string;
}

function getRawResultText(result: NativeCompletionResult): string {
  return `${result.content ?? ""}\n${result.text ?? ""}`.trim();
}

export function looksLikeTextToolCall(text: string): boolean {
  return /web_search/i.test(text) && /(?:<\|tool_call\|>|<tool_call\|>|call:web_search)/i.test(text);
}

export function extractWebSearchQueryFromText(text: string): string | null {
  const gemmaQuotedQuery = text.match(/queries:\s*\[[^\]]*<\|"\|>([^<]+)<\|"\|>/i);
  if (gemmaQuotedQuery?.[1]?.trim()) {
    return gemmaQuotedQuery[1].trim();
  }

  const queriesArray = text.match(/queries:\s*\[\s*["']?([^"'[\]]+)["']?\s*\]/i);
  if (queriesArray?.[1]?.trim()) {
    return queriesArray[1].trim();
  }

  const queryField = text.match(/["']?query["']?\s*:\s*["']([^"']+)["']/i);
  if (queryField?.[1]?.trim()) {
    return queryField[1].trim();
  }

  const callBody = text.match(/call:web_search\s*(\{[\s\S]*?\})/i);
  if (callBody?.[1]) {
    const normalizedJson = callBody[1].replace(/<\|"\|>/g, '"');
    try {
      const parsed = JSON.parse(normalizedJson) as { query?: string; queries?: string[] };
      return parsed.query?.trim() || parsed.queries?.[0]?.trim() || null;
    } catch {
      const unquoted = callBody[1].match(/queries:\s*\[\s*([^[\]{}]+?)\s*\]/i);
      if (unquoted?.[1]?.trim()) {
        return unquoted[1].trim();
      }
    }
  }

  return null;
}

function parseStructuredSearchQuery(argumentsJson: string): string {
  try {
    const parsed = JSON.parse(argumentsJson) as { query?: string; queries?: string[] };
    const directQuery = parsed.query?.trim();
    if (directQuery) {
      return directQuery;
    }

    const firstQuery = parsed.queries?.[0]?.trim();
    if (firstQuery) {
      return firstQuery;
    }
  } catch {
    // Fall through to text parsing.
  }

  return extractWebSearchQueryFromText(argumentsJson) ?? argumentsJson.trim();
}

export function resolveWebSearchToolCall(
  result: NativeCompletionResult,
  fallbackQuery: string,
): WebSearchToolCall | null {
  const structuredCall = result.tool_calls?.find((call) => call.function.name === "web_search");
  if (structuredCall) {
    const query = parseStructuredSearchQuery(structuredCall.function.arguments);
    if (query.length > 0 && !looksLikeTextToolCall(query)) {
      return {
        query,
        mode: "structured",
        toolCallId: structuredCall.id ?? "web_search_0",
        assistantToolCalls: result.tool_calls,
        assistantContent: result.content || "",
      };
    }
  }

  const rawText = getRawResultText(result);
  if (!looksLikeTextToolCall(rawText)) {
    return null;
  }

  const query = extractWebSearchQueryFromText(rawText) || fallbackQuery.trim();
  if (query.length === 0) {
    return null;
  }

  return {
    query,
    mode: "text",
    toolCallId: "web_search_0",
    assistantContent: result.content || "",
  };
}
