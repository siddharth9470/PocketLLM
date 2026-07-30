export const RAG_DEBUG_PREFIX = "[RAG_DEBUG]";

export function ragDebug(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log(`${RAG_DEBUG_PREFIX} ${message}`, details);
  } else {
    console.log(`${RAG_DEBUG_PREFIX} ${message}`);
  }
}
