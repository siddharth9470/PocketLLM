import { ANDROID_DATABASE_PATH, type DB, IOS_LIBRARY_PATH, open } from "@op-engineering/op-sqlite";
import { Platform } from "react-native";

import type { ChatMessage, Conversation } from "../types/chat";

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
    } catch (error) {
      console.error("CRITICAL: Failed to initialize chat database:", error);
      throw error;
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
    const result = await connection.execute("SELECT id FROM conversations WHERE id = ? LIMIT 1;", [
      conversationId,
    ]);
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

    await connection.execute("DELETE FROM chat_messages WHERE conversation_id = ?;", [conversationId]);
    await connection.execute("DELETE FROM conversations WHERE id = ?;", [conversationId]);
  }

  public async getConversations(): Promise<Conversation[]> {
    const connection = this.getDatabaseConnection();
    const result = await connection.execute(
      "SELECT * FROM conversations ORDER BY updated_at DESC;",
    );

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
        tokens_per_second,
        prompt_tokens,
        completion_tokens,
        total_time_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        message.id,
        message.conversationId,
        message.role,
        message.content,
        message.status,
        message.createdAt,
        message.error ?? null,
        message.metrics?.tokensPerSecond ?? null,
        message.metrics?.promptTokens ?? null,
        message.metrics?.completionTokens ?? null,
        message.metrics?.totalTimeMs ?? null,
      ],
    );
  }

  public async getMessagesByConversationId(conversationId: string): Promise<ChatMessage[]> {
    const connection = this.getDatabaseConnection();
    const result = await connection.execute(
      "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC;",
      [conversationId],
    );

    return result.rows.map((row) => rowToMessage(row as unknown as ChatMessageRow));
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

export async function getMessagesByConversationId(conversationId: string): Promise<ChatMessage[]> {
  return chatDb.getMessagesByConversationId(conversationId);
}
