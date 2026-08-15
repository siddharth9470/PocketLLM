import { buildCompletionResult } from "@tests/testUtils";
import {
  type ChatToolCall,
  type ChatToolName,
  looksLikeTextToolCall,
  resolveChatToolCall,
  resolveWebSearchToolCall,
  stripToolCallTags,
} from "@/services/inference/toolCallParsing";

const USER_FALLBACK_QUERY = "What is the price of the Cursor Pro plan?";

function structuredToolCallResult(name: ChatToolName, argumentsJson: string) {
  return buildCompletionResult({
    tool_calls: [{ type: "function", function: { name, arguments: argumentsJson } }],
  });
}

/** Resolves a structured `tool_calls[]` entry against the shared user fallback query. */
function resolveStructured(name: ChatToolName, argumentsJson: string): ChatToolCall | null {
  return resolveChatToolCall(structuredToolCallResult(name, argumentsJson), USER_FALLBACK_QUERY);
}

/** Resolves a tool call embedded in free-form model output (`content` plus optional `text`). */
function resolveFromOutput(content: string, text?: string): ChatToolCall | null {
  return resolveChatToolCall(buildCompletionResult({ content, text }), USER_FALLBACK_QUERY);
}

describe("resolveChatToolCall", () => {
  describe("structured tool_calls (PARSE-01, PARSE-02)", () => {
    it("reads a web_search call from a JSON `query` argument", () => {
      expect(resolveStructured("web_search", JSON.stringify({ query: "cursor pro pricing" }))).toEqual({
        name: "web_search",
        query: "cursor pro pricing",
        source: "structured",
      });
    });

    it("reads a search_local_history call from a JSON `query` argument", () => {
      expect(resolveStructured("search_local_history", JSON.stringify({ query: "favorite color" }))).toEqual({
        name: "search_local_history",
        query: "favorite color",
        source: "structured",
      });
    });

    it("picks the first non-empty entry from a `queries` array argument", () => {
      const args = JSON.stringify({ queries: ["", "  ", "iphone 17 price"] });

      expect(resolveStructured("web_search", args)?.query).toBe("iphone 17 price");
    });

    it("normalizes Gemma quote tokens in the arguments payload", () => {
      const args = '{<|"|>query<|"|>: <|"|>weather in delhi<|"|>}';

      expect(resolveStructured("web_search", args)?.query).toBe("weather in delhi");
    });

    it("ignores tool calls that are not known chat tools", () => {
      const result = buildCompletionResult({
        content: "plain answer",
        tool_calls: [{ type: "function", function: { name: "calculator", arguments: "{}" } }],
      });

      expect(resolveChatToolCall(result, USER_FALLBACK_QUERY)).toBeNull();
    });

    it("falls back to the user prompt when structured arguments are not valid JSON", () => {
      expect(resolveStructured("web_search", "<|tool_call|>call:web_search{}")).toEqual({
        name: "web_search",
        query: USER_FALLBACK_QUERY,
        source: "structured",
      });
    });

    it("reads a query nested under stringified arguments", () => {
      const args = JSON.stringify({ arguments: JSON.stringify({ query: "prior preference" }) });

      expect(resolveStructured("search_local_history", args)?.query).toBe("prior preference");
    });
  });

  describe("plain JSON and Gemma-style text tool calls (PARSE-03, PARSE-04)", () => {
    it("resolves an inline web_search tool call as source 'text'", () => {
      expect(resolveFromOutput('<|tool_call|>call:web_search{"query": "cursor pro price"}')).toEqual({
        name: "web_search",
        query: "cursor pro price",
        source: "text",
      });
    });

    it("resolves a plain JSON search_local_history object", () => {
      const content = JSON.stringify({ name: "search_local_history", arguments: { query: "favorite color" } });

      expect(resolveFromOutput(content)).toEqual({
        name: "search_local_history",
        query: "favorite color",
        source: "text",
      });
    });

    it("resolves search_local_history inside a markdown json fence", () => {
      const content = [
        "I'll look that up.",
        "```json",
        '{"name":"search_local_history","arguments":{"query":"favorite color"}}',
        "```",
      ].join("\n");

      expect(resolveFromOutput(content)).toEqual({
        name: "search_local_history",
        query: "favorite color",
        source: "text",
      });
    });

    it("resolves XML-style search_local_history parameter blocks", () => {
      const content = '<tool_call>search_local_history<parameter name="query">favorite color</parameter></tool_call>';

      expect(resolveFromOutput(content)).toEqual({
        name: "search_local_history",
        query: "favorite color",
        source: "text",
      });
    });

    it("resolves lightly unquoted JSON tool arguments", () => {
      const content = '{name: "search_local_history", arguments: {query: "prior decision"}}';

      expect(resolveFromOutput(content)).toEqual({
        name: "search_local_history",
        query: "prior decision",
        source: "text",
      });
    });

    it("falls back to the user prompt when the query cannot be extracted (PARSE-04)", () => {
      expect(resolveFromOutput("<|tool_call|>call:web_search{ malformed }")).toEqual({
        name: "web_search",
        query: USER_FALLBACK_QUERY,
        source: "text",
      });
    });

    it("combines `content` and `text` fields when detecting the tool call", () => {
      expect(resolveFromOutput("", 'call:web_search{"query": "stock quote"}')?.query).toBe("stock quote");
    });
  });

  describe("non-tool output (PARSE-05)", () => {
    it("returns null for ordinary assistant prose", () => {
      expect(resolveFromOutput("Paris is the capital of France.")).toBeNull();
    });

    it("does not treat a plain mention of web_search as a tool call", () => {
      expect(resolveFromOutput("You could use a web_search feature for that.")).toBeNull();
    });
  });
});

describe("resolveWebSearchToolCall", () => {
  it("returns web_search calls and ignores local history calls", () => {
    const webSearch = structuredToolCallResult("web_search", JSON.stringify({ query: "news" }));
    const localHistory = structuredToolCallResult("search_local_history", JSON.stringify({ query: "prefs" }));

    expect(resolveWebSearchToolCall(webSearch, USER_FALLBACK_QUERY)).toEqual({
      name: "web_search",
      query: "news",
      source: "structured",
    });
    expect(resolveWebSearchToolCall(localHistory, USER_FALLBACK_QUERY)).toBeNull();
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
