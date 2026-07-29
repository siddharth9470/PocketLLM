import type { IMessage, User } from "react-native-gifted-chat";
import { stripToolCallTags } from "@/services/inference/toolCallParsing";
import type { ChatMessage } from "@/types/chat";
import { stripReasoningTags, stripReasoningTagsForStreaming } from "@/utils/reasoningFilter";

export const CHAT_USER: User = {
  _id: "user",
  name: "You",
};

export const CHAT_ASSISTANT: User = {
  _id: "assistant",
  name: "Assistant",
};

export interface PocketChatMessage extends IMessage {
  truncated?: boolean;
}

export function toGiftedChatMessages(messages: ChatMessage[]): PocketChatMessage[] {
  return [...messages]
    .filter((message) => {
      if (message.role !== "user" && message.role !== "assistant") {
        return false;
      }

      if (message.status === "streaming" && message.content.trim().length === 0) {
        return false;
      }

      return true;
    })
    .reverse()
    .map((message) => {
      const createdAt = new Date(message.createdAt);
      const safeCreatedAt = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;

      const text =
        message.role === "assistant"
          ? message.status === "streaming"
            ? stripToolCallTags(stripReasoningTagsForStreaming(message.content))
            : stripToolCallTags(stripReasoningTags(message.content))
          : message.content;

      return {
        _id: message.id,
        text,
        createdAt: safeCreatedAt,
        user: message.role === "user" ? CHAT_USER : CHAT_ASSISTANT,
        truncated: message.truncated === true,
      };
    });
}

export function findChatMessageByGiftedId(
  messages: ChatMessage[] | undefined,
  giftedMessageId: string | number,
): ChatMessage | undefined {
  return messages?.find((message) => message.id === String(giftedMessageId));
}
