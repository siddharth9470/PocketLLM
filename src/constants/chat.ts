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
  INFERENCE_ERROR_TITLE: "Generation Failed",
  MODEL_INIT_FAILED: "Could not load the selected model. Please try again.",
  DUMMY_ASSISTANT_RESPONSE: "This is a placeholder assistant response.",
} as const;

export const DUMMY_RESPONSE_DELAY_MS = 500;

export const CONTEXT_WINDOW_TOKENS_ANDROID = 4096;
export const CONTEXT_WINDOW_TOKENS_IOS = 8192;

export const CONVERSATION_PREVIEW_MAX_LENGTH = 120;
