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
  MODEL_REQUIRED: "Select a downloaded model to start chatting.",
  MODEL_SELECT_TITLE: "Select a Model",
  MODEL_SELECT_PROMPT: "Choose a downloaded model before sending messages.",
  MODEL_UNAVAILABLE: "The selected model is no longer available on this device.",
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

export const CONTINUE_USER_PROMPT =
  "Continue your previous response exactly where you stopped. Do not repeat earlier text. Finish the final sentence.";

export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant in a mobile chat app. Reply with only your final answer to the user. Do not output internal reasoning, thought channels, analysis steps, or markup tags such as channel or think blocks. Provide concise, complete answers. If a response is likely to be long, prioritize finishing the final sentence before the token limit is reached.";

export const CONVERSATION_PREVIEW_MAX_LENGTH = 120;
