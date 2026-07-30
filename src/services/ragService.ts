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
import { appLogger } from "@/services/logger";
import type { ChatMessage } from "@/types/chat";

let isExecutorchInitialized = false;
let embeddingModule: TextEmbeddingsModule | null = null;
let embeddingModulePromise: Promise<TextEmbeddingsModule | null> | null = null;
let prewarmPromise: Promise<boolean> | null = null;

/**
 * Idempotently registers the Expo resource-fetcher adapter with ExecuTorch.
 * Must run before any model download / load; subsequent calls are no-ops.
 */
function initializeExecutorch(): void {
  if (isExecutorchInitialized) {
    return;
  }

  initExecutorch({ resourceFetcher: ExpoResourceFetcher });
  isExecutorchInitialized = true;
}

/**
 * Returns whether the native ExecuTorch runtime and `TextEmbeddingsModule` API
 * are present on this device. Used to degrade RAG gracefully when native
 * bindings are unavailable (e.g. unsupported ABI).
 */
function isEmbeddingRuntimeAvailable(): boolean {
  return isAvailable && typeof TextEmbeddingsModule?.fromModelName === "function";
}

/**
 * Lazily loads the MiniLM embedding model as a process-wide singleton.
 * Concurrent callers share one in-flight promise; failures clear that promise
 * so a later call can retry. Returns `null` when the native runtime is missing.
 */
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

/**
 * Converts text into a fixed-length float embedding vector.
 * Empty / whitespace-only input yields a zero vector of `EMBEDDING_DIMENSION`.
 * Returns `null` when the embedding model cannot be loaded.
 */
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

/**
 * Formats retrieved chat messages into a compact system-prompt context block.
 * Skips empty content, prefixes each turn with User/Assistant, and stops once
 * the assembled block would exceed `RAG_CONTEXT_MAX_CHARS`. Returns `""` when
 * nothing usable remains after filtering / truncation.
 */
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

/**
 * Boot-time helper that registers ExecuTorch and starts loading the embedding
 * model without blocking chat UI. Shares a single promise across callers and
 * resolves `true` only when the model instance is ready; load errors resolve
 * as `false` so the app can continue without RAG.
 */
export async function prewarmEmbeddingModel(): Promise<boolean> {
  initializeExecutorch();

  if (!prewarmPromise) {
    prewarmPromise = ensureEmbeddingModelReady()
      .then((loadedModule) => loadedModule !== null)
      .catch(() => false);
  }

  return prewarmPromise;
}

/**
 * Schedules background embedding + SQLite persistence for a saved chat message.
 * Intended to be called immediately after `createMessage` for user and assistant
 * turns. Returns immediately (fire-and-forget); empty text is ignored, and
 * failures are logged without interrupting the send flow.
 */
export function queueMessageEmbedding(
  messageId: string,
  conversationId: string,
  role: ChatMessage["role"],
  text: string,
  traceId?: string,
): void {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return;
  }

  const rag = traceId ? appLogger.forTrace("RAG", traceId) : appLogger.domain("RAG");
  rag.info("embed.queued", { messageId, conversationId, role, textLen: normalizedText.length });

  void (async () => {
    await ensureDatabaseReady();
    const loadedModule = await ensureEmbeddingModelReady();
    if (!loadedModule) {
      rag.warn("embed.skipped_model_unavailable", { messageId });
      return;
    }

    const embedding = await embedText(normalizedText);
    if (!embedding) {
      rag.warn("embed.skipped_empty_vector", { messageId });
      return;
    }

    await saveMessageEmbedding(messageId, conversationId, role, embedding);
    rag.info("embed.stored", { messageId, vectorLen: embedding.length });
  })().catch((error: unknown) => {
    rag.error("embed.failed", error, { messageId });
  });
}

/**
 * On-demand retrieval for the `search_local_history` tool.
 *
 * Embeds the tool-provided `query`, runs a sqlite-vec KNN search for similar
 * past messages, and returns a trimmed context block for Pass 2 injection via
 * `CHAT_ANSWER_WITH_RAG_PROMPT`. Returns `""` on blank input, missing model, or
 * any retrieval failure so the grounded answer pass can still run.
 *
 * Must not be called automatically on every user send — only when the LLM
 * explicitly requests local history via tool calling.
 */
export async function buildRagContextForQuery(query: string, traceId?: string): Promise<string> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return "";
  }

  const rag = traceId ? appLogger.forTrace("RAG", traceId) : appLogger.domain("RAG");

  try {
    await ensureDatabaseReady();

    const loadedModule = await ensureEmbeddingModelReady();
    if (!loadedModule) {
      rag.warn("retrieve.skipped_model_unavailable");
      return "";
    }

    const queryEmbedding = await embedText(normalizedQuery);
    if (!queryEmbedding) {
      rag.warn("retrieve.skipped_empty_query_vector");
      return "";
    }

    const similarMessages = await searchSimilarMessages(queryEmbedding, RAG_SIMILAR_MESSAGE_LIMIT);
    const context = buildRagContextBlock(similarMessages);
    rag.info("retrieve.assembled", {
      matchCount: similarMessages.length,
      contextLen: context.length,
      hasContext: context.length > 0,
      query: normalizedQuery,
    });
    return context;
  } catch (error: unknown) {
    rag.error("retrieve.failed", error, { queryLen: normalizedQuery.length });
    return "";
  }
}

/**
 * `__DEV__`-oriented smoke test that exercises write + KNN read against
 * `message_embeddings` without requiring a downloaded chat GGUF. Writes a
 * disposable smoke row, runs similarity search, and returns whether both
 * steps completed without throwing.
 */
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
    appLogger.domain("RAG").error("smoke_test.failed", error);
    return false;
  }
}
