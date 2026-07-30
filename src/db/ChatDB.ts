import { ANDROID_DATABASE_PATH, type DB, IOS_LIBRARY_PATH, open } from "@op-engineering/op-sqlite";
import { Platform } from "react-native";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID } from "@/constants/rag";
import { ragDebug } from "@/services/rag/ragDebug";
import type { ChatMessage, ChatMessageAttachment, Conversation } from "@/types/chat";

const MESSAGE_EMBEDDINGS_DELETE_SQL = "DELETE FROM message_embeddings WHERE message_id = ?;";

const MESSAGE_EMBEDDINGS_INSERT_SQL =
  "INSERT INTO message_embeddings(message_id, conversation_id, role, dimensions, embed_model_id, embedding) VALUES (?, ?, ?, ?, ?, ?);";

const MESSAGE_EMBEDDINGS_COUNT_SQL = "SELECT COUNT(*) AS count FROM message_embeddings;";

const MESSAGE_EMBEDDINGS_VEC0_DDL = `CREATE VIRTUAL TABLE message_embeddings USING vec0(
  message_id TEXT PRIMARY KEY,
  conversation_id TEXT,
  role TEXT,
  dimensions INTEGER,
  embed_model_id TEXT,
  embedding float[384] distance_metric=cosine
);`;

const MESSAGE_EMBEDDINGS_SCHEMA_SQL =
  "SELECT sql FROM sqlite_master WHERE type IN ('table', 'virtual table') AND name = 'message_embeddings';";

const MAX_KNN_LIMIT = 64;

function buildMessageEmbeddingsKnnSql(limit: number): string {
  const knnLimit = Math.max(1, Math.min(Math.trunc(limit), MAX_KNN_LIMIT));

  return `SELECT message_id, distance
FROM message_embeddings
WHERE embedding MATCH ?
  AND k = ${knnLimit}
ORDER BY distance;`;
}

function buildMessageEmbeddingsFallbackSql(limit: number): string {
  const knnLimit = Math.max(1, Math.min(Math.trunc(limit), MAX_KNN_LIMIT));

  return `SELECT message_id, vec_distance_cosine(embedding, ?) AS distance
FROM message_embeddings
ORDER BY distance
LIMIT ${knnLimit};`;
}

function isCurrentMessageEmbeddingsSchema(createSql: string): boolean {
  if (!createSql.includes("USING vec0")) {
    return false;
  }

  return (
    createSql.includes("conversation_id") &&
    createSql.includes("role") &&
    createSql.includes("dimensions") &&
    createSql.includes("embed_model_id")
  );
}

interface MessageAttachmentRow {
  id: string;
  message_id: string;
  conversation_id: string;
  kind: string;
  storage_path: string;
  mime_type: string;
  original_file_name: string | null;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  sort_order: number;
  created_at: string;
}

function rowToAttachment(row: MessageAttachmentRow): ChatMessageAttachment {
  const attachment: ChatMessageAttachment = {
    id: row.id,
    messageId: row.message_id,
    conversationId: row.conversation_id,
    kind: row.kind as ChatMessageAttachment["kind"],
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes ?? 0,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };

  if (row.original_file_name) {
    attachment.originalFileName = row.original_file_name;
  }
  if (row.width != null) {
    attachment.width = row.width;
  }
  if (row.height != null) {
    attachment.height = row.height;
  }
  if (row.duration_ms != null) {
    attachment.durationMs = row.duration_ms;
  }

  return attachment;
}

interface ConversationRow {
  id: string;
  title: string;
  preview: string;
  model_id: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  status: string;
  created_at: string;
  error: string | null;
  truncated: number | null;
  tokens_per_second: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_time_ms: number | null;
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    preview: row.preview,
    modelId: row.model_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: ChatMessageRow): ChatMessage {
  const hasMetrics =
    row.tokens_per_second !== null ||
    row.prompt_tokens !== null ||
    row.completion_tokens !== null ||
    row.total_time_ms !== null;

  const message: ChatMessage = {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as ChatMessage["role"],
    content: row.content,
    status: row.status as ChatMessage["status"],
    createdAt: row.created_at,
  };

  if (row.error) {
    message.error = row.error;
  }

  if (row.truncated === 1) {
    message.truncated = true;
  }

  if (hasMetrics) {
    message.metrics = {
      ...(row.tokens_per_second !== null ? { tokensPerSecond: row.tokens_per_second } : {}),
      ...(row.prompt_tokens !== null ? { promptTokens: row.prompt_tokens } : {}),
      ...(row.completion_tokens !== null ? { completionTokens: row.completion_tokens } : {}),
      ...(row.total_time_ms !== null ? { totalTimeMs: row.total_time_ms } : {}),
    };
  }

  return message;
}

