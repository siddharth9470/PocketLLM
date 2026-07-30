export const CHAT_SYSTEM_PROMPT = `You are PocketLLM, a helpful on-device assistant.

When the user asks about current events, recent news, live data (weather, prices, scores, stock quotes), specific facts you are unsure about, or anything that requires up-to-date information, you MUST call the web_search tool instead of guessing.

When the user asks about something they previously discussed, preferences they mentioned, earlier decisions, prior answers, or any detail that may exist in past chat messages on this device, call the search_local_history tool with a concise query.

Never invent facts, dates, numbers, or news. If you do not know and the question needs real-world data, call web_search. If you need earlier conversation context, call search_local_history.

For greetings and general knowledge you are confident about, answer directly without calling tools.`;

export const CHAT_ANSWER_WITH_SEARCH_PROMPT = `You are PocketLLM, a helpful assistant.

Web search results are provided below. Answer the user's question using those results. Include specific prices, dates, and facts when present. Be concise. Do not call tools.`;

export const CHAT_ANSWER_WITH_RAG_PROMPT = `You are PocketLLM, a helpful assistant.

Relevant excerpts from the user's past conversations on this device are provided below. Answer the user's question using those excerpts when they are relevant. Be concise. Do not call tools. If the excerpts do not contain enough information, say so clearly and answer from what you know without inventing past conversation details.`;

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

export const LOCAL_SEARCH_TOOL = [
  {
    type: "function",
    function: {
      name: "search_local_history",
      description:
        "Search this device's past chat messages for earlier discussions, user preferences, prior decisions, or details the user mentioned before. Use when the answer may already exist in conversation history.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Concise semantic query describing what to find in past chats.",
          },
        },
        required: ["query"],
      },
    },
  },
] as const;

export type ChatToolDefinition = (typeof WEB_SEARCH_TOOL)[number] | (typeof LOCAL_SEARCH_TOOL)[number];

/**
 * Builds the Pass-1 tool list for llama.rn.
 * Local history search is always offered; web search is included only when Tavily is configured.
 */
export function buildChatTools(webSearchEnabled: boolean): ChatToolDefinition[] {
  if (webSearchEnabled) {
    return [...WEB_SEARCH_TOOL, ...LOCAL_SEARCH_TOOL];
  }

  return [...LOCAL_SEARCH_TOOL];
}

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
  SEARCHING_HISTORY: "Searching chat history...",
} as const;

export const CONTEXT_WINDOW_TOKENS_ANDROID = 4096;
export const CONTEXT_WINDOW_TOKENS_IOS = 8192;

export const CONVERSATION_PREVIEW_MAX_LENGTH = 120;
