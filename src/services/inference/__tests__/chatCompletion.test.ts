import { buildCompletionResult } from "@tests/testUtils";
import type { CompletionParams, LlamaContext, NativeCompletionResult } from "llama.rn";
import { isTavilyConfigured } from "@/config/env";
import { LOCAL_SEARCH_TOOL, WEB_SEARCH_TOOL } from "@/constants/chat";
import { chatCompletion } from "@/services/inference/chatCompletion";
import { getActiveContext } from "@/services/inference/llamaRuntime";
import { searchWeb, type WebSearchResult } from "@/services/tavilySearch";

jest.mock("@/config/env", () => ({ isTavilyConfigured: jest.fn() }));
jest.mock("@/services/inference/llamaRuntime", () => ({ getActiveContext: jest.fn() }));
jest.mock("@/services/tavilySearch", () => ({ searchWeb: jest.fn() }));
jest.mock("@/services/ragService", () => ({
  buildRagContextForQuery: jest.fn().mockResolvedValue(""),
}));

type CompletionHandler = (
  params: CompletionParams,
  onData?: (data: { content?: string }) => void,
) => Promise<NativeCompletionResult>;

const USER_PROMPT = "What is the price of the Cursor Pro plan?";

const TAVILY_RESULT: WebSearchResult = {
  answer: "Cursor Pro costs $20 per month.",
  formatted: "Answer: Cursor Pro costs $20 per month.\n\nCursor Pricing\nURL: https://cursor.com/pricing",
  resultCount: 5,
};

/**
 * Installs a llama.rn context whose `completion` is backed by the provided handler.
 * The `{ completion }` object is cast to the native context shape (isolated boundary).
 */
function installLlamaContext(completion: jest.MockedFunction<CompletionHandler>): void {
  jest.mocked(getActiveContext).mockReturnValue({ completion } as unknown as LlamaContext);
}

function structuredWebSearchResult(query: string): NativeCompletionResult {
  return buildCompletionResult({
    tool_calls: [{ type: "function", function: { name: "web_search", arguments: JSON.stringify({ query }) } }],
  });
}

function lastCompletionParams(completion: jest.MockedFunction<CompletionHandler>): CompletionParams {
  const call = completion.mock.calls.at(-1);
  if (!call) {
    throw new Error("Expected context.completion to have been called.");
  }
  return call[0];
}