class ChatDatabaseManager {
  private static instance: ChatDatabaseManager | null = null;
  private db: DB | null = null;

  private constructor() {}

  public static getInstance(): ChatDatabaseManager {
    if (!ChatDatabaseManager.instance) {
      ChatDatabaseManager.instance = new ChatDatabaseManager();
    }
    return ChatDatabaseManager.instance;
  }

  public async initialize(hardwareKey: string): Promise<void> {
    if (this.db) {
      console.log("Chat database connection is already open.");
      return;
    }

    try {
      this.db = open({
        name: "pocketllm_encrypted_chat.db",
        encryptionKey: hardwareKey,
        location: Platform.OS === "ios" ? IOS_LIBRARY_PATH : ANDROID_DATABASE_PATH,
      });

      console.log("🔒 Chat SQLCipher layer verified. Database decrypted and unlocked.");

      this.db.execute("PRAGMA journal_mode = WAL;");
      this.db.execute("PRAGMA foreign_keys = ON;");

      this.db.execute("DROP TABLE IF EXISTS messages;");

      this.db.execute(
        `CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          preview TEXT NOT NULL DEFAULT '',
          model_id TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );`,
      );

      this.db.execute(
        `CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY NOT NULL,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          error TEXT,
          truncated INTEGER NOT NULL DEFAULT 0,
          tokens_per_second REAL,
          prompt_tokens INTEGER,
          completion_tokens INTEGER,
          total_time_ms INTEGER,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );`,
      );

      this.db.execute(
        "CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);",
      );

      this.db.execute(
        `CREATE TABLE IF NOT EXISTS message_attachments (
          id TEXT PRIMARY KEY NOT NULL,
          message_id TEXT NOT NULL,
          conversation_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          storage_path TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          original_file_name TEXT,
          file_size_bytes INTEGER,
          width INTEGER,
          height INTEGER,
          duration_ms INTEGER,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );`,
      );

      this.db.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id ON message_attachments(message_id);",
      );

      this.db.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_attachments_conversation_id ON message_attachments(conversation_id);",
      );

      try {
        this.db.execute("ALTER TABLE chat_messages ADD COLUMN truncated INTEGER NOT NULL DEFAULT 0;");
      } catch {
        // Column already exists on upgraded databases.
      }

      this.ensureMessageEmbeddingsTable();

