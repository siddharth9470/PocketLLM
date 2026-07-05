import {
  ANDROID_DATABASE_PATH,
  type DB,
  IOS_LIBRARY_PATH,
  open,
} from "@op-engineering/op-sqlite";
import { Platform } from "react-native";

class ChatDatabaseManager {
  // 1. Hold a private static instance of the class itself
  private static instance: ChatDatabaseManager | null = null;
  // 2. Hold the active native database connection reference
  private db: DB | null = null;

  // A private constructor prevents other files from typing `new SecureDatabaseManager()`
  private constructor() {}

  /**
   * Retrieves the single global instance of the Database Manager
   */
  public static getInstance(): ChatDatabaseManager {
    if (!ChatDatabaseManager.instance) {
      ChatDatabaseManager.instance = new ChatDatabaseManager();
    }
    return ChatDatabaseManager.instance;
  }

  /**
   * Initializes the encryption key vault and unlocks the SQLCipher file link
   */
  public async initialize(hardwareKey: string): Promise<void> {
    // Prevent re-initialization if the connection is already active
    if (this.db) {
      console.log("Database connection is already open.");
      return;
    }

    try {
      // Open and cache the database instance inside the class property
      this.db = open({
        name: "pocketllm_encrypted_chat.db",
        encryptionKey: hardwareKey,
        location:
          Platform.OS === "ios" ? IOS_LIBRARY_PATH : ANDROID_DATABASE_PATH,
      });

      console.log(
        "🔒 SQLCipher Layer Verified. Database Decrypted and Unlocked.",
      );

      // Standardize schema layout
      this.db.execute(
        `CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY NOT NULL,
                    text TEXT NOT NULL,
                    createdAt INTEGER NOT NULL,
                    senderType TEXT NOT NULL
                );`,
      );
    } catch (error) {
      console.error(
        "CRITICAL: Failed to decrypt secure application layer:",
        error,
      );
      throw error;
    }
  }

  private getDatabaseConnection(): DB {
    if (!this.db) {
      throw new Error(
        "Database has not been initialized. Call initialize() first.",
      );
    }
    return this.db;
  }

  public async createMessage(
    id: string,
    text: string,
    senderType: "user" | "ai",
  ) {
    const connection = this.getDatabaseConnection();
    await connection.execute(
      "INSERT INTO messages (id, text, createdAt, senderType) VALUES (?, ?, ?, ?);",
      [id, text, Date.now(), senderType],
    );
  }

  public async getAllMessages() {
    const connection = this.getDatabaseConnection();
    const result = await connection.execute(
      "SELECT * FROM messages ORDER BY createdAt ASC;",
    );
    return result;
  }

  public deleteMessage(id: string): void {
    const connection = this.getDatabaseConnection();
    connection.execute("DELETE FROM messages WHERE id = ?;", [id]);
  }

  public clearAllHistory(): void {
    const connection = this.getDatabaseConnection();
    connection.execute("DELETE FROM messages;");
  }
}

export const chatDb = ChatDatabaseManager.getInstance();
