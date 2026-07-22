import { buildCompletionResult } from "@tests/testUtils";
import {
  extractWebSearchQueryFromText,
  looksLikeTextToolCall,
  resolveWebSearchToolCall,
} from "@/services/inference/toolCallParsing";

const USER_FALLBACK_QUERY = "What is the price of the Cursor Pro plan?";

function structuredToolCallResult(argumentsJson: string, id?: string) {
  return buildCompletionResult({
    tool_calls: [
      { type: "function", function: { name: "web_search", arguments: argumentsJson }, ...(id ? { id } : {}) },
    ],
  });
}

describe("resolveWebSearchToolCall", () => {
  describe("structured tool_calls (PARSE-01, PARSE-02, PARSE-06)", () => {
    it("reads a web_search call from a JSON `query` argument", () => {
      const result = structuredToolCallResult(JSON.stringify({ query: "cursor pro pricing" }), "call_123");

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)).toEqual({
        query: "cursor pro pricing",
        mode: "structured",
        toolCallId: "call_123",
        assistantToolCalls: result.tool_calls,
        assistantContent: "",
      });
    });

    it("picks the first non-empty entry from a `queries` array argument", () => {
      const result = structuredToolCallResult(JSON.stringify({ queries: ["", "  ", "iphone 17 price"] }));

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)?.query).toBe("iphone 17 price");
    });

    it("defaults the tool call id when the native payload omits it", () => {
      const result = structuredToolCallResult(JSON.stringify({ query: "weather today" }));

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)?.toolCallId).toBe("web_search_0");
    });

    it("ignores tool calls that are not web_search", () => {
      const result = buildCompletionResult({
        content: "plain answer",
        tool_calls: [{ type: "function", function: { name: "calculator", arguments: "{}" } }],
      });

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)).toBeNull();
    });

    it("rejects a structured call whose query is itself tool-call syntax (PARSE-06)", () => {
      const result = structuredToolCallResult("<|tool_call|>call:web_search{}");

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)).toBeNull();
    });
  });

  describe("Gemma-style text tool calls (PARSE-03, PARSE-04)", () => {
    it("resolves an inline text tool call as mode 'text'", () => {
      const result = buildCompletionResult({
        content: '<|tool_call|>call:web_search{"query": "cursor pro price"}',
      });

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)).toMatchObject({
        query: "cursor pro price",
        mode: "text",
        toolCallId: "web_search_0",
      });
    });

    it("falls back to the user prompt when the query cannot be extracted (PARSE-04)", () => {
      const result = buildCompletionResult({ content: "<|tool_call|>call:web_search{ malformed }" });

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)).toMatchObject({
        query: USER_FALLBACK_QUERY,
        mode: "text",
      });
    });

    it("combines `content` and `text` fields when detecting the tool call", () => {
      const result = buildCompletionResult({
        content: "",
        text: 'call:web_search{"query": "stock quote"}',
      });

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)?.query).toBe("stock quote");
    });
  });

  describe("non-tool output (PARSE-05)", () => {
    it("returns null for ordinary assistant prose", () => {
      const result = buildCompletionResult({ content: "Paris is the capital of France." });

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)).toBeNull();
    });

    it("does not treat a plain mention of web_search as a tool call", () => {
      const result = buildCompletionResult({ content: "You could use a web_search feature for that." });

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)).toBeNull();
    });
  });
});

describe("looksLikeTextToolCall (PARSE-08)", () => {
  it("requires both the web_search token and tool-call syntax", () => {
    expect(looksLikeTextToolCall('<|tool_call|>call:web_search{"query":"x"}')).toBe(true);
    expect(looksLikeTextToolCall("call:web_search{}")).toBe(true);
  });

  it("returns false when only one signal is present", () => {
    expect(looksLikeTextToolCall("I ran a web_search for you.")).toBe(false);
    expect(looksLikeTextToolCall("<|tool_call|> some other tool")).toBe(false);
    expect(looksLikeTextToolCall("just a normal sentence")).toBe(false);
  });
});

describe("extractWebSearchQueryFromText (PARSE-07)", () => {
  it("extracts a Gemma quoted query token", () => {
    expect(extractWebSearchQueryFromText('queries:[<|"|>iphone 17 price<|"|>]')).toBe("iphone 17 price");
  });

  it("extracts a bracketed array query", () => {
    expect(extractWebSearchQueryFromText('queries:["cursor pro price"]')).toBe("cursor pro price");
  });

  it("extracts a single quoted `query` field", () => {
    expect(extractWebSearchQueryFromText('{"query": "weather in delhi"}')).toBe("weather in delhi");
  });

  it("extracts the query from a call body payload", () => {
    expect(extractWebSearchQueryFromText('call:web_search{"query": "latest ai news"}')).toBe("latest ai news");
  });

  it("returns null when no recognizable query format is present", () => {
    expect(extractWebSearchQueryFromText("no query here")).toBeNull();
  });
});
