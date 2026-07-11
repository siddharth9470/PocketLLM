import type { RNLlamaOAICompatibleMessage } from "llama.rn";

import { CONTINUE_USER_PROMPT, DEFAULT_SYSTEM_PROMPT } from "@/constants/chat";
import type { ChatMessage } from "@/types/chat";
import { stripReasoningTags } from "@/utils/reasoningFilter";

const MAX_CONTEXT_MESSAGES = 20;

/**
 * Converts persisted chat history into llama.rn OAI-compatible messages for completion.
 * Includes a system prompt, filters incomplete/error rows, and caps history to the most recent turns.
 */
export function buildChatContextFromHistory(
  messages: ChatMessage[],
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
): RNLlamaOAICompatibleMessage[] {
  const context: RNLlamaOAICompatibleMessage[] = [{ role: "system", content: systemPrompt }];

  const eligibleMessages = messages.filter((message) => {
    if (message.role !== "user" && message.role !== "assistant") {
      return false;
    }

    if (message.status === "streaming" || message.status === "pending") {
      return false;
    }

    if (message.status === "error" && message.content.trim().length === 0) {
      return false;
    }

    return true;
  });

  const recentMessages = eligibleMessages.slice(-MAX_CONTEXT_MESSAGES);

  for (const message of recentMessages) {
    const content = message.role === "assistant" ? stripReasoningTags(message.content) : message.content;

    if (message.role === "assistant" && content.length === 0) {
      continue;
    }

    context.push({
      role: message.role,
      content,
    });
  }

  return context;
}

/**
 * Builds the message list for "Continue" generation: prior history, the partial assistant reply,
 * and a synthetic user prompt asking the model to finish without repeating earlier text.
 */
export function buildContinuationContext(
  messages: ChatMessage[],
  assistantMessageId: string,
  partialAssistantContent: string,
): RNLlamaOAICompatibleMessage[] {
  const assistantIndex = messages.findIndex((message) => message.id === assistantMessageId);
  const priorMessages = assistantIndex >= 0 ? messages.slice(0, assistantIndex) : messages;

  const baseContext = buildChatContextFromHistory(priorMessages);
  const cleanedPartial = stripReasoningTags(partialAssistantContent);

  return [
    ...baseContext,
    { role: "assistant", content: cleanedPartial },
    { role: "user", content: CONTINUE_USER_PROMPT },
  ];
}
