import { RAG_CONTEXT_HEADER } from "@/constants/rag";
import { buildRagContextBlock } from "@/services/rag/ragContext";
import type { ChatMessage } from "@/types/chat";

describe("buildRagContextBlock", () => {
  it("returns an empty string when no messages are provided", () => {
    expect(buildRagContextBlock([])).toBe("");
  });

  it("formats retrieved user and assistant turns into a RAG block", () => {
    const messages: ChatMessage[] = [
      {
        id: "msg-1",
        conversationId: "conv-1",
        role: "user",
        content: "What is PocketLLM?",
        status: "completed",
        createdAt: "2024-06-01T10:00:00.000Z",
      },
      {
        id: "msg-2",
        conversationId: "conv-1",
        role: "assistant",
        content: "An on-device assistant.",
        status: "completed",
        createdAt: "2024-06-01T10:00:01.000Z",
      },
    ];

    expect(buildRagContextBlock(messages)).toBe(
      `${RAG_CONTEXT_HEADER}\nUser: What is PocketLLM?\n\nAssistant: An on-device assistant.`,
    );
  });
});
