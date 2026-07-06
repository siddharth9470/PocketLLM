import type { IMessage, User } from "react-native-gifted-chat";

import type { ChatMessage } from "../types/chat";

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
    .filter((message) => message.role === "user" || message.role === "assistant")
    .reverse()
    .map((message) => {
      const createdAt = new Date(message.createdAt);
      const safeCreatedAt = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;

      return {
        _id: message.id,
        text: message.content,
        createdAt: safeCreatedAt,
        user: message.role === "user" ? CHAT_USER : CHAT_ASSISTANT,
      };
    });
}
