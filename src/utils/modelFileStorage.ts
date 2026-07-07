import * as FileSystem from "expo-file-system/legacy";

function normalizeFileUri(filePath: string): string {
  const trimmed = filePath.trim();
  return trimmed.startsWith("file://") ? trimmed : `file://${trimmed}`;
}

export async function getModelFileSizeBytes(filePath: string): Promise<number | null> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(normalizeFileUri(filePath));

    if (!fileInfo.exists || fileInfo.isDirectory) {
      return null;
    }

    return fileInfo.size ?? null;
  } catch (error) {
    console.error("Failed to read model file size:", error);
    return null;
  }
}
