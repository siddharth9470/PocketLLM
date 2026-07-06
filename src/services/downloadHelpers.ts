import type { HuggingFaceModel } from "../types/models";
import { getLanguageModelGgufFilename } from "../utils/ggufFileSelection";

export const getDownloadUrlForModel = async (
  model: HuggingFaceModel,
): Promise<{ url: string; filename: string } | null> => {
  try {
    const safeCleanedFilename = getLanguageModelGgufFilename(model.siblings);
    if (!safeCleanedFilename) {
      console.error(`No language-model GGUF found for ${model.id}`);
      return null;
    }

    const downloadUrl = `https://huggingface.co/${model.id}/resolve/main/${safeCleanedFilename}`;

    console.log("Resolved Download Target:", {
      url: downloadUrl,
      filename: safeCleanedFilename,
    });

    return {
      url: downloadUrl,
      filename: safeCleanedFilename,
    };
  } catch (error) {
    console.error("Error fetching file list:", error);
    return null;
  }
};
