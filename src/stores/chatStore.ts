import { createContext, createElement, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';

import { MOCK_CONVERSATIONS } from '../data/mockChats';
import type { ChatMessage, Conversation } from '../types/chat';

interface ChatStore {
  conversations: Conversation[];
  getConversation: (id: string) => Conversation | undefined;
  setConversationModel: (conversationId: string, modelId: string) => void;
  sendMessage: (conversationId: string, content: string) => void;
}

interface ChatStoreState {
  conversations: Conversation[];
}

type ChatAction =
  | { type: 'setConversationModel'; conversationId: string; modelId: string }
  | { type: 'sendMessage'; conversationId: string; content: string };

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function chatReducer(state: ChatStoreState, action: ChatAction): ChatStoreState {
  switch (action.type) {
    case 'setConversationModel':
      return {
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.conversationId
            ? { ...conversation, modelId: action.modelId }
            : conversation,
        ),
      };
    case 'sendMessage': {
      const trimmed = action.content.trim();
      if (!trimmed) {
        return state;
      }

      const userMessage = createMessage('user', trimmed);
      const assistantMessage = createMessage(
        'assistant',
        'This is a mocked on-device reply. llama.rn integration will replace this stub.',
      );

      return {
        conversations: state.conversations.map((conversation) => {
          if (conversation.id !== action.conversationId) {
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
      };
    }
    default:
      return state;
  }
}

const ChatStoreContext = createContext<ChatStore | undefined>(undefined);

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, {
    conversations: MOCK_CONVERSATIONS,
  });

  const value = useMemo<ChatStore>(() => ({
    conversations: state.conversations,
    getConversation: (id) => state.conversations.find((conversation) => conversation.id === id),
    setConversationModel: (conversationId, modelId) =>
      dispatch({ type: 'setConversationModel', conversationId, modelId }),
    sendMessage: (conversationId, content) =>
      dispatch({ type: 'sendMessage', conversationId, content }),
  }), [state.conversations]);

  return createElement(ChatStoreContext.Provider, { value }, children);
}

export function useChatStore<T>(selector: (state: ChatStore) => T): T {
  const context = useContext(ChatStoreContext);
  if (!context) {
    throw new Error('useChatStore must be used within a ChatStoreProvider');
  }

  return selector(context);
}
