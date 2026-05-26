import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { chatDb } from "./ChatDB";

const VAULT_KEY_NAME = "pocketllm_secure_aes_key";

export const initializeAllDatabases = async (): Promise<void> => {
    try {
        console.log("Starting parallel database initialization...");

        const hardwareKey = await getCryptoHardwareKey();

        await Promise.all([chatDb.initialize(hardwareKey)]);

        console.log("🚀 All databases initialized and unlocked successfully!");
    } catch (error) {
        console.error("FATAL: Database orchestrator failed to boot:", error);
        throw error;
    }
};

const getCryptoHardwareKey = async () => {
    try {
        let hardwareKey = await SecureStore.getItemAsync(VAULT_KEY_NAME);

        if (!hardwareKey) {
            console.log("Initializing secure hardware vault for first launch...");
            const randomBytes = await Crypto.getRandomBytesAsync(32);
            hardwareKey = Array.from(randomBytes)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");

            await SecureStore.setItemAsync(VAULT_KEY_NAME, hardwareKey);
        }
        return hardwareKey;
    } catch (error) {
        console.error("CRITICAL: Failed to decrypt secure application layer:", error);
        throw error;
    }
};
