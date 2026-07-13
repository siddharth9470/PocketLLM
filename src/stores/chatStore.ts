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

import { ChatScreenLabels, DUMMY_RESPONSE_DELAY_MS } from "@/constants/chat";
import {
  conversationExists,
  createConversation,
  createMessage,
  createMessageAttachments,
  deleteConversation,
  getAttachmentStoragePathsByConversationId,
  getConversationById,
  getConversations,
  updateConversation,
} from "@/db/ChatDB";
import type { PersistedAttachmentDraft } from "@/services/chatAttachments";
import { deleteAttachmentFiles } from "@/services/chatAttachments";
import type { ChatMessage, ChatMessageAttachment, Conversation } from "@/types/chat";
import { deriveConversationTitle, generateChatId } from "@/utils/chatIds";
import { buildConversationPreview } from "@/utils/conversationPreview";

interface SendMessageOptions {
  modelId: string;
  attachmentDrafts?: PersistedAttachmentDraft[];
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

function buildUserMessage(
  conversationId: string,
  content: string,
  attachments?: ChatMessageAttachment[],
): ChatMessage {
  return {
    id: generateChatId(),
    conversationId,
    role: "user",
    content,
    status: "completed",
    createdAt: new Date().toISOString(),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  };
}

/** Maps persisted attachment drafts into normalized rows for the message_attachments table. */
function buildAttachmentRows(
  messageId: string,
  conversationId: string,
  drafts: PersistedAttachmentDraft[],
): ChatMessageAttachment[] {
  const createdAt = new Date().toISOString();

  return drafts.map((draft, index) => ({
    id: generateChatId(),
    messageId,
    conversationId,
    kind: draft.kind,
    storagePath: draft.storagePath,
    mimeType: draft.mimeType,
    fileSizeBytes: draft.fileSizeBytes,
    sortOrder: index,
    createdAt,
    ...(draft.originalFileName ? { originalFileName: draft.originalFileName } : {}),
    ...(draft.width != null ? { width: draft.width } : {}),
    ...(draft.height != null ? { height: draft.height } : {}),
    ...(draft.durationMs != null ? { durationMs: draft.durationMs } : {}),
  }));
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
      const attachmentDrafts = options.attachmentDrafts ?? [];
      const trimmed = content.trim();
      const messageText =
        trimmed.length > 0
          ? trimmed
          : attachmentDrafts.length > 0
            ? ChatScreenLabels.AUDIO_DEFAULT_PROMPT
            : "";

      if (!messageText) {
        return;
      }

      const now = new Date().toISOString();
      const userMessage = buildUserMessage(conversationId, messageText);
      const attachmentRows = buildAttachmentRows(userMessage.id, conversationId, attachmentDrafts);
      if (attachmentRows.length > 0) {
        userMessage.attachments = attachmentRows;
      }

      const assistantMessageId = generateChatId();
      const assistantContent = ChatScreenLabels.DUMMY_ASSISTANT_RESPONSE;

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
              messages: [...(current.messages ?? []), userMessage],
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
        if (attachmentRows.length > 0) {
          await createMessageAttachments(attachmentRows);
        }

        await updateConversation(conversationId, { preview: messageText, updatedAt: now });
      } catch (error) {
        console.error("Failed to persist user message:", error);
        options.onSendError?.(ChatScreenLabels.INFERENCE_FAILED);
        setIsSending(false);
        return;
      }

      await delay(DUMMY_RESPONSE_DELAY_MS);

      const assistantMessage = buildAssistantMessage(conversationId, assistantContent, assistantMessageId);

      try {
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

            return {
              ...prev,
              [conversationId]: {
                ...current,
                preview: buildConversationPreview(assistantContent),
                updatedAt: responseTimestamp,
                messages: [...(current.messages ?? []), assistantMessage],
              },
            };
          });
        }

        void refreshConversations();
      } catch (error) {
        console.error("Failed to persist assistant message:", error);
        options.onSendError?.(ChatScreenLabels.INFERENCE_FAILED);
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
      await deleteAttachmentFiles(attachmentPaths);
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
