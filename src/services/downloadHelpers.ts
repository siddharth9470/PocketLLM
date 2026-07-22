import * as FileSystem from "expo-file-system/legacy";

import type { HuggingFaceModel } from "@/types/models";
import { getLanguageModelGgufFilename } from "@/utils/ggufFileSelection";

export interface GgufDownloadTarget {
  url: string;
  filename: string;
  fileSizeBytes: number | null;
}

function ggufBasename(filename: string): string {
  return filename.split("/").pop() ?? filename;
}

function buildResolveUrl(modelId: string, filename: string): string {
  return `https://huggingface.co/${modelId}/resolve/main/${encodeURIComponent(ggufBasename(filename))}`;
}

export function normalizeFileUri(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith("file://")) {
    const pathPart = trimmed.slice("file://".length);
    return `file://${pathPart.startsWith("/") ? pathPart : `/${pathPart}`}`;
  }

  return trimmed.startsWith("/") ? `file://${trimmed}` : trimmed;
}

export async function deleteLocalModelFile(filePath: string): Promise<void> {
  const normalizedUri = normalizeFileUri(filePath);
  const absolutePath = normalizedUri.replace(/^file:\/\//, "");
  const candidates = [...new Set([normalizedUri, absolutePath, filePath.trim()])];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(candidate);
      if (!fileInfo.exists || fileInfo.isDirectory) {
        return;
      }

      await FileSystem.deleteAsync(candidate, { idempotent: true });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to delete model file at ${filePath}`);
}

export function localFileBasename(fileUri?: string): string | null {
  if (!fileUri) {
    return null;
  }

  return (
    fileUri
      .replace(/^file:\/\//, "")
      .split("/")
      .pop() ?? null
  );
}

// Fetches the byte size of a remote GGUF file from Hugging Face using an HTTP HEAD request.
export async function getRemoteGgufFileSizeBytes(modelId: string, filename: string): Promise<number | null> {
  try {
    const response = await fetch(buildResolveUrl(modelId, filename), { method: "HEAD" });

    if (!response.ok) {
      return null;
    }

    const contentLength = response.headers.get("content-length");
    if (!contentLength) {
      return null;
    }

    const size = Number.parseInt(contentLength, 10);
    return Number.isFinite(size) && size > 0 ? size : null;
  } catch (error) {
    console.error(`Failed to resolve remote file size for ${modelId}/${filename}:`, error);
    return null;
  }
}

// Builds the Hugging Face resolve URL and download metadata for a specific GGUF filename.
export function buildGgufDownloadTarget(
  modelId: string,
  filename: string,
  fileSizeBytes?: number | null,
): GgufDownloadTarget {
  const basename = ggufBasename(filename);

  return {
    url: buildResolveUrl(modelId, basename),
    filename: basename,
    fileSizeBytes: fileSizeBytes ?? null,
  };
}

// Resolves the download target for a model; prefers knownSizeBytes from blob metadata over a HEAD lookup.
export async function getDownloadUrlForModel(
  model: HuggingFaceModel,
  filename?: string,
  knownSizeBytes?: number | null,
): Promise<GgufDownloadTarget | null> {
  try {
    const selectedFilename = filename ?? getLanguageModelGgufFilename(model.siblings);
    if (!selectedFilename) {
      console.error(`No language-model GGUF found for ${model.id}`);
      return null;
    }

    if (knownSizeBytes != null) {
      return buildGgufDownloadTarget(model.id, selectedFilename, knownSizeBytes);
    }

    const fileSizeBytes = await getRemoteGgufFileSizeBytes(model.id, selectedFilename);
    return buildGgufDownloadTarget(model.id, selectedFilename, fileSizeBytes);
  } catch (error) {
    console.error("Error resolving download target:", error);
    return null;
  }
}
