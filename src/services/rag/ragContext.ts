import { RAG_CONTEXT_HEADER, RAG_CONTEXT_MAX_CHARS } from "@/constants/rag";
import { ragDebug } from "@/services/rag/ragDebug";
import type { ChatMessage } from "@/types/chat";

function formatMessageLine(message: ChatMessage): string {
  const speaker = message.role === "user" ? "User" : "Assistant";
  return `${speaker}: ${message.content.trim()}`;
}

/** Builds a compact RAG context block from retrieved chat messages. */
export function buildRagContextBlock(messages: ChatMessage[]): string {
  const usableMessages = messages.filter((message) => message.content.trim().length > 0);
  if (usableMessages.length === 0) {
    ragDebug("No usable messages for RAG context injection");
    return "";
  }

  ragDebug("Injecting retrieved messages into LLM prompt context", {
    candidateCount: usableMessages.length,
    maxContextChars: RAG_CONTEXT_MAX_CHARS,
  });

  const lines: string[] = [];
  let totalChars = RAG_CONTEXT_HEADER.length + 1;

  for (const message of usableMessages) {
    const line = formatMessageLine(message);
    const nextLength = totalChars + line.length + 1;
    if (nextLength > RAG_CONTEXT_MAX_CHARS) {
      ragDebug("RAG context truncated — max char limit reached", {
        messageId: message.id,
        role: message.role,
        includedSoFar: lines.length,
      });
      break;
    }

    ragDebug("Injecting historical message into RAG context", {
      messageId: message.id,
      role: message.role,
      contentLength: message.content.length,
      contentPreview: message.content.trim().slice(0, 120),
    });

    lines.push(line);
    totalChars = nextLength;
  }

  if (lines.length === 0) {
    ragDebug("RAG context block empty after char-budget filtering");
    return "";
  }

  const contextBlock = `${RAG_CONTEXT_HEADER}\n${lines.join("\n\n")}`;
  ragDebug("Final RAG context payload ready", {
    injectedMessageCount: lines.length,
    totalChars: contextBlock.length,
  });

  return contextBlock;
}
