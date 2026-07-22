export const BASE_URL = "https://huggingface.co/api";

export const HUGGING_FACE_ENDPOINTS = {
  MODELS: "/models",
} as const;

const HUGGING_FACE_MODEL_LIST_SEARCH = {
  search: "gguf",
  limit: 100,
  sort: "downloads",
  direction: -1,
  // Keep list payload light; fetch gguf/blobs only on model details.
  expand: ["author", "pipeline_tag", "siblings", "tags", "likes", "downloads"],
} as const;

export function buildHuggingFaceModelListQuery(): string {
  const params = new URLSearchParams();

  params.set("search", HUGGING_FACE_MODEL_LIST_SEARCH.search);
  params.set("limit", String(HUGGING_FACE_MODEL_LIST_SEARCH.limit));
  params.set("sort", HUGGING_FACE_MODEL_LIST_SEARCH.sort);
  params.set("direction", String(HUGGING_FACE_MODEL_LIST_SEARCH.direction));

  for (const field of HUGGING_FACE_MODEL_LIST_SEARCH.expand) {
    params.append("expand", field);
  }

  return `?${params.toString()}`;
}

export const HUGGING_FACE_MODEL_LIST_QUERY = buildHuggingFaceModelListQuery();
