import type { HuggingFaceModel } from "../types/models";

export const getDownloadUrlForModel = async (
  model: HuggingFaceModel,
): Promise<{ url: string; filename: string } | null> => {
  try {
    const targetFilename = model.siblings.find((name) => name.rfilename.toLowerCase().endsWith(".gguf"));

    console.log(targetFilename);

    const safeCleanedFilename = targetFilename?.rfilename.split("/").pop() || "model.gguf";

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
