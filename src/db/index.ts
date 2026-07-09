import { ANDROID_DATABASE_PATH, IOS_LIBRARY_PATH } from "@op-engineering/op-sqlite";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { chatDb } from "@/db/ChatDB";
import { modelDb } from "@/db/ModelDB";

const VAULT_KEY_NAME = "pocketllm_secure_aes_key";

const ENCRYPTED_DATABASE_NAMES = ["pocketllm_encrypted_chat.db", "pocketllm_encrypted_models.db"] as const;
const DATABASE_FILE_SUFFIXES = ["", "-wal", "-shm", "-journal"] as const;

function joinPath(base: string, name: string): string {
  return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
}

async function deleteOrphanedEncryptedDatabases(): Promise<void> {
  const directory = Platform.OS === "ios" ? IOS_LIBRARY_PATH : ANDROID_DATABASE_PATH;

  await Promise.all(
    ENCRYPTED_DATABASE_NAMES.flatMap((databaseName) =>
      DATABASE_FILE_SUFFIXES.map(async (suffix) => {
        const path = joinPath(directory, `${databaseName}${suffix}`);
        try {
          await FileSystem.deleteAsync(path, { idempotent: true });
        } catch (error) {
          console.warn(`Failed to delete orphaned database artifact at ${path}:`, error);
        }
      }),
    ),
  );
}

export const initializeAllDatabases = async (): Promise<void> => {
  try {
    console.log("Starting parallel database initialization...");

    const { hardwareKey, isNewVault } = await getCryptoHardwareKey();

    // A new SecureStore key can never decrypt Auto Backup / leftover SQLCipher files.
    if (isNewVault) {
      console.log("New secure vault detected. Clearing orphaned encrypted database files...");
      await deleteOrphanedEncryptedDatabases();
    }

    await Promise.all([chatDb.initialize(hardwareKey), modelDb.initialize(hardwareKey)]);

    console.log("🚀 All databases initialized and unlocked successfully!");
  } catch (error) {
    console.error("FATAL: Database orchestrator failed to boot:", error);
    throw error;
  }
};

const getCryptoHardwareKey = async (): Promise<{ hardwareKey: string; isNewVault: boolean }> => {
  try {
    let hardwareKey = await SecureStore.getItemAsync(VAULT_KEY_NAME);

    if (!hardwareKey) {
      console.log("Initializing secure hardware vault for first launch...");
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      hardwareKey = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      await SecureStore.setItemAsync(VAULT_KEY_NAME, hardwareKey);
      return { hardwareKey, isNewVault: true };
    }

    return { hardwareKey, isNewVault: false };
  } catch (error) {
    console.error("CRITICAL: Failed to decrypt secure application layer:", error);
    throw error;
  }
};
