import { z } from "zod";

import { BASE_URL, HUGGING_FACE_ENDPOINTS, HUGGING_FACE_MODEL_LIST_QUERY } from "../config/apiConfig";
import type { HuggingFaceModel } from "../types/models";

const hfSiblingSchema = z.object({
  rfilename: z.string().catch(""),
});

const huggingFaceModelSchema: z.ZodType<HuggingFaceModel> = z
  .object({
    _id: z.string().optional(),
    id: z.string().min(1),
    name: z.string().optional(),
    likes: z.number().catch(0),
    private: z.boolean().catch(false),
    downloads: z.number().catch(0),
    tags: z.array(z.string()).catch([]),
    author: z.string().catch(""),
    library_name: z.string().catch(""),
    createdAt: z.string().catch(""),
    modelId: z.string().optional(),
    pipeline_tag: z.string().catch(""),
    siblings: z.array(hfSiblingSchema).catch([]),
  })
  .transform((model) => ({
    _id: model._id ?? model.id,
    id: model.id,
    name: model.name ?? model.id,
    likes: model.likes,
    private: model.private,
    downloads: model.downloads,
    tags: model.tags,
    author: model.author,
    library_name: model.library_name,
    createdAt: model.createdAt,
    modelId: model.modelId ?? model.id,
    pipeline_tag: model.pipeline_tag,
    siblings: model.siblings.filter((sibling) => sibling.rfilename.length > 0),
  }));

const huggingFaceModelsResponseSchema = z.array(z.unknown()).transform((items) =>
  items.flatMap((item) => {
    const parsed = huggingFaceModelSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  }),
);

async function fetchModels(): Promise<HuggingFaceModel[]> {
  const url = `${BASE_URL}${HUGGING_FACE_ENDPOINTS.MODELS}${HUGGING_FACE_MODEL_LIST_QUERY}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch Hugging Face models: ${response.status} ${response.statusText}`);
  }

  const payload: unknown = await response.json();
  const parsed = huggingFaceModelsResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error("Unexpected Hugging Face models response shape.");
  }

  return parsed.data;
}

export const HuggingFaceService = {
  fetchModels,
};
