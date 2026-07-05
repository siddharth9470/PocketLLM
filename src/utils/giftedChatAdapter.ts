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
  return [...messages].reverse().map((message) => ({
    _id: message.id,
    text: message.content,
    createdAt: new Date(message.createdAt),
    user: message.role === "user" ? CHAT_USER : CHAT_ASSISTANT,
  }));
}
