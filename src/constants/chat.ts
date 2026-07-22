export const CHAT_SYSTEM_PROMPT = `You are PocketLLM, a helpful on-device assistant.

When the user asks about current events, recent news, live data (weather, prices, scores, stock quotes), specific facts you are unsure about, or anything that requires up-to-date information, you MUST call the web_search tool instead of guessing.

Never invent facts, dates, numbers, or news. If you do not know and the question needs real-world data, call web_search.

For general knowledge you are confident about, answer directly without searching.`;

export const CHAT_ANSWER_WITH_SEARCH_PROMPT = `You are PocketLLM, a helpful assistant.

Web search results are provided below. Answer the user's question using those results. Include specific prices, dates, and facts when present. Be concise. Do not call tools.`;

export const WEB_SEARCH_TOOL = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the public web for current events, live data, recent news, or factual information you cannot answer confidently from training data alone.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Concise search query for the information needed.",
          },
        },
        required: ["query"],
      },
    },
  },
] as const;

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
  MODEL_INVALID_WEIGHTS:
    "This file is not a text-generation model (it may be a vision projector). Delete it and re-download from the Models tab.",
  INFERENCE_FAILED: "Sorry, something went wrong generating a response.",
  INFERENCE_ERROR_TITLE: "Generation Failed",
  MODEL_INIT_FAILED: "Could not load the selected model. Please try again.",
  SEARCHING_WEB: "Searching the web...",
} as const;

export const CONTEXT_WINDOW_TOKENS_ANDROID = 4096;
export const CONTEXT_WINDOW_TOKENS_IOS = 8192;

export const CONVERSATION_PREVIEW_MAX_LENGTH = 120;
