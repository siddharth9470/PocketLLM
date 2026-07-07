export const BASE_URL = "https://huggingface.co/api";

export const HUGGING_FACE_ENDPOINTS = {
  MODELS: "/models",
} as const;

export const HUGGING_FACE_MODEL_LIST_QUERY =
  "?search=gguf+q4&limit=200&sort=downloads&direction=-1&expand=pipeline_tag&expand=siblings&expand=tags&expand=likes&expand=private&expand=downloads&expand=createdAt&expand=lastModified&expand=author";
