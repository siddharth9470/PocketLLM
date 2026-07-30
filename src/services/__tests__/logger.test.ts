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
    trace.child("Tool").warn("web_search.started", { query: "PocketLLM pricing" });
    trace.info("send.completed");

    const lines = [...infoSpy.mock.calls, ...warnSpy.mock.calls].map((call) => String(call[0]));

    expect(lines[0]).toContain(`💬 Chat  #${trace.traceId}`);
    expect(lines[0]).toContain("demo-model");
    expect(lines[0]).not.toContain("conversationId");
    expect(lines[1]).toContain('"What is PocketLLM?"');
    expect(lines.some((line) => line.startsWith("├─") && line.includes("Pass 1 · tool selection"))).toBe(true);
    expect(lines.some((line) => line.startsWith("├─") && line.includes("Web search started"))).toBe(true);
    expect(lines.some((line) => line.includes('"PocketLLM pricing"'))).toBe(true);
    expect(lines.some((line) => line.startsWith("└─") && line.includes("Send complete"))).toBe(true);
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
});
