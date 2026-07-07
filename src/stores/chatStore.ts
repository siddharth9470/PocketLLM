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

import { ChatScreenLabels } from "../constants/chat";
import {
  conversationExists,
  createConversation,
  createMessage,
  deleteConversation,
  getConversationById,
  getConversations,
  getMessagesByConversationId,
  updateConversation,
  updateMessage,
} from "../db/ChatDB";
import {
  buildChatContextFromHistory,
  classifyInferenceError,
  resolveDownloadedModelPath,
  runContinueInference,
  runInference,
} from "../services/chatHelper";
import type { ChatMessage, Conversation } from "../types/chat";
import { deriveConversationTitle, generateChatId } from "../utils/chatIds";
import { buildConversationPreview } from "../utils/conversationPreview";
import { stripReasoningTags } from "../utils/reasoningFilter";

interface SendMessageOptions {
  modelId: string;
  onInferenceError?: (message: string) => void;
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
  continueAssistantMessage: (
    conversationId: string,
    messageId: string,
    options: SendMessageOptions,
  ) => Promise<void>;
  sendMessage: (conversationId: string, content: string, options: SendMessageOptions) => Promise<void>;
}

const STREAMING_UI_INTERVAL_MS = 48;

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

function buildAssistantMessage(
  conversationId: string,
  content: string,
  status: ChatMessage["status"],
  metrics?: ChatMessage["metrics"],
  error?: string,
  id?: string,
  truncated?: boolean,
): ChatMessage {
  return {
    id: id ?? generateChatId(),
    conversationId,
    role: "assistant",
    content,
    status,
    createdAt: new Date().toISOString(),
    ...(truncated ? { truncated: true } : {}),
    ...(metrics ? { metrics } : {}),
    ...(error ? { error } : {}),
  };
}

