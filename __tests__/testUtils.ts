import type { UseQueryResult } from "@tanstack/react-query";

import type { HuggingFaceModel } from "../src/types/models";

type HuggingFaceModelsQuery = UseQueryResult<HuggingFaceModel[], Error>;

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
