import { create } from 'zustand';

import { MOCK_CONVERSATIONS } from '../data/mockChats';
import type { ChatMessage, Conversation } from '../types/chat';

interface ChatStore {
  conversations: Conversation[];
  getConversation: (id: string) => Conversation | undefined;
  setConversationModel: (conversationId: string, modelId: string) => void;
  sendMessage: (conversationId: string, content: string) => void;
}

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: MOCK_CONVERSATIONS,

  getConversation: (id) => get().conversations.find((conversation) => conversation.id === id),

  setConversationModel: (conversationId, modelId) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, modelId } : conversation,
      ),
    }));
  },

  sendMessage: (conversationId, content) => {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    const userMessage = createMessage('user', trimmed);
    const assistantMessage = createMessage(
      'assistant',
      'This is a mocked on-device reply. llama.rn integration will replace this stub.',
    );

    set((state) => ({
      conversations: state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        const messages = [...conversation.messages, userMessage, assistantMessage];
        return {
          ...conversation,
          messages,
          preview: trimmed,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  },
}));
