import { RAG_SIMILAR_MESSAGE_LIMIT } from "@/constants/rag";
import { ensureDatabaseReady } from "@/db";
import { getMessageEmbeddingCount, saveMessageEmbedding, searchSimilarMessages } from "@/db/ChatDB";
import { embedText, ensureEmbeddingModelReady } from "@/services/embeddings/embeddingService";
import { buildRagContextBlock } from "@/services/rag/ragContext";
import { ragDebug } from "@/services/rag/ragDebug";
import type { ChatMessage } from "@/types/chat";

function isEmbeddingServiceReady(): boolean {
  return typeof ensureEmbeddingModelReady === "function" && typeof embedText === "function";
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
    ragDebug("Skipping embedding queue — empty text", { messageId, conversationId, role });
    return;
  }

  ragDebug("Message queued for embedding ingestion", {
    messageId,
    conversationId,
    role,
    textLength: normalizedText.length,
  });

  void persistMessageEmbedding(messageId, conversationId, role, normalizedText).catch((error: unknown) => {
    ragDebug("Embedding ingestion failed", {
      messageId,
      conversationId,
      role,
      textLength: normalizedText.length,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`Failed to embed message ${messageId}:`, error);
  });
}

async function persistMessageEmbedding(
  messageId: string,
  conversationId: string,
  role: ChatMessage["role"],
  text: string,
): Promise<void> {
  ragDebug("Starting embedding write path", { messageId, conversationId, role, textLength: text.length });

  if (!isEmbeddingServiceReady()) {
    ragDebug("Embedding write path aborted — embedding service unavailable", { messageId });
    return;
  }

  await ensureDatabaseReady();

  const embeddingCount = await getMessageEmbeddingCount();
  ragDebug("message_embeddings table health check (write path)", { totalEmbeddingRows: embeddingCount });

  const loadedModule = await ensureEmbeddingModelReady();
  if (!loadedModule) {
    ragDebug("Embedding write path aborted — model not ready", { messageId });
    return;
  }

  const embedding = await embedText(text);
  if (!embedding) {
    ragDebug("Embedding write path aborted — no vector produced", { messageId });
    return;
  }

  ragDebug("Embedding vector generated for write path", {
    messageId,
    textLength: text.length,
    vectorLength: embedding.length,
    status: "success",
  });

  await saveMessageEmbedding(messageId, conversationId, role, embedding);
  ragDebug("Embedding write path completed", {
    messageId,
    conversationId,
    role,
    vectorLength: embedding.length,
  });
}

/** Embeds the current query, retrieves similar past turns, and returns a RAG context block. */
export async function buildRagContextForQuery(query: string): Promise<string> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    ragDebug("Skipping RAG retrieval — empty query");
    return "";
  }

  ragDebug("User query triggered RAG context retrieval", {
    queryLength: normalizedQuery.length,
  });

  try {
    if (!isEmbeddingServiceReady()) {
      ragDebug("RAG retrieval aborted — embedding service unavailable");
      return "";
    }

    await ensureDatabaseReady();

    const embeddingCount = await getMessageEmbeddingCount();
    ragDebug("message_embeddings table health check (read path)", { totalEmbeddingRows: embeddingCount });

    const loadedModule = await ensureEmbeddingModelReady();
    if (!loadedModule) {
      ragDebug("RAG retrieval aborted — model not ready");
      return "";
    }

    const queryEmbedding = await embedText(normalizedQuery);
    if (!queryEmbedding) {
      ragDebug("RAG retrieval aborted — query embedding generation failed");
      return "";
    }

    ragDebug("Query embedding ready for vector search", {
      queryLength: normalizedQuery.length,
      queryVectorLength: queryEmbedding.length,
      searchLimit: RAG_SIMILAR_MESSAGE_LIMIT,
      status: "success",
    });

    const similarMessages = await searchSimilarMessages(queryEmbedding, RAG_SIMILAR_MESSAGE_LIMIT);
    const ragContext = buildRagContextBlock(similarMessages);

    ragDebug("RAG context block assembled for LLM prompt", {
      retrievedMessageCount: similarMessages.length,
      contextLength: ragContext.length,
      hasContext: ragContext.length > 0,
    });

    return ragContext;
  } catch (error: unknown) {
    ragDebug("RAG retrieval failed", {
      queryLength: normalizedQuery.length,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error("Failed to build RAG context:", error);
    return "";
  }
}

/** Dev-only vec0 write/read verification — exercises op-sqlite without a chat model. */
export async function verifyEmbeddingPipelineOnDevice(): Promise<boolean> {
  const smokeMessageId = "__rag_smoke_test_message__";
  const smokeConversationId = "__rag_smoke_test_conversation__";
  const smokeText = "RAG pipeline smoke test";

  try {
    if (!isEmbeddingServiceReady()) {
      ragDebug("Embedding pipeline smoke test skipped — service unavailable");
      return false;
    }

    await ensureDatabaseReady();

    const loadedModule = await ensureEmbeddingModelReady();
    if (!loadedModule) {
      ragDebug("Embedding pipeline smoke test skipped — model not ready");
      return false;
    }

    const embedding = await embedText(smokeText);
    if (!embedding) {
      ragDebug("Embedding pipeline smoke test failed — no embedding vector");
      return false;
    }

    await saveMessageEmbedding(smokeMessageId, smokeConversationId, "user", embedding);

    await searchSimilarMessages(embedding, 1);

    ragDebug("Embedding pipeline smoke test completed", { status: "success" });

    return true;
  } catch (error: unknown) {
    ragDebug("Embedding pipeline smoke test failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
