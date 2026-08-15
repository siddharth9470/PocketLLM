import { buildCompletionResult } from "@tests/testUtils";
import type { CompletionParams, LlamaContext, NativeCompletionResult } from "llama.rn";
import { isTavilyConfigured } from "@/config/env";
import { LOCAL_SEARCH_TOOL, WEB_SEARCH_TOOL } from "@/constants/chat";
import { chatCompletion, estimateTokenCount, selectTokenBoundedHistory } from "@/services/inference/chatCompletion";
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

type CompletionMock = jest.Mock<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>;

const USER_PROMPT = "What is the price of the Cursor Pro plan?";
const LEAKED_TOOL_CALL = '<|tool_call|>call:web_search{"query":"x"}';

const TAVILY_RESULT: WebSearchResult = {
  answer: "Cursor Pro costs $20 per month.",
  formatted: "Answer: Cursor Pro costs $20 per month.\n\nCursor Pricing\nURL: https://cursor.com/pricing",
  resultCount: 5,
};

/**
 * Installs a llama.rn context whose `completion` is backed by the optional handler.
 * The `{ completion }` object is cast to the native context shape (isolated boundary).
 */
function installCompletion(handler?: CompletionHandler): CompletionMock {
  const completion = jest.fn<ReturnType<CompletionHandler>, Parameters<CompletionHandler>>(handler);
  jest.mocked(getActiveContext).mockReturnValue({ completion } as unknown as LlamaContext);
  return completion;
}

/**
 * Installs a context that settles one queued outcome per inference pass, in order.
 * `Error` outcomes reject so fallback paths can be exercised.
 */
function installPasses(...outcomes: Array<NativeCompletionResult | Error>): CompletionMock {
  const completion = installCompletion();
  for (const outcome of outcomes) {
    if (outcome instanceof Error) {
      completion.mockRejectedValueOnce(outcome);
    } else {
      completion.mockResolvedValueOnce(outcome);
    }
  }
  return completion;
}

/** Builds a handler that streams `streamedChunks` through `onData` before resolving with `content`. */
function replyWith(content: string, ...streamedChunks: string[]): CompletionHandler {
  return async (_params, onData) => {
    for (const chunk of streamedChunks) {
      onData?.({ content: chunk });
    }
    return buildCompletionResult({ content });
  };
}

function webSearchToolCall(query: string): NativeCompletionResult {
  return buildCompletionResult({
    tool_calls: [{ type: "function", function: { name: "web_search", arguments: JSON.stringify({ query }) } }],
  });
}

function enableWebSearch(result: WebSearchResult = TAVILY_RESULT): void {
  jest.mocked(isTavilyConfigured).mockReturnValue(true);
  jest.mocked(searchWeb).mockResolvedValue(result);
}

function lastCompletionParams(completion: CompletionMock): CompletionParams {
  const call = completion.mock.calls.at(-1);
  if (!call) {
    throw new Error("Expected context.completion to have been called.");
  }
  return call[0];
}

