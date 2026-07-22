import { mockExecute } from "@tests/testUtils";
import {
  chatDb,
  createMessage,
  createMessageAttachments,
  deleteConversation,
  getConversationById,
  getMessagesByConversationId,
  updateConversation,
  updateMessage,
} from "@/db/ChatDB";
import type { ChatMessage, ChatMessageAttachment } from "@/types/chat";

const CONVERSATION_ID = "conv-1";
const MESSAGE_ID = "msg-1";

const MESSAGE_INSERT = {
  id: 0,
  conversationId: 1,
  role: 2,
  content: 3,
  status: 4,
  createdAt: 5,
  error: 6,
  truncated: 7,
  tokensPerSecond: 8,
  promptTokens: 9,
  completionTokens: 10,
  totalTimeMs: 11,
} as const;

function buildChatMessageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MESSAGE_ID,
    conversation_id: CONVERSATION_ID,
    role: "assistant",
    content: "Hello from the model",
    status: "completed",
    created_at: "2024-06-01T10:00:00.000Z",
    error: null,
    truncated: 0,
    tokens_per_second: null,
    prompt_tokens: null,
    completion_tokens: null,
    total_time_ms: null,
    ...overrides,
  };
}

function findExecuteCall(sqlFragment: string): [string, unknown[]] {
  const call = mockExecute.mock.calls.find(([sql]) => String(sql).includes(sqlFragment));
  if (!call) {
    throw new Error(`Expected an execute call containing: ${sqlFragment}`);
  }
  return call as [string, unknown[]];
}

/** Routes SELECT statements to the supplied message and attachment rows. */
function installReadMock(messageRows: unknown[], attachmentRows: unknown[] = []): void {
  mockExecute.mockImplementation(async (sql: string) => {
    const query = String(sql);
    if (query.includes("FROM chat_messages")) {
      return { rows: messageRows, rowsAffected: 0 };
    }
    if (query.includes("FROM message_attachments")) {
      return { rows: attachmentRows, rowsAffected: 0 };
    }
    if (query.includes("FROM conversations")) {
      return {
        rows: [
          {
            id: CONVERSATION_ID,
            title: "Chat title",
            preview: "preview",
            model_id: "google/gemma-2b-q4",
            created_at: "2024-06-01T09:00:00.000Z",
            updated_at: "2024-06-01T10:00:00.000Z",
          },
        ],
        rowsAffected: 0,
      };
    }
    return { rows: [], rowsAffected: 1 };
  });
}

