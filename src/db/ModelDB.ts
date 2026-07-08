import { ANDROID_DATABASE_PATH, type DB, IOS_LIBRARY_PATH, open } from "@op-engineering/op-sqlite";
import { Platform } from "react-native";

import type { DownloadStatus, HFSibling, HuggingFaceModel, ModelDownloadInfo } from "@/types/models";

type DownloadedMap = Record<string, HuggingFaceModel>;

interface DownloadedModelRow {
  id: string;
  _id: string | null;
  name: string | null;
  likes: number | null;
  private: number | null;
  downloads: number | null;
  tags_json: string | null;
  author: string | null;
  library_name: string | null;
  created_at: string | null;
  model_id: string | null;
  pipeline_tag: string | null;
  siblings_json: string | null;
  local_file_path: string | null;
  download_status: string;
  downloaded_at: number | null;
  file_size: number | null;
}

function boolToSql(value: boolean | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  return value ? 1 : 0;
}

function sqlToBool(value: number | null | undefined): boolean {
  return value === 1;
}

function parseJsonArray<T>(json: string | null | undefined): T[] {
  if (!json) {
    return [];
  }
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function stringifyArray<T>(arr: T[] | undefined): string | null {
  if (arr === undefined) {
    return null;
  }
  return JSON.stringify(arr);
}

function buildDownloadInfo(row: DownloadedModelRow): ModelDownloadInfo | undefined {
  const status = (row.download_status as DownloadStatus) ?? "idle";
  const localFilePath = row.local_file_path ?? undefined;
  const downloadedAt = row.downloaded_at ?? undefined;
  const fileSizeBytes = row.file_size ?? undefined;

  if (status !== "idle" || localFilePath !== undefined || downloadedAt !== undefined || fileSizeBytes !== undefined) {
    return {
      status,
      ...(localFilePath !== undefined ? { localFilePath } : {}),
      ...(downloadedAt !== undefined ? { downloadedAt } : {}),
      ...(fileSizeBytes !== undefined ? { fileSizeBytes } : {}),
    };
  }

  return undefined;
}

function rowToModel(row: DownloadedModelRow): HuggingFaceModel {
  const downloadInfo = buildDownloadInfo(row);

  const model: HuggingFaceModel = {
    _id: row._id ?? "",
    id: row.id,
    name: row.name ?? "",
    likes: row.likes ?? 0,
    private: sqlToBool(row.private),
    downloads: row.downloads ?? 0,
    tags: parseJsonArray<string>(row.tags_json),
    author: row.author ?? "",
    library_name: row.library_name ?? "",
    createdAt: row.created_at ?? "",
    modelId: row.model_id ?? "",
    pipeline_tag: row.pipeline_tag ?? "",
    siblings: parseJsonArray<HFSibling>(row.siblings_json),
    parameterBillions: null,
    ggufFileSizeBytes: null,
  };

  if (downloadInfo !== undefined) {
    model.downloadInfo = downloadInfo;
  }

  return model;
}

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
          _id TEXT,
          name TEXT,
          likes INTEGER,
          private INTEGER,
          downloads INTEGER,
          tags_json TEXT,
          author TEXT,
          library_name TEXT,
          created_at TEXT,
          model_id TEXT,
          pipeline_tag TEXT,
          siblings_json TEXT,
          local_file_path TEXT,
          download_status TEXT NOT NULL DEFAULT 'idle',
          downloaded_at INTEGER,
          file_size INTEGER
        );`,
      );

      try {
        this.db.execute("ALTER TABLE downloaded_models ADD COLUMN file_size INTEGER;");
      } catch {
        // Column already exists on upgraded databases.
      }
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
          id,
          _id,
          name,
          likes,
          private,
          downloads,
          tags_json,
          author,
          library_name,
          created_at,
          model_id,
          pipeline_tag,
          siblings_json,
          local_file_path,
          download_status,
          downloaded_at,
          file_size
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          _id = excluded._id,
          name = excluded.name,
          likes = excluded.likes,
          private = excluded.private,
          downloads = excluded.downloads,
          tags_json = excluded.tags_json,
          author = excluded.author,
          library_name = excluded.library_name,
          created_at = excluded.created_at,
          model_id = excluded.model_id,
          pipeline_tag = excluded.pipeline_tag,
          siblings_json = excluded.siblings_json,
          local_file_path = excluded.local_file_path,
          download_status = excluded.download_status,
          downloaded_at = excluded.downloaded_at,
          file_size = COALESCE(excluded.file_size, downloaded_models.file_size);`,
        [
          model.id,
          model._id ?? null,
          model.name ?? null,
          model.likes ?? null,
          boolToSql(model.private),
          model.downloads ?? null,
          stringifyArray(model.tags),
          model.author ?? null,
          model.library_name ?? null,
          model.createdAt ?? null,
          model.modelId ?? null,
          model.pipeline_tag ?? null,
          stringifyArray(model.siblings),
          downloadInfo?.localFilePath ?? null,
          downloadInfo?.status ?? "idle",
          downloadInfo?.downloadedAt ?? null,
          downloadInfo?.fileSizeBytes ?? null,
        ],
      );
    } catch (error) {
      console.error("saveDownloadedModel error", error);
    }
  }

  public async getDownloadedModels(): Promise<DownloadedMap> {
    try {
      const connection = this.getDatabaseConnection();
      const result = await connection.execute("SELECT * FROM downloaded_models;");
      const map: DownloadedMap = {};

      for (const row of result.rows) {
        const model = rowToModel(row as unknown as DownloadedModelRow);
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
