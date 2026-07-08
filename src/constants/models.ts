export const ModelsScreenLabels = {
  LOADING: "Loading models...",
  NO_MATCHES: "No models match the current filters.",
  FETCH_ERROR: "Could not load models. Pull down to retry.",
  STOP_DOWNLOADING: "Stop downloading",
  STOP_DOWNLOADING_ACCESSIBILITY: "Stop downloading model",
} as const;

export const ModelDetailsLabels = {
  LOADING: "Loading model details...",
  LOADING_VARIANTS: "Loading file sizes...",
  FETCH_ERROR: "Could not load model details.",
  SIZE_UNKNOWN: "Size unknown",
  VARIANTS: "Available quantizations",
  NO_VARIANTS: "No language-model GGUF files found in this repo.",
  DOWNLOAD: "Download",
  DOWNLOADING: "Downloading",
  STOP: "Stop",
  DELETE: "Delete",
  DELETE_TITLE: "Delete model",
  DELETE_MESSAGE: (filename: string) => `Delete "${filename}"? This will remove the model file and its saved metadata.`,
  CANCEL: "Cancel",
} as const;
