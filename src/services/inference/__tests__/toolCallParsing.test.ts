import { buildCompletionResult } from "@tests/testUtils";
import { looksLikeTextToolCall, resolveWebSearchToolCall } from "@/services/inference/toolCallParsing";

const USER_FALLBACK_QUERY = "What is the price of the Cursor Pro plan?";

function structuredToolCallResult(argumentsJson: string) {
  return buildCompletionResult({
    tool_calls: [{ type: "function", function: { name: "web_search", arguments: argumentsJson } }],
  });
}

describe("resolveWebSearchToolCall", () => {
  describe("structured tool_calls (PARSE-01, PARSE-02)", () => {
    it("reads a web_search call from a JSON `query` argument", () => {
      const result = structuredToolCallResult(JSON.stringify({ query: "cursor pro pricing" }));

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)).toEqual({
        query: "cursor pro pricing",
        source: "structured",
      });
    });

    it("picks the first non-empty entry from a `queries` array argument", () => {
      const result = structuredToolCallResult(JSON.stringify({ queries: ["", "  ", "iphone 17 price"] }));

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)?.query).toBe("iphone 17 price");
    });

    it("normalizes Gemma quote tokens in the arguments payload", () => {
      const result = structuredToolCallResult('{<|"|>query<|"|>: <|"|>weather in delhi<|"|>}');

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)?.query).toBe("weather in delhi");
    });

    it("ignores tool calls that are not web_search", () => {
      const result = buildCompletionResult({
        content: "plain answer",
        tool_calls: [{ type: "function", function: { name: "calculator", arguments: "{}" } }],
      });

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)).toBeNull();
    });

    it("returns null when the structured arguments are not valid JSON", () => {
      const result = structuredToolCallResult("<|tool_call|>call:web_search{}");

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)).toBeNull();
    });
  });

  describe("Gemma-style text tool calls (PARSE-03, PARSE-04)", () => {
    it("resolves an inline text tool call as source 'text'", () => {
      const result = buildCompletionResult({
        content: '<|tool_call|>call:web_search{"query": "cursor pro price"}',
      });

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)).toEqual({
        query: "cursor pro price",
        source: "text",
      });
    });

    it("falls back to the user prompt when the query cannot be extracted (PARSE-04)", () => {
      const result = buildCompletionResult({ content: "<|tool_call|>call:web_search{ malformed }" });

      expect(resolveWebSearchToolCall(result, USER_FALLBACK_QUERY)).toEqual({
        query: USER_FALLBACK_QUERY,
        source: "text",
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
