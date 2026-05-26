import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HuggingFaceModel } from "../types/models";

const STORAGE_KEY = "downloadedModels_v1";

type DownloadedMap = Record<string, HuggingFaceModel>;

export async function getDownloadedModels(): Promise<Record<string, HuggingFaceModel>> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as DownloadedMap;
    } catch (error) {
        console.error("getDownloadedModels error", error);
        return {};
    }
}

export async function getDownloadedModelsList(): Promise<HuggingFaceModel[]> {
    /*
        This function get the mapping of all the model from local storgare, sort/filter with
        some conditions and return
     */
    try {
        const map = await getDownloadedModels();
        return Object.values(map)
            .sort((a, b) => (b.downloadInfo?.downloadedAt ?? 0) - (a.downloadInfo?.downloadedAt ?? 0))
            .filter((model) => model.downloadInfo?.downloadedAt !== undefined);
    } catch (error) {
        console.error("getDownloadedModels error", error);
        return [];
    }
}

export async function saveDownloadedModel(model: HuggingFaceModel): Promise<void> {
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
    return current[modelId]?.downloadInfo?.status === "completed";
}
