export interface ChatMessage {
  id: string;
  conversationId: string; // Crucial for normalized database foreign key indexing
  role: "system" | "user" | "assistant"; // Added 'system' for custom system prompts
  content: string;
  createdAt: string;

  // UI & Streaming State
  status: "pending" | "streaming" | "completed" | "error";
  error?: string; // Captures local failures (e.g., Context Window Exceeded, OOM)

  // Local LLM Telemetry (Crucial for tracking on-device performance)
  metrics?: {
    tokensPerSecond?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTimeMs?: number;
  };
}

export interface Conversation {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  modelId: string; // Links directly to your HuggingFaceModel / local DB row

  // Local LLM Context Configuration
  contextSettings?: {
    systemPrompt?: string;
    temperature?: number;
    contextSize?: number; // Configured context window for this specific session
  };

  // Keep the domain model lightweight for list views.
  // When querying a list of conversations, omit the full message array to save memory.
  messages?: ChatMessage[];
}