describe("ChatDB", () => {
  beforeAll(async () => {
    await chatDb.initialize("test-hardware-key");
  });

  beforeEach(() => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1 });
  });

  describe("rowToMessage mapping (DB-01, DB-02, DB-03, DB-04)", () => {
    it("maps core columns to a domain ChatMessage", async () => {
      installReadMock([buildChatMessageRow()]);

      const [message] = await getMessagesByConversationId(CONVERSATION_ID);

      expect(message).toEqual({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        role: "assistant",
        content: "Hello from the model",
        status: "completed",
        createdAt: "2024-06-01T10:00:00.000Z",
      });
    });

    it("includes metrics only when at least one metric column is present (DB-02)", async () => {
      installReadMock([
        buildChatMessageRow({ tokens_per_second: 42.5, prompt_tokens: 12, completion_tokens: 24, total_time_ms: 300 }),
      ]);

      const [message] = await getMessagesByConversationId(CONVERSATION_ID);

      expect(message.metrics).toEqual({
        tokensPerSecond: 42.5,
        promptTokens: 12,
        completionTokens: 24,
        totalTimeMs: 300,
      });
    });

    it("omits metrics entirely when all metric columns are null", async () => {
      installReadMock([buildChatMessageRow()]);

      const [message] = await getMessagesByConversationId(CONVERSATION_ID);

      expect(message.metrics).toBeUndefined();
    });

    it("maps the truncated flag and error column only when set (DB-03, DB-04)", async () => {
      installReadMock([buildChatMessageRow({ truncated: 1, error: "context overflow" })]);

      const [message] = await getMessagesByConversationId(CONVERSATION_ID);

      expect(message.truncated).toBe(true);
      expect(message.error).toBe("context overflow");
    });
  });

  describe("attachment hydration (DB-05, DB-11)", () => {
    it("hydrates messages with their normalized attachment rows", async () => {
      const attachmentRow = {
        id: "att-1",
        message_id: MESSAGE_ID,
        conversation_id: CONVERSATION_ID,
        kind: "image",
        storage_path: "/mock/att.png",
        mime_type: "image/png",
        original_file_name: null,
        file_size_bytes: null,
        width: 100,
        height: 200,
        duration_ms: null,
        sort_order: 0,
        created_at: "2024-06-01T10:00:00.000Z",
      };
      installReadMock([buildChatMessageRow()], [attachmentRow]);

      const [message] = await getMessagesByConversationId(CONVERSATION_ID);

      expect(message.attachments).toEqual([
        expect.objectContaining({
          id: "att-1",
          messageId: MESSAGE_ID,
          kind: "image",
          storagePath: "/mock/att.png",
          fileSizeBytes: 0,
          width: 100,
          height: 200,
        }),
      ]);
    });

    it("returns the conversation with its messages via getConversationById", async () => {
      installReadMock([buildChatMessageRow()]);

      const conversation = await getConversationById(CONVERSATION_ID);

      expect(conversation).toMatchObject({ id: CONVERSATION_ID, modelId: "google/gemma-2b-q4" });
      expect(conversation?.messages).toHaveLength(1);
    });
  });

  describe("createMessage binding (DB-07)", () => {
    it("binds all 12 columns in schema order with null defaults", async () => {
      const message: ChatMessage = {
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        role: "user",
        content: "Hi",
        status: "completed",
        createdAt: "2024-06-01T10:00:00.000Z",
      };

      await createMessage(message);

      const [, params] = findExecuteCall("INSERT INTO chat_messages");
      expect(params[MESSAGE_INSERT.id]).toBe(MESSAGE_ID);
      expect(params[MESSAGE_INSERT.role]).toBe("user");
      expect(params[MESSAGE_INSERT.content]).toBe("Hi");
      expect(params[MESSAGE_INSERT.error]).toBeNull();
      expect(params[MESSAGE_INSERT.truncated]).toBe(0);
      expect(params[MESSAGE_INSERT.tokensPerSecond]).toBeNull();
      expect(params[MESSAGE_INSERT.totalTimeMs]).toBeNull();
    });

    it("persists truncated and metric columns when provided", async () => {
      const message: ChatMessage = {
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        role: "assistant",
        content: "Answer",
        status: "completed",
        createdAt: "2024-06-01T10:00:00.000Z",
        truncated: true,
        metrics: { tokensPerSecond: 40, promptTokens: 5, completionTokens: 8, totalTimeMs: 120 },
      };

      await createMessage(message);

      const [, params] = findExecuteCall("INSERT INTO chat_messages");
      expect(params[MESSAGE_INSERT.truncated]).toBe(1);
      expect(params[MESSAGE_INSERT.tokensPerSecond]).toBe(40);
      expect(params[MESSAGE_INSERT.completionTokens]).toBe(8);
    });
  });

  describe("partial updates (DB-08, DB-09)", () => {
    it("updateMessage writes only the provided fields", async () => {
      await updateMessage(MESSAGE_ID, { content: "edited", status: "completed" });

      const [sql, params] = findExecuteCall("UPDATE chat_messages");
      expect(sql).toContain("content = ?");
      expect(sql).toContain("status = ?");
      expect(sql).not.toContain("tokens_per_second = ?");
      expect(params.at(-1)).toBe(MESSAGE_ID);
    });

    it("updateMessage expands all metric columns when metrics are provided", async () => {
      await updateMessage(MESSAGE_ID, {
        metrics: { tokensPerSecond: 10, promptTokens: 2, completionTokens: 3, totalTimeMs: 50 },
      });

      const [sql] = findExecuteCall("UPDATE chat_messages");
      expect(sql).toContain("tokens_per_second = ?");
      expect(sql).toContain("prompt_tokens = ?");
      expect(sql).toContain("completion_tokens = ?");
      expect(sql).toContain("total_time_ms = ?");
    });

    it("updateMessage is a no-op when no fields are supplied", async () => {
      await updateMessage(MESSAGE_ID, {});

      expect(mockExecute.mock.calls.some(([sql]) => String(sql).includes("UPDATE chat_messages"))).toBe(false);
    });

    it("updateConversation writes only the provided fields", async () => {
      await updateConversation(CONVERSATION_ID, { preview: "new preview" });

      const [sql] = findExecuteCall("UPDATE conversations");
      expect(sql).toContain("preview = ?");
      expect(sql).not.toContain("title = ?");
    });

    it("updateConversation is a no-op when no fields are supplied", async () => {
      await updateConversation(CONVERSATION_ID, {});

      expect(mockExecute.mock.calls.some(([sql]) => String(sql).includes("UPDATE conversations"))).toBe(false);
    });
  });

  describe("attachments write (DB-10)", () => {
    it("performs no execute when the attachment list is empty", async () => {
      await createMessageAttachments([]);

      expect(mockExecute.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO message_attachments"))).toBe(
        false,
      );
    });

    it("inserts one row per attachment", async () => {
      const attachments: ChatMessageAttachment[] = [
        {
          id: "att-1",
          messageId: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          kind: "image",
          storagePath: "/mock/a.png",
          mimeType: "image/png",
          fileSizeBytes: 10,
          sortOrder: 0,
          createdAt: "2024-06-01T10:00:00.000Z",
        },
      ];

      await createMessageAttachments(attachments);

      const inserts = mockExecute.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO message_attachments"));
      expect(inserts).toHaveLength(1);
    });
  });

  describe("deleteConversation cascade (DB-12)", () => {
    it("deletes chat messages before the conversation row", async () => {
      await deleteConversation(CONVERSATION_ID);

      const deleteOrder = mockExecute.mock.calls
        .map(([sql]) => String(sql))
        .filter((sql) => sql.startsWith("DELETE FROM"));

      expect(deleteOrder[0]).toContain("DELETE FROM chat_messages");
      expect(deleteOrder[1]).toContain("DELETE FROM conversations");
    });
  });
});
