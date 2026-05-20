export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  modelId: string;
  messages: ChatMessage[];
}
