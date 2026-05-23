import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "downloadedModels_v1";

export interface DownloadedModel {
    id: string;
    name: string;
    filePath: string;
    size: number; // bytes
    downloadedAt: number; // epoch ms
}

type DownloadedMap = Record<string, DownloadedModel>;

export async function getDownloadedModels(): Promise<DownloadedMap> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as DownloadedMap;
    } catch (error) {
        console.error("getDownloadedModels error", error);
        return {};
    }
}

export async function saveDownloadedModel(model: DownloadedModel): Promise<void> {
    try {
        const current = await getDownloadedModels();
        current[model.id] = model;
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (error) {
        console.error("saveDownloadedModel error", error);
    }
}

export async function removeDownloadedModel(modelId: string): Promise<void> {
    try {
        const current = await getDownloadedModels();
        if (current[modelId]) {
            delete current[modelId];
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
        }
    } catch (error) {
        console.error("removeDownloadedModel error", error);
    }
}

export async function isModelDownloaded(modelId: string): Promise<boolean> {
    const current = await getDownloadedModels();
    return Boolean(current[modelId]);
}
