import { CONVERSATION_PREVIEW_MAX_LENGTH } from "../constants/chat";
import { stripReasoningTags } from "./reasoningFilter";

export function buildConversationPreview(text: string): string {
  const trimmed = stripReasoningTags(text);

  if (trimmed.length <= CONVERSATION_PREVIEW_MAX_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, CONVERSATION_PREVIEW_MAX_LENGTH)}...`;
}