describe("chatCompletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const level of ["log", "info", "warn", "error"] as const) {
      jest.spyOn(console, level).mockImplementation(() => undefined);
    }
    jest.mocked(isTavilyConfigured).mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("input validation (INF-01)", () => {
    it("rejects an empty or whitespace-only prompt", async () => {
      await expect(chatCompletion("   ")).rejects.toThrow("Prompt is empty");
    });
  });

  describe("routing without web search (INF-02)", () => {
    it("offers only search_local_history and never calls Tavily when web search is off", async () => {
      const completion = installCompletion(replyWith("Paris.", "Paris."));

      const result = await chatCompletion("What is the capital of France?");

      expect(result.text).toBe("Paris.");
      expect(searchWeb).not.toHaveBeenCalled();
      expect(completion).toHaveBeenCalledTimes(1);
      expect(lastCompletionParams(completion).tools).toEqual([...LOCAL_SEARCH_TOOL]);
      expect(lastCompletionParams(completion).tool_choice).toBe("auto");
    });
  });

  describe("routing with tool calling enabled (INF-03, INF-05, INF-06)", () => {
    beforeEach(() => {
      enableWebSearch();
    });

    it("offers web_search and search_local_history on the first pass", async () => {
      const completion = installCompletion(replyWith("General knowledge answer."));

      await chatCompletion("Who wrote Hamlet?");

      const firstPassParams = completion.mock.calls[0][0];
      expect(firstPassParams.tools).toEqual([...WEB_SEARCH_TOOL, ...LOCAL_SEARCH_TOOL]);
      expect(firstPassParams.tool_choice).toBe("auto");
    });

    it("returns the direct answer and skips search when the model makes no tool call (INF-05)", async () => {
      const completion = installCompletion(replyWith("Shakespeare wrote Hamlet."));

      const result = await chatCompletion("Who wrote Hamlet?");

      expect(result.text).toBe("Shakespeare wrote Hamlet.");
      expect(searchWeb).not.toHaveBeenCalled();
      expect(completion).toHaveBeenCalledTimes(1);
    });

    it("streams pass 1 through the same UI handler used by grounded answers (INF-13)", async () => {
      const onToken = jest.fn();
      installCompletion(replyWith("Shakespeare wrote Hamlet.", "Shakespeare ", "Shakespeare wrote Hamlet."));

      await chatCompletion("Who wrote Hamlet?", onToken);

      expect(onToken).toHaveBeenNthCalledWith(1, "Shakespeare ");
      expect(onToken).toHaveBeenNthCalledWith(2, "Shakespeare wrote Hamlet.");
    });

    it("does not search on keyword-heavy prompts unless the model calls the tool (INF-06)", async () => {
      installCompletion(replyWith("Here is what I know."));

      await chatCompletion("Give me the latest news today about the stock market");

      expect(searchWeb).not.toHaveBeenCalled();
    });
  });

  describe("web search grounded answer (INF-04, INF-16)", () => {
    beforeEach(() => {
      enableWebSearch();
    });

    it("runs Tavily then a grounded second pass when the model calls web_search", async () => {
      const completion = installPasses(
        webSearchToolCall("cursor pro price"),
        buildCompletionResult({ content: "Cursor Pro is $20/month." }),
      );

      const result = await chatCompletion(USER_PROMPT);

      expect(searchWeb).toHaveBeenCalledWith(USER_PROMPT, undefined);
      expect(completion).toHaveBeenCalledTimes(2);
      expect(lastCompletionParams(completion).force_pure_content).toBe(true);
      expect(result.text).toBe("Cursor Pro is $20/month.");
    });

    it("invokes the onSearching callback before the search runs (INF-16)", async () => {
      const onSearching = jest.fn();
      installPasses(webSearchToolCall("cursor pro price"), buildCompletionResult({ content: "Answer" }));

      await chatCompletion(USER_PROMPT, undefined, { onSearching });

      expect(onSearching).toHaveBeenCalledTimes(1);
    });
  });

  describe("resilience and fallback (INF-07, INF-08, INF-12)", () => {
    beforeEach(() => {
      enableWebSearch();
    });

    it("falls back to the Tavily answer when the grounded pass fails (INF-07)", async () => {
      const onToken = jest.fn();
      installPasses(webSearchToolCall("cursor pro price"), new Error("pass 2 crashed"));

      const result = await chatCompletion(USER_PROMPT, onToken);

      expect(result.text).toBe(TAVILY_RESULT.answer);
      expect(onToken).toHaveBeenLastCalledWith(TAVILY_RESULT.answer);
    });

    it("throws when Tavily returns no answer and no results (INF-08)", async () => {
      enableWebSearch({ answer: null, formatted: "No results found.", resultCount: 0 });
      installCompletion(async () => webSearchToolCall("obscure query"));

      await expect(chatCompletion(USER_PROMPT)).rejects.toThrow("Web search returned no results.");
    });

    it("replaces leaked tool-call syntax in the grounded answer with the search context (INF-12)", async () => {
      installPasses(webSearchToolCall("cursor pro price"), buildCompletionResult({ content: LEAKED_TOOL_CALL }));

      const result = await chatCompletion(USER_PROMPT);

      expect(result.text).toBe(`Answer: ${TAVILY_RESULT.answer}`);
    });
  });

  describe("streaming and metrics (INF-13, INF-15)", () => {
    it("streams accumulated content chunks through onToken (INF-13)", async () => {
      const onToken = jest.fn();
      installCompletion(replyWith("On-device inference.", "On-device ", "On-device inference.", ""));

      await chatCompletion("Explain on-device inference", onToken);

      expect(onToken).toHaveBeenNthCalledWith(1, "On-device ");
      expect(onToken).toHaveBeenNthCalledWith(2, "On-device inference.");
      expect(onToken).toHaveBeenCalledTimes(2);
    });

    it("does not forward raw tool-call syntax to onToken while streaming (INF-13)", async () => {
      const onToken = jest.fn();
      const leakedStream = `Looking it up ${LEAKED_TOOL_CALL}`;
      installCompletion(replyWith(leakedStream, "Looking it up ", leakedStream));

      await chatCompletion("What is Cursor Pro?", onToken);

      expect(onToken).toHaveBeenCalledWith("Looking it up ");
      expect(onToken.mock.calls.every(([chunk]) => !chunk.includes("tool_call"))).toBe(true);
    });

    it("maps llama.rn timings into chat metrics (INF-15)", async () => {
      installCompletion(replyWith("Answer"));

      const result = await chatCompletion("Any question");

      expect(result.metrics).toEqual({
        tokensPerSecond: 42,
        promptTokens: 12,
        completionTokens: 24,
        totalTimeMs: 300,
      });
    });

    it("omits metrics when the result has no timings", async () => {
      installCompletion(async () => buildCompletionResult({ content: "Answer", timings: undefined }));

      const result = await chatCompletion("Any question");

      expect(result.metrics).toBeUndefined();
    });
  });

  describe("missing llama.rn context", () => {
    it("throws when no active context is available", async () => {
      jest.mocked(getActiveContext).mockReturnValue(null);

      await expect(chatCompletion("Hello")).rejects.toThrow("No context found");
    });
  });

  describe("token-bounded history window", () => {
    it("estimates tokens with the chars/4 heuristic", () => {
      expect(estimateTokenCount("abcd")).toBe(1);
      expect(estimateTokenCount("abcde")).toBe(2);
      expect(estimateTokenCount("")).toBe(0);
    });

    it("keeps the newest turns that fit the token budget in chronological order", () => {
      // Each turn is ~100 estimated tokens, so a 250 budget admits only the last two.
      const history = [
        { role: "user" as const, content: "a".repeat(400) },
        { role: "assistant" as const, content: "b".repeat(400) },
        { role: "user" as const, content: "c".repeat(400) },
        { role: "assistant" as const, content: "d".repeat(400) },
      ];

      expect(selectTokenBoundedHistory(history, 250)).toEqual([
        { role: "user", content: "c".repeat(400) },
        { role: "assistant", content: "d".repeat(400) },
      ]);
    });

    it("injects pruned history between system and latest user on Pass 1", async () => {
      const completion = installCompletion(replyWith("Got it."));

      await chatCompletion("Latest question", undefined, {
        history: [
          { role: "user", content: "Earlier question" },
          { role: "assistant", content: "Earlier answer" },
        ],
      });

      const messages = completion.mock.calls[0][0].messages ?? [];
      expect(messages[0]).toEqual(expect.objectContaining({ role: "system" }));
      expect(messages[1]).toEqual({ role: "user", content: "Earlier question" });
      expect(messages[2]).toEqual({ role: "assistant", content: "Earlier answer" });
      expect(messages.at(-1)).toEqual({ role: "user", content: "Latest question" });
    });
  });
});