      const embeddingCount = await this.getMessageEmbeddingCount();
      ragDebug("Database initialized — message_embeddings row count", { embeddingCount });
    } catch (error) {
      console.error("CRITICAL: Failed to initialize chat database:", error);
      throw error;
    }
  }

  private ensureMessageEmbeddingsTable(): void {
    const connection = this.getDatabaseConnection();
    const schemaResult = connection.executeSync(MESSAGE_EMBEDDINGS_SCHEMA_SQL);
    const createSql = String((schemaResult.rows[0] as { sql: string | null } | undefined)?.sql ?? "");

    if (!isCurrentMessageEmbeddingsSchema(createSql)) {
      ragDebug("Recreating message_embeddings vec0 table", {
        previousSql: createSql || null,
      });
      connection.executeSync("DROP TABLE IF EXISTS message_embeddings;");
      connection.executeSync(MESSAGE_EMBEDDINGS_VEC0_DDL);
    }
  }

  private getDatabaseConnection(): DB {
    if (!this.db) {
      throw new Error("Chat database has not been initialized. Call initialize() first.");
    }
    return this.db;
  }

  public async conversationExists(conversationId: string): Promise<boolean> {
    const connection = this.getDatabaseConnection();
    const result = await connection.execute("SELECT id FROM conversations WHERE id = ? LIMIT 1;", [conversationId]);
    return result.rows.length > 0;
  }

  public async createConversation(conversation: Conversation): Promise<void> {
    const connection = this.getDatabaseConnection();

    await connection.execute(
      `INSERT INTO conversations (
        id, title, preview, model_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?);`,
      [
        conversation.id,
        conversation.title,
        conversation.preview,
        conversation.modelId,
        conversation.createdAt,
        conversation.updatedAt,
      ],
    );
  }

  public async updateConversation(
    conversationId: string,
    updates: Partial<Pick<Conversation, "title" | "preview" | "modelId" | "updatedAt">>,
  ): Promise<void> {
    const connection = this.getDatabaseConnection();
    const fields: string[] = [];
    const values: Array<string> = [];

    if (updates.title !== undefined) {
      fields.push("title = ?");
      values.push(updates.title);
    }

    if (updates.preview !== undefined) {
      fields.push("preview = ?");
      values.push(updates.preview);
    }

    if (updates.modelId !== undefined) {
      fields.push("model_id = ?");
      values.push(updates.modelId);
    }

    if (updates.updatedAt !== undefined) {
      fields.push("updated_at = ?");
      values.push(updates.updatedAt);
    }

    if (fields.length === 0) {
      return;
    }

    values.push(conversationId);

    await connection.execute(`UPDATE conversations SET ${fields.join(", ")} WHERE id = ?;`, values);
  }

  public async deleteConversation(conversationId: string): Promise<void> {
    const connection = this.getDatabaseConnection();

    await connection.execute("DELETE FROM message_embeddings WHERE conversation_id = ?;", [conversationId]);
    await connection.execute("DELETE FROM chat_messages WHERE conversation_id = ?;", [conversationId]);
    await connection.execute("DELETE FROM conversations WHERE id = ?;", [conversationId]);
  }

  public async getConversations(): Promise<Conversation[]> {
    const connection = this.getDatabaseConnection();
    const result = await connection.execute("SELECT * FROM conversations ORDER BY updated_at DESC;");

    return result.rows.map((row) => rowToConversation(row as unknown as ConversationRow));
  }

  public async getConversationById(conversationId: string): Promise<Conversation | null> {
    const connection = this.getDatabaseConnection();
    const conversationResult = await connection.execute("SELECT * FROM conversations WHERE id = ? LIMIT 1;", [
      conversationId,
    ]);

    if (conversationResult.rows.length === 0) {
      return null;
    }

    const conversation = rowToConversation(conversationResult.rows[0] as unknown as ConversationRow);
    const messages = await this.getMessagesByConversationId(conversationId);

    return {
      ...conversation,
      messages,
    };
  }

  /** Persists one or more attachment rows linked to a chat message. */
  public async createMessageAttachments(attachments: ChatMessageAttachment[]): Promise<void> {
    if (attachments.length === 0) {
      return;
    }

    const connection = this.getDatabaseConnection();

    for (const attachment of attachments) {
      await connection.execute(
        `INSERT INTO message_attachments (
          id,
          message_id,
          conversation_id,
          kind,
          storage_path,
          mime_type,
          original_file_name,
          file_size_bytes,
          width,
          height,
          duration_ms,
          sort_order,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          attachment.id,
          attachment.messageId,
          attachment.conversationId,
          attachment.kind,
          attachment.storagePath,
          attachment.mimeType,
          attachment.originalFileName ?? null,
          attachment.fileSizeBytes,
          attachment.width ?? null,
          attachment.height ?? null,
          attachment.durationMs ?? null,
          attachment.sortOrder,
          attachment.createdAt,
        ],
      );
    }
  }

  /** Loads attachment rows for a batch of message ids and groups them by message. */
  private async getAttachmentsGroupedByMessageId(
    messageIds: string[],
  ): Promise<Record<string, ChatMessageAttachment[]>> {
    if (messageIds.length === 0) {
      return {};
    }

    const connection = this.getDatabaseConnection();
    const placeholders = messageIds.map(() => "?").join(", ");
    const result = await connection.execute(
      `SELECT * FROM message_attachments WHERE message_id IN (${placeholders}) ORDER BY sort_order ASC, created_at ASC;`,
      messageIds,
    );

    const grouped: Record<string, ChatMessageAttachment[]> = {};

    for (const row of result.rows) {
      const attachment = rowToAttachment(row as unknown as MessageAttachmentRow);
      const bucket = grouped[attachment.messageId] ?? [];
      bucket.push(attachment);
      grouped[attachment.messageId] = bucket;
    }

    return grouped;
  }

  /** Hydrates chat messages with their normalized attachment rows. */
  private async hydrateMessagesWithAttachments(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const messageIds = messages.map((message) => message.id);
    const grouped = await this.getAttachmentsGroupedByMessageId(messageIds);

    return messages.map((message) => {
      const attachments = grouped[message.id];
      if (!attachments || attachments.length === 0) {
        return message;
      }

      return { ...message, attachments };
    });
  }

  public async getAttachmentStoragePathsByConversationId(conversationId: string): Promise<string[]> {
    const connection = this.getDatabaseConnection();
    const result = await connection.execute("SELECT storage_path FROM message_attachments WHERE conversation_id = ?;", [
      conversationId,
    ]);

    return result.rows.map((row) => String((row as { storage_path: string }).storage_path));
  }

  public async createMessage(message: ChatMessage): Promise<void> {
    const connection = this.getDatabaseConnection();

    await connection.execute(
      `INSERT INTO chat_messages (
        id,
        conversation_id,
        role,
        content,
        status,
        created_at,
        error,
        truncated,
        tokens_per_second,
        prompt_tokens,
        completion_tokens,
        total_time_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        message.id,
        message.conversationId,
        message.role,
        message.content,
        message.status,
        message.createdAt,
        message.error ?? null,
        message.truncated ? 1 : 0,
        message.metrics?.tokensPerSecond ?? null,
        message.metrics?.promptTokens ?? null,
        message.metrics?.completionTokens ?? null,
        message.metrics?.totalTimeMs ?? null,
      ],
    );
  }

  public async updateMessage(
    messageId: string,
    updates: Partial<Pick<ChatMessage, "content" | "status" | "error" | "truncated" | "metrics">>,
  ): Promise<void> {
    const connection = this.getDatabaseConnection();
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (updates.content !== undefined) {
      fields.push("content = ?");
      values.push(updates.content);
    }

    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }

    if (updates.error !== undefined) {
      fields.push("error = ?");
      values.push(updates.error);
    }

    if (updates.truncated !== undefined) {
      fields.push("truncated = ?");
      values.push(updates.truncated ? 1 : 0);
    }

    if (updates.metrics !== undefined) {
      fields.push("tokens_per_second = ?");
      values.push(updates.metrics.tokensPerSecond ?? null);
      fields.push("prompt_tokens = ?");
      values.push(updates.metrics.promptTokens ?? null);
      fields.push("completion_tokens = ?");
      values.push(updates.metrics.completionTokens ?? null);
      fields.push("total_time_ms = ?");
      values.push(updates.metrics.totalTimeMs ?? null);
    }

    if (fields.length === 0) {
      return;
    }

    values.push(messageId);
    await connection.execute(`UPDATE chat_messages SET ${fields.join(", ")} WHERE id = ?;`, values);
  }

  public async getMessagesByConversationId(conversationId: string): Promise<ChatMessage[]> {
    const connection = this.getDatabaseConnection();
    const result = await connection.execute(
      "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC;",
      [conversationId],
    );

    const messages = result.rows.map((row) => rowToMessage(row as unknown as ChatMessageRow));
    return this.hydrateMessagesWithAttachments(messages);
  }

  public async getMessageEmbeddingCount(): Promise<number> {
    const connection = this.getDatabaseConnection();
    const result = await connection.execute(MESSAGE_EMBEDDINGS_COUNT_SQL);
    const countRow = result.rows[0] as { count: number } | undefined;
    return countRow?.count ?? 0;
  }

  public async saveMessageEmbedding(
    messageId: string,
    conversationId: string,
    role: ChatMessage["role"],
    embedding: Float32Array,
  ): Promise<void> {
    const connection = this.getDatabaseConnection();

    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Embedding dimension mismatch for message ${messageId}: expected ${EMBEDDING_DIMENSION}, received ${embedding.length}.`,
      );
    }

    ragDebug("Writing embedding to SQLite", {
      messageId,
      conversationId,
      role,
      dimensions: EMBEDDING_DIMENSION,
      embedModelId: EMBEDDING_MODEL_ID,
      sql: MESSAGE_EMBEDDINGS_INSERT_SQL,
      vectorLength: embedding.length,
    });

    try {
      await connection.execute(MESSAGE_EMBEDDINGS_DELETE_SQL, [messageId]);
      await connection.execute(MESSAGE_EMBEDDINGS_INSERT_SQL, [
        messageId,
        conversationId,
        role,
        EMBEDDING_DIMENSION,
        EMBEDDING_MODEL_ID,
        embedding,
      ]);
      const embeddingCount = await this.getMessageEmbeddingCount();
      ragDebug("Embedding stored successfully in message_embeddings", {
        messageId,
        conversationId,
        role,
        vectorLength: embedding.length,
        totalEmbeddingRows: embeddingCount,
      });
    } catch (error: unknown) {
      ragDebug("Failed to write embedding to message_embeddings", {
        messageId,
        conversationId,
        role,
        vectorLength: embedding.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async searchSimilarMessages(queryEmbedding: Float32Array, limit = 4): Promise<ChatMessage[]> {
    const connection = this.getDatabaseConnection();

    if (queryEmbedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Query embedding dimension mismatch: expected ${EMBEDDING_DIMENSION}, received ${queryEmbedding.length}.`,
      );
    }

    const knnSql = buildMessageEmbeddingsKnnSql(limit);
    const fallbackSql = buildMessageEmbeddingsFallbackSql(limit);

    ragDebug("Executing KNN vector search", {
      sql: knnSql,
      fallbackSql,
      queryVectorLength: queryEmbedding.length,
      limit,
    });

    let knnResult: Awaited<ReturnType<DB["execute"]>>;
    try {
      knnResult = await connection.execute(knnSql, [queryEmbedding]);
    } catch (knnError: unknown) {
      ragDebug("vec0 KNN query failed, falling back to vec_distance_cosine", {
        error: knnError instanceof Error ? knnError.message : String(knnError),
      });
      knnResult = await connection.execute(fallbackSql, [queryEmbedding]);
    }

    const knnMatches = knnResult.rows.map((row) => {
      const matchRow = row as { message_id: string; distance: number };
      return {
        messageId: String(matchRow.message_id),
        distance: matchRow.distance,
      };
    });

    ragDebug("KNN search completed", {
      matchCount: knnMatches.length,
      matches: knnMatches,
    });

    if (knnMatches.length === 0) {
      return [];
    }

    const messageIds = knnMatches.map((match) => match.messageId);
    const placeholders = messageIds.map(() => "?").join(", ");
    const hydrateSql = `SELECT * FROM chat_messages
       WHERE id IN (${placeholders})
         AND status = 'completed'
       ORDER BY created_at ASC;`;

    ragDebug("Hydrating matched messages from chat_messages", {
      sql: hydrateSql,
      messageIds,
    });

    const messagesResult = await connection.execute(hydrateSql, messageIds);

    const messages = messagesResult.rows.map((row) => rowToMessage(row as unknown as ChatMessageRow));
    const hydratedMessages = await this.hydrateMessagesWithAttachments(messages);

    ragDebug("Historical messages hydrated for RAG context", {
      hydratedCount: hydratedMessages.length,
      messages: hydratedMessages.map((message) => ({
        id: message.id,
        role: message.role,
        contentLength: message.content.length,
      })),
    });

    return hydratedMessages;
  }
}

