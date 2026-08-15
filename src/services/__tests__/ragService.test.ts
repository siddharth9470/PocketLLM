import { RAG_CONTEXT_HEADER } from "@/constants/rag";
import { buildRagContextForQuery } from "@/services/ragService";
import type { ChatMessage } from "@/types/chat";

// Embeddings and the resource fetcher come from the global mocks in `jest.setup.ts`;
// only the DB boundary is stubbed here so context assembly can be asserted directly.
jest.mock("@/db", () => ({
  ensureDatabaseReady: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/db/ChatDB", () => {
  const buildMessage = (id: string, role: ChatMessage["role"], content: string, second: number): ChatMessage => ({
    id,
    conversationId: "conv-1",
    role,
    content,
    status: "completed",
    createdAt: `2024-06-01T10:00:0${second}.000Z`,
  });

  return {
    saveMessageEmbedding: jest.fn().mockResolvedValue(undefined),
    searchSimilarMessages: jest
      .fn()
      .mockResolvedValue([
        buildMessage("msg-1", "user", "What is PocketLLM?", 0),
        buildMessage("msg-2", "assistant", "An on-device assistant.", 1),
      ]),
  };
});

describe("ragService", () => {
  it("returns an empty string for blank queries", async () => {
    await expect(buildRagContextForQuery("   ")).resolves.toBe("");
  });

  it("assembles a RAG context block from similar messages", async () => {
    await expect(buildRagContextForQuery("What is PocketLLM?")).resolves.toBe(
      `${RAG_CONTEXT_HEADER}\nUser: What is PocketLLM?\n\nAssistant: An on-device assistant.`,
    );
  });
});