function mergeAssistantContinuation(baseText: string, continuationText: string): string {
  const base = stripReasoningTags(baseText).trimEnd();
  const extra = stripReasoningTags(continuationText).trim();

  if (!extra) {
    return base;
  }

  if (extra.startsWith(base)) {
    return extra;
  }

  return `${base}${base.length > 0 ? " " : ""}${extra}`.trim();
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

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationDetails, setConversationDetails] = useState<Record<string, Conversation>>({});
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const focusedConversationIdRef = useRef<string | null>(null);

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
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      const modelPath = await resolveDownloadedModelPath(options.modelId);
      if (!modelPath) {
        options.onInferenceError?.(ChatScreenLabels.MODEL_UNAVAILABLE);
        return;
      }

      setIsSending(true);

      try {
        const now = new Date().toISOString();
        const exists = await conversationExists(conversationId);

        if (!exists) {
          const title = deriveConversationTitle(trimmed);
          const newConversation: Conversation = {
            id: conversationId,
            title,
            preview: trimmed,
            modelId: options.modelId,
            createdAt: now,
            updatedAt: now,
            messages: [],
          };

          await createConversation(newConversation);
        } else {
          await updateConversation(conversationId, {
            modelId: options.modelId,
            updatedAt: now,
          });
        }

        const userMessage = buildUserMessage(conversationId, trimmed);
        await createMessage(userMessage);
        await updateConversation(conversationId, { preview: trimmed, updatedAt: now });

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
                modelId: options.modelId,
                preview: trimmed,
                updatedAt: now,
                messages: [...(current.messages ?? []), userMessage],
              },
            };
          });
        }

        const history = await getMessagesByConversationId(conversationId);
        const contextMessages = buildChatContextFromHistory(history);

        const assistantMessageId = generateChatId();
        const assistantCreatedAt = new Date().toISOString();

        const appendStreamingPlaceholder = (content: string): void => {
          if (!isConversationFocused(conversationId)) {
            return;
          }

          setConversationDetails((prev) => {
            const current = prev[conversationId];
            if (!current) {
              return prev;
            }

            const messages = current.messages ?? [];
            const existingIndex = messages.findIndex((message) => message.id === assistantMessageId);

            if (existingIndex === -1) {
              const streamingMessage: ChatMessage = {
                id: assistantMessageId,
                conversationId,
                role: "assistant",
                content,
                status: "streaming",
                createdAt: assistantCreatedAt,
              };

              return {
                ...prev,
                [conversationId]: {
                  ...current,
                  messages: [...messages, streamingMessage],
                },
              };
            }

            const updatedMessages = [...messages];
            updatedMessages[existingIndex] = {
              ...updatedMessages[existingIndex],
              content,
              status: "streaming",
            };

            return {
              ...prev,
              [conversationId]: {
                ...current,
                messages: updatedMessages,
              },
            };
          });
        };

        let lastStreamUiFlushAt = 0;

        const onToken = (displayText: string): void => {
          const now = Date.now();
          if (now - lastStreamUiFlushAt < STREAMING_UI_INTERVAL_MS) {
            return;
          }

          lastStreamUiFlushAt = now;
          appendStreamingPlaceholder(displayText);
        };

        let assistantContent: string = ChatScreenLabels.INFERENCE_FAILED;
        let assistantStatus: ChatMessage["status"] = "completed";
        let assistantError: string | undefined;
        let assistantMetrics: ChatMessage["metrics"] | undefined;
        let assistantTruncated = false;

        try {
          const completion = await runInference(modelPath, contextMessages, onToken);
          assistantContent = completion.text.trim() || ChatScreenLabels.INFERENCE_FAILED;
          assistantMetrics = completion.metrics;
          assistantTruncated = completion.truncated === true;
          appendStreamingPlaceholder(assistantContent);
        } catch (error) {
          const classified = classifyInferenceError(error);
          assistantStatus = "error";
          assistantError = classified.logMessage;
          assistantContent = classified.userMessage;
          console.error("Assistant inference failed:", error);
          options.onInferenceError?.(classified.userMessage);
        }

        const assistantMessage = buildAssistantMessage(
          conversationId,
          assistantContent,
          assistantStatus,
          assistantMetrics,
          assistantError,
          assistantMessageId,
          assistantTruncated,
        );

        await createMessage(assistantMessage);

        const responseTimestamp = new Date().toISOString();
        await updateConversation(conversationId, {
          preview: buildConversationPreview(assistantContent),
          updatedAt: responseTimestamp,
        });

        if (isConversationFocused(conversationId)) {
          setConversationDetails((prev) => {
            const current = prev[conversationId];
            if (!current) {
              return prev;
            }

            const messages = current.messages ?? [];
            const existingIndex = messages.findIndex((message) => message.id === assistantMessageId);

            if (existingIndex === -1) {
              return {
                ...prev,
                [conversationId]: {
                  ...current,
                  preview: buildConversationPreview(assistantContent),
                  updatedAt: responseTimestamp,
                  messages: [...messages, assistantMessage],
                },
              };
            }

            const updatedMessages = [...messages];
            updatedMessages[existingIndex] = assistantMessage;

            return {
              ...prev,
              [conversationId]: {
                ...current,
                preview: buildConversationPreview(assistantContent),
                updatedAt: responseTimestamp,
                messages: updatedMessages,
              },
            };
          });
        }

        await refreshConversations();
      } catch (error) {
        console.error("Failed to send message:", error);
        options.onInferenceError?.(ChatScreenLabels.INFERENCE_FAILED);
      } finally {
        setIsSending(false);
      }
    },
    [isConversationFocused, refreshConversations],
  );

  const continueAssistantMessage = useCallback(
    async (conversationId: string, messageId: string, options: SendMessageOptions) => {
      const modelPath = await resolveDownloadedModelPath(options.modelId);
      if (!modelPath) {
        options.onInferenceError?.(ChatScreenLabels.MODEL_UNAVAILABLE);
        return;
      }

      setIsSending(true);

      try {
        const history = await getMessagesByConversationId(conversationId);
        const existingMessage = history.find((message) => message.id === messageId);

        if (!existingMessage || existingMessage.role !== "assistant") {
          options.onInferenceError?.(ChatScreenLabels.CONTINUE_RESPONSE_FAILED);
          return;
        }

        const appendStreamingUpdate = (content: string, status: ChatMessage["status"] = "streaming"): void => {
          if (!isConversationFocused(conversationId)) {
            return;
          }

          setConversationDetails((prev) => {
            const current = prev[conversationId];
            if (!current) {
              return prev;
            }

            const messages = current.messages ?? [];
            const existingIndex = messages.findIndex((message) => message.id === messageId);
            if (existingIndex === -1) {
              return prev;
            }

            const updatedMessages = [...messages];
            updatedMessages[existingIndex] = {
              ...updatedMessages[existingIndex],
              content,
              status,
              truncated: status === "streaming" ? true : updatedMessages[existingIndex].truncated,
            };

            return {
              ...prev,
              [conversationId]: {
                ...current,
                messages: updatedMessages,
              },
            };
          });
        };

        let lastStreamUiFlushAt = 0;
        const onToken = (displayText: string): void => {
          const now = Date.now();
          if (now - lastStreamUiFlushAt < STREAMING_UI_INTERVAL_MS) {
            return;
          }

          lastStreamUiFlushAt = now;
          appendStreamingUpdate(mergeAssistantContinuation(existingMessage.content, displayText));
        };

        appendStreamingUpdate(existingMessage.content, "streaming");

        let mergedContent = existingMessage.content;
        let mergedMetrics = existingMessage.metrics;
        let stillTruncated = false;

        try {
          const completion = await runContinueInference(
            modelPath,
            history,
            messageId,
            existingMessage.content,
            onToken,
          );

          mergedContent = mergeAssistantContinuation(existingMessage.content, completion.text);
          mergedMetrics = completion.metrics ?? mergedMetrics;
          stillTruncated = completion.truncated === true;
        } catch (error) {
          const classified = classifyInferenceError(error);
          console.error("Assistant continuation failed:", error);
          options.onInferenceError?.(classified.userMessage);
          return;
        }

        const updatedMessage: ChatMessage = {
          ...existingMessage,
          content: mergedContent,
          status: "completed",
          truncated: stillTruncated,
          metrics: mergedMetrics,
        };

        await updateMessage(messageId, {
          content: mergedContent,
          status: "completed",
          truncated: stillTruncated,
          metrics: mergedMetrics,
        });

        const responseTimestamp = new Date().toISOString();
        await updateConversation(conversationId, {
          preview: buildConversationPreview(mergedContent),
          updatedAt: responseTimestamp,
        });

        if (isConversationFocused(conversationId)) {
          setConversationDetails((prev) => {
            const current = prev[conversationId];
            if (!current) {
              return prev;
            }

            const messages = current.messages ?? [];
            const existingIndex = messages.findIndex((message) => message.id === messageId);
            if (existingIndex === -1) {
              return prev;
            }

            const updatedMessages = [...messages];
            updatedMessages[existingIndex] = updatedMessage;

            return {
              ...prev,
              [conversationId]: {
                ...current,
                preview: buildConversationPreview(mergedContent),
                updatedAt: responseTimestamp,
                messages: updatedMessages,
              },
            };
          });
        }

        await refreshConversations();
      } catch (error) {
        console.error("Failed to continue assistant message:", error);
        options.onInferenceError?.(ChatScreenLabels.CONTINUE_RESPONSE_FAILED);
      } finally {
        setIsSending(false);
      }
    },
    [isConversationFocused, refreshConversations],
  );

  const deleteConversationById = useCallback(async (conversationId: string): Promise<void> => {
    await deleteConversation(conversationId);

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
      continueAssistantMessage,
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
      continueAssistantMessage,
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
