import { appLogger } from "@/services/logger";

describe("appLogger", () => {
  const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

  afterEach(() => {
    infoSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
  });

  afterAll(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("formats standalone domain logs with emoji and readable label", () => {
    appLogger.domain("Chat").info("send.started", {
      conversationId: "conv-1",
      promptLen: 12,
      promptPreview: "hello world",
    });

    const lines = infoSpy.mock.calls.map((call) => String(call[0]));
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

    const lines = [...infoSpy.mock.calls, ...warnSpy.mock.calls].map((call) => String(call[0]));

    expect(lines[0]).toContain(`💬 Chat  #${trace.traceId}`);
    expect(lines[0]).toContain("demo-model");
    expect(lines[0]).not.toContain("conversationId");
    expect(lines[1]).toContain('"What is PocketLLM?"');
    expect(lines.some((line) => line.startsWith("├─") && line.includes("Pass 1 · tool selection"))).toBe(true);
    expect(lines.some((line) => line.startsWith("├─") && line.includes("System prompt"))).toBe(true);
    expect(lines.some((line) => line.startsWith("├─") && line.includes("Outgoing messages"))).toBe(true);
    expect(lines.some((line) => line.includes("You are PocketLLM"))).toBe(true);
    expect(lines.some((line) => line.startsWith("├─") && line.includes("Web search started"))).toBe(true);
    expect(lines.some((line) => line.includes('"PocketLLM pricing"'))).toBe(true);
    expect(lines.some((line) => line.startsWith("└─") && line.includes("Send complete"))).toBe(true);
  });

  it("stamps elapsed seconds on every traced branch line from startTrace", () => {
    const nowSpy = jest
      .spyOn(performance, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_450)
      .mockReturnValueOnce(2_240);

    try {
      const trace = appLogger.startTrace("Chat", { modelId: "demo-model" });
      // startTrace stamps + root emit (2 now() reads); next branch uses 1450 → 0.45s
      trace.child("LLM").info("model.loading");
      // next branch uses 2240 → 1.24s
      trace.info("send.completed");

      const lines = infoSpy.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.startsWith("├─ [0.45s]") && line.includes("Loading model"))).toBe(true);
      expect(lines.some((line) => line.startsWith("└─ [1.24s]") && line.includes("Send complete"))).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("keeps errors readable without dumping nested objects or noisy ids", () => {
    appLogger.domain("RAG").error("embed.failed", new Error("disk full"), { messageId: "msg-1" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0]?.[0]);
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

    const lines = infoSpy.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes("A".repeat(500)))).toBe(true);
    expect(lines.every((line) => !line.includes("…"))).toBe(true);
    expect(lines.some((line) => line === "│  │ When the user asks about current events, call web_search.")).toBe(true);
    expect(lines.some((line) => line === "│  │ ")).toBe(true);
    expect(lines.some((line) => line === "│  ┌")).toBe(true);
    expect(lines.some((line) => line === "│  └")).toBe(true);
  });
});
