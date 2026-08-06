import { mockExecute } from "@tests/testUtils";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID } from "@/constants/rag";
import { chatDb, saveMessageEmbedding, searchSimilarMessages } from "@/db/ChatDB";

const MESSAGE_ID = "msg-embed-1";
const CONVERSATION_ID = "conv-1";
const MESSAGE_ROLE = "assistant" as const;
const QUERY_VECTOR = new Float32Array(EMBEDDING_DIMENSION).fill(0.1);

function buildChatMessageRow(messageId: string) {
  return {
    id: messageId,
    conversation_id: "conv-1",
    role: "assistant",
    content: "Retrieved answer",
    status: "completed",
    created_at: "2024-06-01T10:00:00.000Z",
    error: null,
    truncated: 0,
    tokens_per_second: null,
    prompt_tokens: null,
    completion_tokens: null,
    total_time_ms: null,
  };
}

describe("ChatDB message embeddings", () => {
  beforeAll(async () => {
    await chatDb.initialize("test-hardware-key");
  });

  beforeEach(() => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1 });
  });

  it("persists embeddings into message_embeddings", async () => {
    await saveMessageEmbedding(MESSAGE_ID, CONVERSATION_ID, MESSAGE_ROLE, QUERY_VECTOR);

    const insertCall = mockExecute.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO message_embeddings"));
    expect(insertCall).toBeDefined();
    const [sql, params] = insertCall as [string, unknown[]];
    expect(sql).toContain("INSERT INTO message_embeddings");
    expect(params[0]).toBe(MESSAGE_ID);
    expect(params[1]).toBe(CONVERSATION_ID);
    expect(params[2]).toBe(MESSAGE_ROLE);
    expect(params[3]).toBe(EMBEDDING_DIMENSION);
    expect(params[4]).toBe(EMBEDDING_MODEL_ID);
    expect(params[5]).toBe(QUERY_VECTOR);
  });

  it("searches similar messages via sqlite-vec and hydrates chat rows", async () => {
    mockExecute.mockImplementation(async (sql: string) => {
      const query = String(sql);
      if (query.includes("message_embeddings")) {
        return { rows: [{ message_id: MESSAGE_ID, distance: 0.12 }], rowsAffected: 0 };
      }
      if (query.includes("FROM chat_messages")) {
        return { rows: [buildChatMessageRow(MESSAGE_ID)], rowsAffected: 0 };
      }
      if (query.includes("FROM message_attachments")) {
        return { rows: [], rowsAffected: 0 };
      }
      return { rows: [], rowsAffected: 1 };
    });

    const results = await searchSimilarMessages(QUERY_VECTOR, 4);

    const knnCall = mockExecute.mock.calls.find(([sql]) => String(sql).includes("message_embeddings"));
    expect(knnCall).toBeDefined();
    expect(String(knnCall?.[0])).toContain("embedding MATCH");
    expect(String(knnCall?.[0])).toContain("ORDER BY distance");

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(MESSAGE_ID);
    expect(results[0]?.content).toBe("Retrieved answer");
  });
});
