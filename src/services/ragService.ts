import { ALL_MINILM_L6_V2, initExecutorch, isAvailable, TextEmbeddingsModule } from "react-native-executorch";
import { ExpoResourceFetcher } from "react-native-executorch-expo-resource-fetcher";

import {
  EMBEDDING_DIMENSION,
  RAG_CONTEXT_HEADER,
  RAG_CONTEXT_MAX_CHARS,
  RAG_SIMILAR_MESSAGE_LIMIT,
} from "@/constants/rag";
import { ensureDatabaseReady } from "@/db";
import { saveMessageEmbedding, searchSimilarMessages } from "@/db/ChatDB";
import type { ChatMessage } from "@/types/chat";

let isExecutorchInitialized = false;
let embeddingModule: TextEmbeddingsModule | null = null;
let embeddingModulePromise: Promise<TextEmbeddingsModule | null> | null = null;
let prewarmPromise: Promise<boolean> | null = null;

function initializeExecutorch(): void {
  if (isExecutorchInitialized) {
    return;
  }

  initExecutorch({ resourceFetcher: ExpoResourceFetcher });
  isExecutorchInitialized = true;
}

function isEmbeddingRuntimeAvailable(): boolean {
  return isAvailable && typeof TextEmbeddingsModule?.fromModelName === "function";
}

async function ensureEmbeddingModelReady(): Promise<TextEmbeddingsModule | null> {
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

async function embedText(text: string): Promise<Float32Array | null> {
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

function buildRagContextBlock(messages: ChatMessage[]): string {
  const usableMessages = messages.filter((message) => message.content.trim().length > 0);
  if (usableMessages.length === 0) {
    return "";
  }

  const lines: string[] = [];
  let totalChars = RAG_CONTEXT_HEADER.length + 1;

  for (const message of usableMessages) {
    const speaker = message.role === "user" ? "User" : "Assistant";
    const line = `${speaker}: ${message.content.trim()}`;
    const nextLength = totalChars + line.length + 1;
    if (nextLength > RAG_CONTEXT_MAX_CHARS) {
      break;
    }

    lines.push(line);
    totalChars = nextLength;
  }

  if (lines.length === 0) {
    return "";
  }

  return `${RAG_CONTEXT_HEADER}\n${lines.join("\n\n")}`;
}

/** Registers ExecuTorch and lazily loads the embedding model at app boot. */
export async function prewarmEmbeddingModel(): Promise<boolean> {
  initializeExecutorch();

  if (!prewarmPromise) {
    prewarmPromise = ensureEmbeddingModelReady()
      .then((loadedModule) => loadedModule !== null)
      .catch(() => false);
  }

  return prewarmPromise;
}

/** Fire-and-forget embedding persistence for a saved chat message. */
export function queueMessageEmbedding(
  messageId: string,
  conversationId: string,
  role: ChatMessage["role"],
  text: string,
): void {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return;
  }

  void (async () => {
    await ensureDatabaseReady();
    const loadedModule = await ensureEmbeddingModelReady();
    if (!loadedModule) {
      return;
    }

    const embedding = await embedText(normalizedText);
    if (!embedding) {
      return;
    }

    await saveMessageEmbedding(messageId, conversationId, role, embedding);
  })().catch((error: unknown) => {
    console.error(`Failed to embed message ${messageId}:`, error);
  });
}

/** Embeds the query, retrieves similar past turns, and returns a RAG context block. */
export async function buildRagContextForQuery(query: string): Promise<string> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return "";
  }

  try {
    await ensureDatabaseReady();

    const loadedModule = await ensureEmbeddingModelReady();
    if (!loadedModule) {
      return "";
    }

    const queryEmbedding = await embedText(normalizedQuery);
    if (!queryEmbedding) {
      return "";
    }

    const similarMessages = await searchSimilarMessages(queryEmbedding, RAG_SIMILAR_MESSAGE_LIMIT);
    return buildRagContextBlock(similarMessages);
  } catch (error: unknown) {
    console.error("Failed to build RAG context:", error);
    return "";
  }
}

/** Dev-only vec0 write/read verification — exercises op-sqlite without a chat model. */
export async function verifyEmbeddingPipelineOnDevice(): Promise<boolean> {
  try {
    await ensureDatabaseReady();

    const loadedModule = await ensureEmbeddingModelReady();
    if (!loadedModule) {
      return false;
    }

    const embedding = await embedText("RAG pipeline smoke test");
    if (!embedding) {
      return false;
    }

    await saveMessageEmbedding("__rag_smoke_test_message__", "__rag_smoke_test_conversation__", "user", embedding);
    await searchSimilarMessages(embedding, 1);
    return true;
  } catch (error: unknown) {
    console.error("Embedding pipeline smoke test failed:", error);
    return false;
  }
}
