export const ChatScreenLabels = {
  EMPTY_STATE: "There is no chat.",
  CREATE_NEW_CHAT: "Create New Chat",
  DELETE_CHAT_TITLE: "Delete Chat",
  DELETE_CHAT_MESSAGE: "This will permanently delete this conversation and all its messages.",
  DELETE_CHAT_CONFIRM: "Delete",
  DELETE_CHAT_CANCEL: "Cancel",
  DELETE_CHAT_FAILED: "Could not delete this chat. Please try again.",
  DELETE_CHAT_ACCESSIBILITY: "Delete chat",
  NEW_CHAT_TITLE: "New Chat",
  COMPOSER_PLACEHOLDER: "Type a message...",
  MODEL_LOADING: "Loading a model.",
  MODEL_SELECT_TITLE: "Select a Model",
  MODEL_SELECT_PROMPT: "Choose a downloaded model before sending messages.",
  MODEL_UNAVAILABLE: "The selected model is no longer available on this device.",
  ATTACHMENT_ADD: "Add attachment",
  ATTACHMENT_IMAGE: "Photo library",
  ATTACHMENT_AUDIO: "Audio file",
  ATTACHMENT_RECORD: "Record voice",
  ATTACHMENT_RECORDING: "Recording…",
  ATTACHMENT_REMOVE: "Remove attachment",
  AUDIO_DEFAULT_PROMPT:
    "Listen to the attached audio. Transcribe it, translate to English if needed, then answer helpfully.",
  ATTACHMENT_ERROR_TITLE: "Attachment Failed",
  MODEL_INVALID_WEIGHTS:
    "This file is not a text-generation model (it may be a vision projector). Delete it and re-download from the Models tab.",
  INFERENCE_FAILED: "Sorry, something went wrong generating a response.",
  INFERENCE_OOM: "The model ran out of memory. Try a smaller model or close other apps.",
  INFERENCE_CONTEXT_LIMIT: "The conversation exceeded the model context window. Start a new chat.",
  INFERENCE_ERROR_TITLE: "Generation Failed",
  RESPONSE_TRUNCATED: "(Response shortened — generation limit reached.)",
  CONTINUE_RESPONSE: "Continue",
  CONTINUE_RESPONSE_ACCESSIBILITY: "Continue generating response",
  CONTINUE_RESPONSE_FAILED: "Could not continue this response. Please try again.",
} as const;

export const MAX_COMPLETION_TOKENS = 4096;

export const CONTEXT_WINDOW_TOKENS_ANDROID = 4096;
export const CONTEXT_WINDOW_TOKENS_IOS = 8192;

/** Reserved headroom so prompt + completion never exceeds n_ctx. */
export const GENERATION_TOKEN_BUFFER = 128;

export const MIN_COMPLETION_TOKENS = 256;

/** Max generated tokens for very short user prompts (e.g. greetings). */
export const SHORT_USER_PROMPT_N_PREDICT = 64;

/** Max generated tokens for brief user prompts under ~100 characters. */
export const MEDIUM_USER_PROMPT_N_PREDICT = 128;

/** Max generated tokens for medium user prompts under ~300 characters. */
export const LONG_USER_PROMPT_N_PREDICT = 256;

export const SHORT_USER_PROMPT_MAX_CHARS = 20;
export const MEDIUM_USER_PROMPT_MAX_CHARS = 100;
export const LONG_USER_PROMPT_MAX_CHARS = 300;

export const CONTINUE_USER_PROMPT =
  "Continue your previous response exactly where you stopped. Do not repeat earlier text. Finish the final sentence.";

export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful mobile assistant. Reply with only your final answer—no reasoning tags, think blocks, or channel markup. Be concise.";

export const CONVERSATION_PREVIEW_MAX_LENGTH = 120;
