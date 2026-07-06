import type { IMessage, User } from "react-native-gifted-chat";

import type { ChatMessage } from "../types/chat";
import { stripReasoningTags } from "./reasoningFilter";

export const CHAT_USER: User = {
  _id: "user",
  name: "You",
};

export const CHAT_ASSISTANT: User = {
  _id: "assistant",
  name: "Assistant",
};

export function toGiftedChatMessages(messages: ChatMessage[]): IMessage[] {
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
            ? message.content
            : stripReasoningTags(message.content)
          : message.content;

      return {
        _id: message.id,
        text,
        createdAt: safeCreatedAt,
        user: message.role === "user" ? CHAT_USER : CHAT_ASSISTANT,
      };
    });
}
