import { appLogger } from "@/services/logger";

function silenceConsole(level: "info" | "warn" | "error") {
  return jest.spyOn(console, level).mockImplementation(() => undefined);
}

type ConsoleSpy = ReturnType<typeof silenceConsole>;

describe("appLogger", () => {
  let infoSpy: ConsoleSpy;
  let warnSpy: ConsoleSpy;
  let errorSpy: ConsoleSpy;

  beforeEach(() => {
    infoSpy = silenceConsole("info");
    warnSpy = silenceConsole("warn");
    errorSpy = silenceConsole("error");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Formatted first argument of every captured console call, in emit order per spy. */
  function emittedLines(...spies: ConsoleSpy[]): string[] {
    return spies.flatMap((spy) => spy.mock.calls.map(([line]) => String(line)));
  }

  function hasBranch(lines: string[], connector: string, text: string): boolean {
    return lines.some((line) => line.startsWith(connector) && line.includes(text));
  }

  it("formats standalone domain logs with emoji and readable label", () => {
    appLogger.domain("Chat").info("send.started", {
      conversationId: "conv-1",
      promptLen: 12,
      promptPreview: "hello world",
    });

    const lines = emittedLines(infoSpy);
    expect(lines[0]).toContain("🚀");
    expect(lines[0]).toContain("[Chat]");
    expect(lines[0]).toContain("Send started");
    expect(lines[0]).toContain("12 chars");
    expect(lines[0]).not.toContain("conversationId");
    expect(lines[1]).toContain('"hello world"');
  });

  it("renders a correlated send as a hierarchical tree", () => {
    const trace = appLogger.startTrace("Chat", {
      conversationId: "conv-2",
      modelId: "demo-model",
      promptPreview: "What is PocketLLM?",
    });
    trace.child("LLM").info("pass1.tool_selection.started");
    trace.child("LLM").info("payload.system_prompt", {
      purpose: "toolSelection",
      systemPromptLen: 42,
      systemPromptPreview: "You are PocketLLM, a helpful on-device assistant.",
    });
    trace.child("LLM").info("payload.messages", {
      purpose: "toolSelection",
      messageCount: 2,
      roles: "system,user",
      userPromptPreview: "What is PocketLLM?",
    });
    trace.child("Tool").warn("web_search.started", { query: "PocketLLM pricing" });
    trace.info("send.completed");

    const lines = emittedLines(infoSpy, warnSpy);

    expect(lines[0]).toContain(`💬 Chat  #${trace.traceId}`);
    expect(lines[0]).toContain("demo-model");
    expect(lines[0]).not.toContain("conversationId");
    expect(lines[1]).toContain('"What is PocketLLM?"');
    expect(hasBranch(lines, "├─", "Pass 1 · tool selection")).toBe(true);
    expect(hasBranch(lines, "├─", "System prompt")).toBe(true);
    expect(hasBranch(lines, "├─", "Outgoing messages")).toBe(true);
    expect(lines.some((line) => line.includes("You are PocketLLM"))).toBe(true);
    expect(hasBranch(lines, "├─", "Web search started")).toBe(true);
    expect(lines.some((line) => line.includes('"PocketLLM pricing"'))).toBe(true);
    expect(hasBranch(lines, "└─", "Send complete")).toBe(true);
  });

  it("stamps elapsed seconds on every traced branch line from startTrace", () => {
    // startTrace stamps + emits the root (2 reads), then each branch reads once: 1450 → 0.45s, 2240 → 1.24s.
    jest
      .spyOn(performance, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_450)
      .mockReturnValueOnce(2_240);

    const trace = appLogger.startTrace("Chat", { modelId: "demo-model" });
    trace.child("LLM").info("model.loading");
    trace.info("send.completed");

    const lines = emittedLines(infoSpy);
    expect(hasBranch(lines, "├─ [0.45s]", "Loading model")).toBe(true);
    expect(hasBranch(lines, "└─ [1.24s]", "Send complete")).toBe(true);
  });

  it("keeps errors readable without dumping nested objects or noisy ids", () => {
    appLogger.domain("RAG").error("embed.failed", new Error("disk full"), { messageId: "msg-1" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line] = emittedLines(errorSpy);
    expect(line).toContain("💥");
    expect(line).toContain("[RAG]");
    expect(line).toContain("Embedding failed");
    expect(line).toContain("disk full");
    expect(line).not.toContain("messageId");
  });

  it("prints the full system prompt payload without truncation and preserves newlines", () => {
    const fullPrompt = [
      "You are PocketLLM, a helpful on-device assistant.",
      "",
      "When the user asks about current events, call web_search.",
      "When the user asks about past chats, call search_local_history.",
      "A".repeat(500),
    ].join("\n");

    expect(fullPrompt.length).toBeGreaterThan(400);

    const trace = appLogger.startTrace("Chat", { modelId: "demo-model" });
    trace.child("LLM").info("payload.system_prompt", {
      purpose: "toolSelection",
      systemPromptLen: fullPrompt.length,
      systemPromptPreview: fullPrompt,
    });
    trace.info("send.completed");

    const lines = emittedLines(infoSpy);
    expect(lines.some((line) => line.includes("A".repeat(500)))).toBe(true);
    expect(lines.every((line) => !line.includes("…"))).toBe(true);
    expect(lines).toContain("│  │ When the user asks about current events, call web_search.");
    expect(lines).toContain("│  │ ");
    expect(lines).toContain("│  ┌");
    expect(lines).toContain("│  └");
  });
});
