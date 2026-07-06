import * as Crypto from "expo-crypto";

export function generateChatId(): string {
  return Crypto.randomUUID();
}

export function deriveConversationTitle(prompt: string): string {
  const trimmed = prompt.trim();
  const maxLength = 48;

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}...`;
}
