import * as FileSystem from "expo-file-system/legacy";
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ChatScreenLabels } from "@/constants/chat";
import {
  conversationExists,
  createConversation,
  createMessage,
  deleteConversation,
  getAttachmentStoragePathsByConversationId,
  getConversationById,
  getConversations,
  updateConversation,
} from "@/db/ChatDB";
import { chatCompletion, initializeModel, resolveDownloadedModelPath } from "@/services/chatHelper";
import { ragDebug } from "@/services/rag/ragDebug";
import { buildRagContextForQuery, queueMessageEmbedding } from "@/services/rag/ragRetrieval";
import type { ChatMessage, Conversation } from "@/types/chat";
import { deriveConversationTitle, generateChatId } from "@/utils/chatIds";
import { buildConversationPreview } from "@/utils/conversationPreview";

interface SendMessageOptions {
  modelId: string;
  onSendError?: (message: string) => void;
}

interface ChatStore {
  conversations: Conversation[];
  isLoadingConversations: boolean;
  conversationDetails: Record<string, Conversation>;
  isSending: boolean;
  refreshConversations: () => Promise<void>;
  loadConversation: (conversationId: string) => Promise<Conversation | null>;
  getConversation: (conversationId: string) => Conversation | undefined;
  createConversationId: () => string;
  setActiveConversationId: (conversationId: string | null) => void;
  setConversationModel: (conversationId: string, modelId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string, options: SendMessageOptions) => Promise<void>;
}

const ChatStoreContext = createContext<ChatStore | undefined>(undefined);

function buildUserMessage(conversationId: string, content: string): ChatMessage {
  return {
    id: generateChatId(),
    conversationId,
    role: "user",
    content,
    status: "completed",
    createdAt: new Date().toISOString(),
  };
}

function buildAssistantMessage(conversationId: string, content: string, id?: string): ChatMessage {
  return {
    id: id ?? generateChatId(),
    conversationId,
    role: "assistant",
    content,
    status: "completed",
    createdAt: new Date().toISOString(),
  };
}

function buildStreamingAssistantMessage(conversationId: string, id: string): ChatMessage {
  return {
    id,
    conversationId,
    role: "assistant",
    content: "",
    status: "streaming",
    createdAt: new Date().toISOString(),
  };
}

function replaceAssistantMessage(
  messages: ChatMessage[],
  assistantMessageId: string,
  nextMessage: ChatMessage,
): ChatMessage[] {
  const hasAssistantMessage = messages.some((message) => message.id === assistantMessageId);

  if (hasAssistantMessage) {
    return messages.map((message) => (message.id === assistantMessageId ? nextMessage : message));
  }

  return [...messages, nextMessage];
}

function updateStreamingAssistantContent(
  conversationDetails: Record<string, Conversation>,
  conversationId: string,
  assistantMessageId: string,
  content: string,
): Record<string, Conversation> {
  const current = conversationDetails[conversationId];
  if (!current) {
    return conversationDetails;
  }

  const messages = current.messages ?? [];

  return {
    ...conversationDetails,
    [conversationId]: {
      ...current,
      messages: messages.map((message) =>
        message.id === assistantMessageId ? { ...message, content, status: "streaming" } : message,
      ),
    },
  };
}

function removeAssistantMessageFromConversation(
  conversationDetails: Record<string, Conversation>,
  conversationId: string,
  assistantMessageId: string,
): Record<string, Conversation> {
  const current = conversationDetails[conversationId];
  if (!current) {
    return conversationDetails;
  }

  return {
    ...conversationDetails,
    [conversationId]: {
      ...current,
      messages: (current.messages ?? []).filter((message) => message.id !== assistantMessageId),
    },
  };
}