export const chatDb = ChatDatabaseManager.getInstance();

export async function conversationExists(conversationId: string): Promise<boolean> {
  return chatDb.conversationExists(conversationId);
}

export async function createConversation(conversation: Conversation): Promise<void> {
  return chatDb.createConversation(conversation);
}

export async function updateConversation(
  conversationId: string,
  updates: Partial<Pick<Conversation, "title" | "preview" | "modelId" | "updatedAt">>,
): Promise<void> {
  return chatDb.updateConversation(conversationId, updates);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  return chatDb.deleteConversation(conversationId);
}

export async function getConversations(): Promise<Conversation[]> {
  return chatDb.getConversations();
}

export async function getConversationById(conversationId: string): Promise<Conversation | null> {
  return chatDb.getConversationById(conversationId);
}

export async function createMessage(message: ChatMessage): Promise<void> {
  return chatDb.createMessage(message);
}

export async function createMessageAttachments(attachments: ChatMessageAttachment[]): Promise<void> {
  return chatDb.createMessageAttachments(attachments);
}

export async function getAttachmentStoragePathsByConversationId(conversationId: string): Promise<string[]> {
  return chatDb.getAttachmentStoragePathsByConversationId(conversationId);
}

export async function updateMessage(
  messageId: string,
  updates: Partial<Pick<ChatMessage, "content" | "status" | "error" | "truncated" | "metrics">>,
): Promise<void> {
  return chatDb.updateMessage(messageId, updates);
}

export async function getMessagesByConversationId(conversationId: string): Promise<ChatMessage[]> {
  return chatDb.getMessagesByConversationId(conversationId);
}

export async function saveMessageEmbedding(
  messageId: string,
  conversationId: string,
  role: ChatMessage["role"],
  embedding: Float32Array,
): Promise<void> {
  return chatDb.saveMessageEmbedding(messageId, conversationId, role, embedding);
}

export async function searchSimilarMessages(queryEmbedding: Float32Array, limit = 4): Promise<ChatMessage[]> {
  return chatDb.searchSimilarMessages(queryEmbedding, limit);
}

export async function getMessageEmbeddingCount(): Promise<number> {
  return chatDb.getMessageEmbeddingCount();
}
