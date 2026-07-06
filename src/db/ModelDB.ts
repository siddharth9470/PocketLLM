import { ANDROID_DATABASE_PATH, type DB, IOS_LIBRARY_PATH, open } from "@op-engineering/op-sqlite";
import { Platform } from "react-native";

import type { HuggingFaceModel } from "../types/models";

type DownloadedMap = Record<string, HuggingFaceModel>;

class ModelDatabaseManager {
  private static instance: ModelDatabaseManager | null = null;
  private db: DB | null = null;

  private constructor() {}

  public static getInstance(): ModelDatabaseManager {
    if (!ModelDatabaseManager.instance) {
      ModelDatabaseManager.instance = new ModelDatabaseManager();
    }
    return ModelDatabaseManager.instance;
  }

  public async initialize(hardwareKey: string): Promise<void> {
    if (this.db) {
      console.log("Model database connection is already open.");
      return;
    }

    try {
      this.db = open({
        name: "pocketllm_encrypted_models.db",
        encryptionKey: hardwareKey,
        location: Platform.OS === "ios" ? IOS_LIBRARY_PATH : ANDROID_DATABASE_PATH,
      });

      console.log("🔒 Model SQLCipher layer verified. Database decrypted and unlocked.");

      this.db.execute(
        `CREATE TABLE IF NOT EXISTS downloaded_models (
          id TEXT PRIMARY KEY NOT NULL,
          model_json TEXT NOT NULL,
          local_file_path TEXT,
          download_status TEXT NOT NULL DEFAULT 'idle',
          downloaded_at INTEGER
        );`,
      );
    } catch (error) {
      console.error("CRITICAL: Failed to initialize model database:", error);
      throw error;
    }
  }

  private getDatabaseConnection(): DB {
    if (!this.db) {
      throw new Error("Model database has not been initialized. Call initialize() first.");
    }
    return this.db;
  }

  public async saveDownloadedModel(model: HuggingFaceModel): Promise<void> {
    try {
      const connection = this.getDatabaseConnection();
      const downloadInfo = model.downloadInfo;

      await connection.execute(
        `INSERT INTO downloaded_models (
          id, model_json, local_file_path, download_status, downloaded_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          model_json = excluded.model_json,
          local_file_path = excluded.local_file_path,
          download_status = excluded.download_status,
          downloaded_at = excluded.downloaded_at;`,
        [
          model.id,
          JSON.stringify(model),
          downloadInfo?.localFilePath ?? null,
          downloadInfo?.status ?? "idle",
          downloadInfo?.downloadedAt ?? null,
        ],
      );
    } catch (error) {
      console.error("saveDownloadedModel error", error);
    }
  }

  public async getDownloadedModels(): Promise<DownloadedMap> {
    try {
      const connection = this.getDatabaseConnection();
      const result = await connection.execute("SELECT model_json FROM downloaded_models;");
      const map: DownloadedMap = {};

      for (const row of result.rows) {
        const model = JSON.parse(row.model_json as string) as HuggingFaceModel;
        map[model.id] = model;
      }

      return map;
    } catch (error) {
      console.error("getDownloadedModels error", error);
      return {};
    }
  }

  public async getDownloadedModelsList(): Promise<HuggingFaceModel[]> {
    try {
      const map = await this.getDownloadedModels();
      return Object.values(map)
        .sort((a, b) => (b.downloadInfo?.downloadedAt ?? 0) - (a.downloadInfo?.downloadedAt ?? 0))
        .filter((model) => model.downloadInfo?.downloadedAt !== undefined);
    } catch (error) {
      console.error("getDownloadedModelsList error", error);
      return [];
    }
  }

  public async removeDownloadedModel(modelId: string): Promise<void> {
    try {
      const connection = this.getDatabaseConnection();
      await connection.execute("DELETE FROM downloaded_models WHERE id = ?;", [modelId]);
    } catch (error) {
      console.error("removeDownloadedModel error", error);
    }
  }

  public async isModelDownloaded(modelId: string): Promise<boolean> {
    const current = await this.getDownloadedModels();
    return current[modelId]?.downloadInfo?.status === "completed";
  }
}

export const modelDb = ModelDatabaseManager.getInstance();

export async function getDownloadedModels(): Promise<DownloadedMap> {
  return modelDb.getDownloadedModels();
}

export async function getDownloadedModelsList(): Promise<HuggingFaceModel[]> {
  return modelDb.getDownloadedModelsList();
}

export async function saveDownloadedModel(model: HuggingFaceModel): Promise<void> {
  return modelDb.saveDownloadedModel(model);
}

export async function removeDownloadedModel(modelId: string): Promise<void> {
  return modelDb.removeDownloadedModel(modelId);
}

export async function isModelDownloaded(modelId: string): Promise<boolean> {
  return modelDb.isModelDownloaded(modelId);
}
