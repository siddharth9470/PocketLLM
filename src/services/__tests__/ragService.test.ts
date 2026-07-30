import { RAG_CONTEXT_HEADER } from "@/constants/rag";
import { buildRagContextForQuery } from "@/services/ragService";
import type { ChatMessage } from "@/types/chat";

// Re-test context assembly indirectly via exported buildRagContextForQuery empty path,
// and keep a focused unit check by importing the public query API with mocked DB/embeddings.
jest.mock("@/db", () => ({
  ensureDatabaseReady: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/db/ChatDB", () => ({
  saveMessageEmbedding: jest.fn().mockResolvedValue(undefined),
  searchSimilarMessages: jest.fn().mockResolvedValue([
    {
      id: "msg-1",
      conversationId: "conv-1",
      role: "user",
      content: "What is PocketLLM?",
      status: "completed",
      createdAt: "2024-06-01T10:00:00.000Z",
    } satisfies ChatMessage,
    {
      id: "msg-2",
      conversationId: "conv-1",
      role: "assistant",
      content: "An on-device assistant.",
      status: "completed",
      createdAt: "2024-06-01T10:00:01.000Z",
    } satisfies ChatMessage,
  ]),
}));

jest.mock("react-native-executorch", () => {
  const { EMBEDDING_DIMENSION } = require("@/constants/rag");

  return {
    ALL_MINILM_L6_V2: { modelName: "all-minilm-l6-v2" },
    initExecutorch: jest.fn(),
    isAvailable: true,
    TextEmbeddingsModule: {
      fromModelName: jest.fn().mockResolvedValue({
        forward: jest.fn(async () => new Float32Array(EMBEDDING_DIMENSION)),
      }),
    },
  };
});

jest.mock("react-native-executorch-expo-resource-fetcher", () => ({
  ExpoResourceFetcher: {},
}));

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
