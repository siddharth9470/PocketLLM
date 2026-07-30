/// <reference types="jest" />

import type { UseQueryResult } from "@tanstack/react-query";
import type { NativeCompletionResult } from "llama.rn";

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
  refreshConversations: jest.MockedFunction<() => Promise<void>>;
  loadConversation: jest.MockedFunction<(conversationId: string) => Promise<Conversation | null>>;
  getConversation: jest.MockedFunction<(conversationId: string) => Conversation | undefined>;
  sendMessage: jest.MockedFunction<(conversationId: string, content: string, options: unknown) => Promise<void>>;
  setConversationModel: jest.MockedFunction<(conversationId: string, modelId: string) => Promise<void>>;
  setActiveConversationId: jest.MockedFunction<(conversationId: string | null) => void>;
  createConversationId: jest.MockedFunction<() => string>;
  deleteConversation: jest.MockedFunction<(conversationId: string) => Promise<void>>;
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

export const mockExecuteSync = jest.fn((query: string) => {
  if (String(query).includes("sqlite_master")) {
    return { rows: [{ sql: null }], rowsAffected: 0 };
  }

  return { rows: [], rowsAffected: 1 };
});

/**
 * Builds a llama.rn `NativeCompletionResult` for inference tests.
 *
 * The native bridge shape declares many required fields the app never reads. We
 * populate only the fields production code touches (`text`, `content`,
 * `tool_calls`, `timings`) and isolate the single native-boundary cast here so
 * individual tests stay concise.
 */
export function buildCompletionResult(overrides: Partial<NativeCompletionResult> = {}): NativeCompletionResult {
  return {
    text: "",
    content: "",
    reasoning_content: "",
    tool_calls: [],
    timings: {
      cache_n: 0,
      prompt_n: 12,
      prompt_ms: 100,
      prompt_per_token_ms: 0,
      prompt_per_second: 0,
      predicted_n: 24,
      predicted_ms: 200,
      predicted_per_token_ms: 0,
      predicted_per_second: 42,
    },
    ...overrides,
  } as NativeCompletionResult;
}

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
    parameterBillions: 2.6,
    ggufFileSizeBytes: 1_600_000_000,
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
