import { buildCompletionResult } from "@tests/testUtils";
import {
  looksLikeTextToolCall,
  resolveChatToolCall,
  resolveWebSearchToolCall,
  stripToolCallTags,
} from "@/services/inference/toolCallParsing";

const USER_FALLBACK_QUERY = "What is the price of the Cursor Pro plan?";

function structuredToolCallResult(name: "web_search" | "search_local_history", argumentsJson: string) {
  return buildCompletionResult({
    tool_calls: [{ type: "function", function: { name, arguments: argumentsJson } }],
  });
}

describe("resolveChatToolCall", () => {
  describe("structured tool_calls (PARSE-01, PARSE-02)", () => {
    it("reads a web_search call from a JSON `query` argument", () => {
      const result = structuredToolCallResult("web_search", JSON.stringify({ query: "cursor pro pricing" }));

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)).toEqual({
        name: "web_search",
        query: "cursor pro pricing",
        source: "structured",
      });
    });

    it("reads a search_local_history call from a JSON `query` argument", () => {
      const result = structuredToolCallResult("search_local_history", JSON.stringify({ query: "favorite color" }));

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)).toEqual({
        name: "search_local_history",
        query: "favorite color",
        source: "structured",
      });
    });

    it("picks the first non-empty entry from a `queries` array argument", () => {
      const result = structuredToolCallResult("web_search", JSON.stringify({ queries: ["", "  ", "iphone 17 price"] }));

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)?.query).toBe("iphone 17 price");
    });

    it("normalizes Gemma quote tokens in the arguments payload", () => {
      const result = structuredToolCallResult("web_search", '{<|"|>query<|"|>: <|"|>weather in delhi<|"|>}');

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)?.query).toBe("weather in delhi");
    });

    it("ignores tool calls that are not known chat tools", () => {
      const result = buildCompletionResult({
        content: "plain answer",
        tool_calls: [{ type: "function", function: { name: "calculator", arguments: "{}" } }],
      });

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)).toBeNull();
    });

    it("falls back to the user prompt when structured arguments are not valid JSON", () => {
      const result = structuredToolCallResult("web_search", "<|tool_call|>call:web_search{}");

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)).toEqual({
        name: "web_search",
        query: USER_FALLBACK_QUERY,
        source: "structured",
      });
    });

    it("reads a query nested under stringified arguments", () => {
      const result = structuredToolCallResult(
        "search_local_history",
        JSON.stringify({ arguments: JSON.stringify({ query: "prior preference" }) }),
      );

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)?.query).toBe("prior preference");
    });
  });

  describe("plain JSON and Gemma-style text tool calls (PARSE-03, PARSE-04)", () => {
    it("resolves an inline web_search tool call as source 'text'", () => {
      const result = buildCompletionResult({
        content: '<|tool_call|>call:web_search{"query": "cursor pro price"}',
      });

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)).toEqual({
        name: "web_search",
        query: "cursor pro price",
        source: "text",
      });
    });

    it("resolves a plain JSON search_local_history object", () => {
      const result = buildCompletionResult({
        content: JSON.stringify({
          name: "search_local_history",
          arguments: { query: "favorite color" },
        }),
      });

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)).toEqual({
        name: "search_local_history",
        query: "favorite color",
        source: "text",
      });
    });

    it("falls back to the user prompt when the query cannot be extracted (PARSE-04)", () => {
      const result = buildCompletionResult({ content: "<|tool_call|>call:web_search{ malformed }" });

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)).toEqual({
        name: "web_search",
        query: USER_FALLBACK_QUERY,
        source: "text",
      });
    });

    it("combines `content` and `text` fields when detecting the tool call", () => {
      const result = buildCompletionResult({
        content: "",
        text: 'call:web_search{"query": "stock quote"}',
      });

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)?.query).toBe("stock quote");
    });
  });

  describe("non-tool output (PARSE-05)", () => {
    it("returns null for ordinary assistant prose", () => {
      const result = buildCompletionResult({ content: "Paris is the capital of France." });

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)).toBeNull();
    });

    it("does not treat a plain mention of web_search as a tool call", () => {
      const result = buildCompletionResult({ content: "You could use a web_search feature for that." });

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)).toBeNull();
    });
  });
});

describe("resolveWebSearchToolCall", () => {
  it("returns web_search calls and ignores local history calls", () => {
    expect(
      resolveWebSearchToolCall(
        structuredToolCallResult("web_search", JSON.stringify({ query: "news" })),
        USER_FALLBACK_QUERY,
      ),
    ).toEqual({
      name: "web_search",
      query: "news",
      source: "structured",
    });

    expect(
      resolveWebSearchToolCall(
        structuredToolCallResult("search_local_history", JSON.stringify({ query: "prefs" })),
        USER_FALLBACK_QUERY,
      ),
    ).toBeNull();
  });
});

describe("looksLikeTextToolCall (PARSE-08)", () => {
  it("requires both a known tool token and tool-call syntax", () => {
    expect(looksLikeTextToolCall('<|tool_call|>call:web_search{"query":"x"}')).toBe(true);
    expect(looksLikeTextToolCall("call:web_search{}")).toBe(true);
    expect(looksLikeTextToolCall('call:search_local_history{"query":"x"}')).toBe(true);
  });

  it("returns false when only one signal is present", () => {
    expect(looksLikeTextToolCall("I ran a web_search for you.")).toBe(false);
    expect(looksLikeTextToolCall("<|tool_call|> some other tool")).toBe(false);
    expect(looksLikeTextToolCall("just a normal sentence")).toBe(false);
  });
});

describe("stripToolCallTags (PARSE-09)", () => {
  it("removes Gemma-style inline tool call blocks", () => {
    expect(stripToolCallTags('Here you go.<|tool_call|>call:web_search{"query":"x"}')).toBe("Here you go.");
  });

  it("removes local history tool call blocks", () => {
    expect(stripToolCallTags('Found it.<|tool_call|>call:search_local_history{"query":"x"}')).toBe("Found it.");
  });

  it("removes XML-style tool call fragments during streaming", () => {
    expect(stripToolCallTags("Answer:<tool_call><function=web_search")).toBe("Answer:");
  });

  it("returns an empty string when the output is only tool-call syntax", () => {
    expect(stripToolCallTags('<|tool_call|>call:web_search{"query":"x"}')).toBe("");
  });
});