describe("chatCompletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("input validation (INF-01)", () => {
    it("rejects an empty or whitespace-only prompt", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(false);

      await expect(chatCompletion("   ")).rejects.toThrow("Prompt is empty");
    });
  });

  describe("routing without web search (INF-02)", () => {
    it("offers only search_local_history and never calls Tavily when web search is off", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(false);
      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>(
        async (_params, onData) => {
          onData?.({ content: "Paris." });
          return buildCompletionResult({ content: "Paris." });
        },
      );
      installLlamaContext(completion);

      const result = await chatCompletion("What is the capital of France?");

      expect(result.text).toBe("Paris.");
      expect(searchWeb).not.toHaveBeenCalled();
      expect(completion).toHaveBeenCalledTimes(1);
      expect(lastCompletionParams(completion).tools).toEqual([...LOCAL_SEARCH_TOOL]);
      expect(lastCompletionParams(completion).tool_choice).toBe("auto");
    });
  });

  describe("routing with tool calling enabled (INF-03, INF-05, INF-06)", () => {
    it("offers web_search and search_local_history on the first pass", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(true);
      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>(async () =>
        buildCompletionResult({ content: "General knowledge answer." }),
      );
      installLlamaContext(completion);

      await chatCompletion("Who wrote Hamlet?");

      const firstPassParams = completion.mock.calls[0][0];
      expect(firstPassParams.tools).toEqual([...WEB_SEARCH_TOOL, ...LOCAL_SEARCH_TOOL]);
      expect(firstPassParams.tool_choice).toBe("auto");
    });

    it("returns the direct answer and skips search when the model makes no tool call (INF-05)", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(true);
      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>(async () =>
        buildCompletionResult({ content: "Shakespeare wrote Hamlet." }),
      );
      installLlamaContext(completion);

      const result = await chatCompletion("Who wrote Hamlet?");

      expect(result.text).toBe("Shakespeare wrote Hamlet.");
      expect(searchWeb).not.toHaveBeenCalled();
      expect(completion).toHaveBeenCalledTimes(1);
    });

    it("streams pass 1 through the same UI handler used by grounded answers (INF-13)", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(true);
      const onToken = jest.fn();
      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>(
        async (_params, onData) => {
          onData?.({ content: "Shakespeare " });
          onData?.({ content: "Shakespeare wrote Hamlet." });
          return buildCompletionResult({ content: "Shakespeare wrote Hamlet." });
        },
      );
      installLlamaContext(completion);

      await chatCompletion("Who wrote Hamlet?", onToken);

      expect(onToken).toHaveBeenNthCalledWith(1, "Shakespeare ");
      expect(onToken).toHaveBeenNthCalledWith(2, "Shakespeare wrote Hamlet.");
    });

    it("does not search on keyword-heavy prompts unless the model calls the tool (INF-06)", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(true);
      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>(async () =>
        buildCompletionResult({ content: "Here is what I know." }),
      );
      installLlamaContext(completion);

      await chatCompletion("Give me the latest news today about the stock market");

      expect(searchWeb).not.toHaveBeenCalled();
    });
  });

  describe("web search grounded answer (INF-04, INF-16)", () => {
    it("runs Tavily then a grounded second pass when the model calls web_search", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(true);
      jest.mocked(searchWeb).mockResolvedValue(TAVILY_RESULT);

      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>();
      completion
        .mockResolvedValueOnce(structuredWebSearchResult("cursor pro price"))
        .mockResolvedValueOnce(buildCompletionResult({ content: "Cursor Pro is $20/month." }));
      installLlamaContext(completion);

      const result = await chatCompletion(USER_PROMPT);

      expect(searchWeb).toHaveBeenCalledWith(USER_PROMPT, undefined);
      expect(completion).toHaveBeenCalledTimes(2);
      expect(lastCompletionParams(completion).force_pure_content).toBe(true);
      expect(result.text).toBe("Cursor Pro is $20/month.");
    });

    it("invokes the onSearching callback before the search runs (INF-16)", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(true);
      jest.mocked(searchWeb).mockResolvedValue(TAVILY_RESULT);
      const onSearching = jest.fn();

      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>();
      completion
        .mockResolvedValueOnce(structuredWebSearchResult("cursor pro price"))
        .mockResolvedValueOnce(buildCompletionResult({ content: "Answer" }));
      installLlamaContext(completion);

      await chatCompletion(USER_PROMPT, undefined, { onSearching });

      expect(onSearching).toHaveBeenCalledTimes(1);
    });
  });

  describe("resilience and fallback (INF-07, INF-08, INF-12)", () => {
    it("falls back to the Tavily answer when the grounded pass fails (INF-07)", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(true);
      jest.mocked(searchWeb).mockResolvedValue(TAVILY_RESULT);
      const onToken = jest.fn();

      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>();
      completion
        .mockResolvedValueOnce(structuredWebSearchResult("cursor pro price"))
        .mockRejectedValueOnce(new Error("pass 2 crashed"));
      installLlamaContext(completion);

      const result = await chatCompletion(USER_PROMPT, onToken);

      expect(result.text).toBe(TAVILY_RESULT.answer);
      expect(onToken).toHaveBeenLastCalledWith(TAVILY_RESULT.answer);
    });

    it("throws when Tavily returns no answer and no results (INF-08)", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(true);
      jest.mocked(searchWeb).mockResolvedValue({ answer: null, formatted: "No results found.", resultCount: 0 });

      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>(async () =>
        structuredWebSearchResult("obscure query"),
      );
      installLlamaContext(completion);

      await expect(chatCompletion(USER_PROMPT)).rejects.toThrow("Web search returned no results.");
    });

    it("replaces leaked tool-call syntax in the grounded answer with the search context (INF-12)", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(true);
      jest.mocked(searchWeb).mockResolvedValue(TAVILY_RESULT);

      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>();
      completion
        .mockResolvedValueOnce(structuredWebSearchResult("cursor pro price"))
        .mockResolvedValueOnce(buildCompletionResult({ content: '<|tool_call|>call:web_search{"query":"x"}' }));
      installLlamaContext(completion);

      const result = await chatCompletion(USER_PROMPT);

      expect(result.text).toBe(`Answer: ${TAVILY_RESULT.answer}`);
    });
  });

  describe("streaming and metrics (INF-13, INF-15)", () => {
    it("streams accumulated content chunks through onToken (INF-13)", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(false);
      const onToken = jest.fn();
      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>(
        async (_params, onData) => {
          onData?.({ content: "On-device " });
          onData?.({ content: "On-device inference." });
          onData?.({ content: "" });
          return buildCompletionResult({ content: "On-device inference." });
        },
      );
      installLlamaContext(completion);

      await chatCompletion("Explain on-device inference", onToken);

      expect(onToken).toHaveBeenNthCalledWith(1, "On-device ");
      expect(onToken).toHaveBeenNthCalledWith(2, "On-device inference.");
      expect(onToken).toHaveBeenCalledTimes(2);
    });

    it("does not forward raw tool-call syntax to onToken while streaming (INF-13)", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(false);
      const onToken = jest.fn();
      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>(
        async (_params, onData) => {
          onData?.({ content: "Looking it up " });
          onData?.({ content: 'Looking it up <|tool_call|>call:web_search{"query":"x"}' });
          return buildCompletionResult({ content: 'Looking it up <|tool_call|>call:web_search{"query":"x"}' });
        },
      );
      installLlamaContext(completion);

      await chatCompletion("What is Cursor Pro?", onToken);

      expect(onToken).toHaveBeenCalledWith("Looking it up ");
      expect(onToken.mock.calls.every(([chunk]) => !chunk.includes("tool_call"))).toBe(true);
    });

    it("maps llama.rn timings into chat metrics (INF-15)", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(false);
      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>(async () =>
        buildCompletionResult({ content: "Answer" }),
      );
      installLlamaContext(completion);

      const result = await chatCompletion("Any question");

      expect(result.metrics).toEqual({
        tokensPerSecond: 42,
        promptTokens: 12,
        completionTokens: 24,
        totalTimeMs: 300,
      });
    });

    it("omits metrics when the result has no timings", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(false);
      const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>(async () =>
        buildCompletionResult({ content: "Answer", timings: undefined }),
      );
      installLlamaContext(completion);

      const result = await chatCompletion("Any question");

      expect(result.metrics).toBeUndefined();
    });
  });

  describe("missing llama.rn context", () => {
    it("throws when no active context is available", async () => {
      jest.mocked(isTavilyConfigured).mockReturnValue(false);
      jest.mocked(getActiveContext).mockReturnValue(null);

      await expect(chatCompletion("Hello")).rejects.toThrow("No context found");
    });
  });
});
