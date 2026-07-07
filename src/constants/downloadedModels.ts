export const DownloadedModelsLabels = {
  EMPTY: "No downloaded models yet.",
  EMPTY_HINT: "Download a model from the catalog to use it in chats.",
  DELETE_TITLE: "Delete model",
  DELETE_MESSAGE: (modelName: string) =>
    `Delete "${modelName}"? This will remove the model file and its saved metadata.`,
  DELETE: "Delete",
  CANCEL: "Cancel",
  DELETE_ACCESSIBILITY: "Delete downloaded model",
  FILE_SIZE: "File size",
  DOWNLOADED: "Downloaded",
  SIZE_UNKNOWN: "Model size not available",
  LOAD_FAILED: "Could not load downloaded models.",
} as const;
