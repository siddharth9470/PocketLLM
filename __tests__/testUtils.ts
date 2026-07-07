import type { UseQueryResult } from "@tanstack/react-query";

import { ChatScreenLabels } from "@/constants/chat";
import type { Conversation } from "@/types/chat";
import type { HuggingFaceModel } from "@/types/models";

type HuggingFaceModelsQuery = UseQueryResult<HuggingFaceModel[], Error>;

export const MOCK_NEW_CONVERSATION_ID = "conv-new-1";

export type MockChatStore = {
  conversations: Conversation[];
  isLoadingConversations: boolean;
  conversationDetails: Record<string, Conversation>;
  isSending: boolean;
  refreshConversations: jest.Mock;
  loadConversation: jest.Mock;
  getConversation: jest.Mock;
  sendMessage: jest.Mock;
  continueAssistantMessage: jest.Mock;
  setConversationModel: jest.Mock;
  setActiveConversationId: jest.Mock;
  createConversationId: jest.Mock;
  deleteConversation: jest.Mock;
};

export function mockChatStore(overrides: Partial<MockChatStore> = {}): MockChatStore {
  const { useChatStore } = require("@/stores/chatStore") as typeof import("@/stores/chatStore");

  const state: MockChatStore = {
    conversations: [],
    isLoadingConversations: false,
    conversationDetails: {},
    isSending: false,
    refreshConversations: jest.fn().mockResolvedValue(undefined),
    loadConversation: jest.fn().mockResolvedValue(null),
    getConversation: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    continueAssistantMessage: jest.fn().mockResolvedValue(undefined),
    setConversationModel: jest.fn().mockResolvedValue(undefined),
    setActiveConversationId: jest.fn(),
    createConversationId: jest.fn(() => MOCK_NEW_CONVERSATION_ID),
    deleteConversation: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  if (overrides.getConversation === undefined) {
    state.getConversation.mockImplementation((conversationId: string) => state.conversationDetails[conversationId]);
  }

  jest.mocked(useChatStore).mockImplementation((selector) => selector(state));
  return state;
}

export function restoreRealChatStore(): void {
  const { useChatStore } = require("@/stores/chatStore") as typeof import("@/stores/chatStore");
  const actual = jest.requireActual("@/stores/chatStore") as typeof import("@/stores/chatStore");
  jest.mocked(useChatStore).mockImplementation(actual.useChatStore);
}

export function buildMockConversations(model: HuggingFaceModel = buildCompletedModel()): Conversation[] {
  return [
    {
      id: "conv-history-1",
      title: "Gemma chat",
      preview: "Hello there",
      modelId: model.id,
      createdAt: "2024-06-01T10:00:00.000Z",
      updatedAt: "2024-06-01T11:00:00.000Z",
    },
    {
      id: "conv-history-2",
      title: "Quick test",
      preview: "How are you?",
      modelId: model.id,
      createdAt: "2024-06-02T09:00:00.000Z",
      updatedAt: "2024-06-02T09:30:00.000Z",
    },
  ];
}

export function buildReadyConversation(model: HuggingFaceModel = buildCompletedModel()): Conversation {
  return {
    id: MOCK_NEW_CONVERSATION_ID,
    title: ChatScreenLabels.NEW_CHAT_TITLE,
    preview: "",
    modelId: model.id,
    createdAt: "2024-06-01T10:00:00.000Z",
    updatedAt: "2024-06-01T10:00:00.000Z",
    messages: [],
  };
}

export function buildHuggingFaceModelsQuery(
  overrides: Partial<Pick<HuggingFaceModelsQuery, "data" | "isLoading" | "error" | "isRefetching">> = {},
): HuggingFaceModelsQuery {
  const isLoading = overrides.isLoading ?? false;
  const isError = overrides.error != null;
  return {
    data: overrides.data,
    isLoading,
    isError,
    error: overrides.error ?? null,
    refetch: jest.fn(),
    isRefetching: overrides.isRefetching ?? false,
    isPending: isLoading,
    isLoadingError: false,
    isRefetchError: false,
    isSuccess: !isLoading && !isError,
    isFetching: overrides.isRefetching ?? false,
    status: isLoading ? "pending" : isError ? "error" : "success",
    fetchStatus: overrides.isRefetching ? "fetching" : "idle",
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isFetched: !isLoading,
    isFetchedAfterMount: !isLoading,
    isInitialLoading: isLoading,
    isPaused: false,
    isPlaceholderData: false,
    isStale: false,
    isEnabled: true,
    promise: Promise.resolve(overrides.data ?? []),
  } as HuggingFaceModelsQuery;
}

export const mockExecute = jest.fn().mockResolvedValue({ rows: [], rowsAffected: 1 });

export const MOCK_HF_MODELS: HuggingFaceModel[] = [
  {
    _id: "mock-model-1",
    id: "google/gemma-2b-q4",
    name: "gemma-2b-q4",
    author: "google",
    likes: 45,
    private: false,
    downloads: 1200,
    pipeline_tag: "text-generation",
    tags: ["gguf"],
    library_name: "transformers",
    createdAt: "2024-01-01T00:00:00.000Z",
    modelId: "google/gemma-2b-q4",
    siblings: [{ rfilename: "gemma-2b-q4.gguf" }],
  },
];

export const MOCK_DOWNLOADED_AT = 1_700_000_000_000;

export function buildCompletedModel(base: HuggingFaceModel = MOCK_HF_MODELS[0]): HuggingFaceModel {
  return {
    ...base,
    downloadInfo: {
      localFilePath: "/mock/path.gguf",
      status: "completed",
      downloadedAt: MOCK_DOWNLOADED_AT,
      fileSizeBytes: 2_393_231_840,
    },
  };
}
