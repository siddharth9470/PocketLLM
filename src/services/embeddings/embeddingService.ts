import { ALL_MINILM_L6_V2, isAvailable, TextEmbeddingsModule } from "react-native-executorch";

import { EMBEDDING_DIMENSION } from "@/constants/rag";
import { initializeExecutorch } from "@/services/embeddings/executorchBootstrap";

let embeddingModule: TextEmbeddingsModule | null = null;
let embeddingModulePromise: Promise<TextEmbeddingsModule | null> | null = null;
let prewarmPromise: Promise<boolean> | null = null;

function isEmbeddingRuntimeAvailable(): boolean {
  return isAvailable && typeof TextEmbeddingsModule?.fromModelName === "function";
}

export async function ensureEmbeddingModelReady(): Promise<TextEmbeddingsModule | null> {
  if (!isEmbeddingRuntimeAvailable()) {
    return null;
  }

  initializeExecutorch();

  if (embeddingModule) {
    return embeddingModule;
  }

  if (!embeddingModulePromise) {
    embeddingModulePromise = TextEmbeddingsModule.fromModelName(ALL_MINILM_L6_V2)
      .then((loadedModule) => {
        embeddingModule = loadedModule;
        return loadedModule;
      })
      .catch((error: unknown) => {
        embeddingModulePromise = null;
        throw error;
      });
  }

  return embeddingModulePromise;
}

export async function prewarmEmbeddingModel(): Promise<boolean> {
  if (!prewarmPromise) {
    prewarmPromise = ensureEmbeddingModelReady()
      .then((loadedModule) => loadedModule !== null)
      .catch(() => false);
  }

  return prewarmPromise;
}

export async function embedText(text: string): Promise<Float32Array | null> {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return new Float32Array(EMBEDDING_DIMENSION);
  }

  const loadedModule = await ensureEmbeddingModelReady();
  if (!loadedModule) {
    return null;
  }

  return loadedModule.forward(normalizedText);
}