function buildNewChatPlaceholder(conversationId: string): Conversation {
  const now = new Date().toISOString();
  return {
    id: conversationId,
    title: ChatScreenLabels.NEW_CHAT_TITLE,
    preview: "",
    modelId: "",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

async function deleteStoredAttachmentFiles(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(async (storagePath) => {
      try {
        const uri = storagePath.startsWith("file://") ? storagePath : `file://${storagePath}`;
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch (error) {
        console.warn(`Failed to delete attachment at ${storagePath}:`, error);
      }
    }),
  );
}

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationDetails, setConversationDetails] = useState<Record<string, Conversation>>({});
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const focusedConversationIdRef = useRef<string | null>(null);
  const conversationDetailsRef = useRef<Record<string, Conversation>>({});
  conversationDetailsRef.current = conversationDetails;

  const isConversationFocused = useCallback((conversationId: string): boolean => {
    return focusedConversationIdRef.current === conversationId;
  }, []);

  const setActiveConversationId = useCallback((conversationId: string | null) => {
    focusedConversationIdRef.current = conversationId;
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const rows = await getConversations();
      setConversations(rows);
    } catch (error) {
      console.error("Failed to refresh conversations:", error);
    }
  }, []);

  const syncConversationCache = useCallback(
    async (conversationId: string, force = false): Promise<Conversation | null> => {
      const refreshed = await getConversationById(conversationId);

      if (refreshed && (force || isConversationFocused(conversationId))) {
        setConversationDetails((prev) => ({ ...prev, [conversationId]: refreshed }));
      }

      return refreshed;
    },
    [isConversationFocused],
  );

  const seedConversationPlaceholder = useCallback((conversationId: string) => {
    setConversationDetails((prev) => {
      if (prev[conversationId]) {
        return prev;
      }

      return {
        ...prev,
        [conversationId]: buildNewChatPlaceholder(conversationId),
      };
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        await refreshConversations();
      } catch (error) {
        console.error("Failed to load conversations:", error);
      } finally {
        setIsLoadingConversations(false);
      }
    };

    void load();
  }, [refreshConversations]);

  const loadConversation = useCallback(
    async (conversationId: string): Promise<Conversation | null> => {
      const exists = await conversationExists(conversationId);

      if (!exists) {
        seedConversationPlaceholder(conversationId);
        return null;
      }

      return syncConversationCache(conversationId, true);
    },
    [seedConversationPlaceholder, syncConversationCache],
  );

  const getConversation = useCallback(
    (conversationId: string) => conversationDetails[conversationId],
    [conversationDetails],
  );

  const setConversationModel = useCallback(
    async (conversationId: string, modelId: string) => {
      const exists = await conversationExists(conversationId);
      const now = new Date().toISOString();

      if (exists) {
        await updateConversation(conversationId, {
          modelId,
          updatedAt: now,
        });
        await refreshConversations();
      }

      if (!isConversationFocused(conversationId)) {
        return;
      }

      setConversationDetails((prev) => {
        const current = prev[conversationId];

        if (!current) {
          return {
            ...prev,
            [conversationId]: {
              ...buildNewChatPlaceholder(conversationId),
              modelId,
              updatedAt: now,
            },
          };
        }

        return {
          ...prev,
          [conversationId]: {
            ...current,
            modelId,
            updatedAt: now,
          },
        };
      });
    },
    [isConversationFocused, refreshConversations],
  );

  const sendMessage = useCallback(
    async (conversationId: string, content: string, options: SendMessageOptions) => {
      const messageText = content.trim();

      if (!messageText) {
        return;
      }

      const now = new Date().toISOString();
      const userMessage = buildUserMessage(conversationId, messageText);

      const assistantMessageId = generateChatId();
      const streamingAssistantMessage = buildStreamingAssistantMessage(conversationId, assistantMessageId);

      setIsSending(true);

      if (isConversationFocused(conversationId)) {
        setConversationDetails((prev) => {
          const current = prev[conversationId] ?? buildNewChatPlaceholder(conversationId);

          return {
            ...prev,
            [conversationId]: {
              ...current,
              modelId: options.modelId,
              preview: messageText,
              updatedAt: now,
              messages: [...(current.messages ?? []), userMessage, streamingAssistantMessage],
            },
          };
        });
      }

      try {
        const exists = await conversationExists(conversationId);

        if (!exists) {
          const title = deriveConversationTitle(messageText);
          await createConversation({
            id: conversationId,
            title,
            preview: messageText,
            modelId: options.modelId,
            createdAt: now,
            updatedAt: now,
            messages: [],
          });
        } else {
          await updateConversation(conversationId, {
            modelId: options.modelId,
            updatedAt: now,
          });
        }

        await createMessage(userMessage);
        await updateConversation(conversationId, { preview: messageText, updatedAt: now });
        ragDebug("User message captured for RAG ingestion", {
          messageId: userMessage.id,
          role: userMessage.role,
          conversationId,
          contentLength: userMessage.content.length,
        });
        queueMessageEmbedding(userMessage.id, conversationId, userMessage.role, userMessage.content);
      } catch (error) {
        console.error("Failed to persist user message:", error);
        options.onSendError?.(ChatScreenLabels.INFERENCE_FAILED);
        setIsSending(false);
        return;
      }

      const removeStreamingAssistantFromUi = (): void => {
        if (!isConversationFocused(conversationId)) {
          return;
        }

        setConversationDetails((prev) =>
          removeAssistantMessageFromConversation(prev, conversationId, assistantMessageId),
        );
      };

      try {
        const modelPath = await resolveDownloadedModelPath(options.modelId);
        if (!modelPath) {
          throw new Error(ChatScreenLabels.MODEL_UNAVAILABLE);
        }

        await initializeModel(modelPath);
      } catch (error) {
        console.error("Failed to load model for inference:", error);
        options.onSendError?.(error instanceof Error ? error.message : ChatScreenLabels.MODEL_INIT_FAILED);
        removeStreamingAssistantFromUi();
        setIsSending(false);
        return;
      }

      try {
        ragDebug("Triggering RAG context retrieval for user query", {
          conversationId,
          queryLength: messageText.length,
        });
        const ragContext = await buildRagContextForQuery(messageText);

        const completionResult = await chatCompletion(
          messageText,
          (accumulatedText) => {
            if (!isConversationFocused(conversationId)) {
              return;
            }

            setConversationDetails((prev) =>
              updateStreamingAssistantContent(prev, conversationId, assistantMessageId, accumulatedText),
            );
          },
          {
            ragContext,
            onSearching: () => {
              if (!isConversationFocused(conversationId)) {
                return;
              }

              setConversationDetails((prev) =>
                updateStreamingAssistantContent(
                  prev,
                  conversationId,
                  assistantMessageId,
                  ChatScreenLabels.SEARCHING_WEB,
                ),
              );
            },
          },
        );

        const assistantMessage: ChatMessage = {
          ...buildAssistantMessage(conversationId, completionResult.text, assistantMessageId),
          metrics: completionResult.metrics,
        };

        await createMessage(assistantMessage);
        ragDebug("Assistant response captured for RAG ingestion", {
          messageId: assistantMessage.id,
          role: assistantMessage.role,
          conversationId,
          contentLength: assistantMessage.content.length,
        });
        queueMessageEmbedding(assistantMessage.id, conversationId, assistantMessage.role, assistantMessage.content);

        const responseTimestamp = new Date().toISOString();
        await updateConversation(conversationId, {
          preview: buildConversationPreview(completionResult.text),
          updatedAt: responseTimestamp,
        });

        if (isConversationFocused(conversationId)) {
          setConversationDetails((prev) => {
            const current = prev[conversationId];
            if (!current) {
              return prev;
            }

            return {
              ...prev,
              [conversationId]: {
                ...current,
                preview: buildConversationPreview(completionResult.text),
                updatedAt: responseTimestamp,
                messages: replaceAssistantMessage(current.messages ?? [], assistantMessageId, assistantMessage),
              },
            };
          });
        }

        void refreshConversations();
      } catch (error) {
        console.error("Failed to generate assistant message:", error);
        options.onSendError?.(ChatScreenLabels.INFERENCE_FAILED);

        removeStreamingAssistantFromUi();
      } finally {
        setIsSending(false);
      }
    },
    [isConversationFocused, refreshConversations],
  );

  const deleteConversationById = useCallback(async (conversationId: string): Promise<void> => {
    const attachmentPaths = await getAttachmentStoragePathsByConversationId(conversationId);
    await deleteConversation(conversationId);

    if (attachmentPaths.length > 0) {
      await deleteStoredAttachmentFiles(attachmentPaths);
    }

    setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
    setConversationDetails((prev) => {
      if (!(conversationId in prev)) {
        return prev;
      }

      const { [conversationId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const value = useMemo<ChatStore>(
    () => ({
      conversations,
      isLoadingConversations,
      conversationDetails,
      isSending,
      refreshConversations,
      loadConversation,
      getConversation,
      createConversationId: generateChatId,
      setActiveConversationId,
      setConversationModel,
      deleteConversation: deleteConversationById,
      sendMessage,
    }),
    [
      conversations,
      isLoadingConversations,
      conversationDetails,
      isSending,
      refreshConversations,
      loadConversation,
      getConversation,
      setActiveConversationId,
      setConversationModel,
      deleteConversationById,
      sendMessage,
    ],
  );

  return createElement(ChatStoreContext.Provider, { value }, children);
}

export function useChatStore<T>(selector: (state: ChatStore) => T): T {
  const context = useContext(ChatStoreContext);
  if (!context) {
    throw new Error("useChatStore must be used within a ChatStoreProvider");
  }

  return selector(context);
}
