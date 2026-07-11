export type ChatAttachmentKind = "image" | "audio";

/** Normalized attachment row — supports multiple files per message via sort_order. */
export interface ChatMessageAttachment {
  id: string;
  messageId: string;
  conversationId: string;
  kind: ChatAttachmentKind;
  storagePath: string;
  mimeType: string;
  originalFileName?: string;
  fileSizeBytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
  sortOrder: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string; // Crucial for normalized database foreign key indexing
  role: "system" | "user" | "assistant"; // Added 'system' for custom system prompts
  content: string;
  createdAt: string;

  // UI & Streaming State
  status: "pending" | "streaming" | "completed" | "error";
  error?: string; // Captures local failures (e.g., Context Window Exceeded, OOM)
  truncated?: boolean;

  /** Optional media persisted locally and referenced by storage_path in SQLite. */
  attachments?: ChatMessageAttachment[];

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
