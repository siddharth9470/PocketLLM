import { CONVERSATION_PREVIEW_MAX_LENGTH } from "../constants/chat";

export function buildConversationPreview(text: string): string {
  const trimmed = text.trim();

  if (trimmed.length <= CONVERSATION_PREVIEW_MAX_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, CONVERSATION_PREVIEW_MAX_LENGTH)}...`;
}
