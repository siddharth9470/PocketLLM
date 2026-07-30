/**
 * Centralized application logger.
 *
 * Domains (`Chat`, `LLM`, `Tool`, `RAG`, …) keep console output scannable.
 * Traces correlate one user send across persistence, retrieval, inference, and tools.
 * Traced output renders as a chronological tree; fields stay flat primitives.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Extensible feature domains — add new ones as features adopt this logger. */
export type LogDomain = "App" | "Chat" | "LLM" | "Tool" | "RAG" | "DB" | "Download";

/** Flat key/value pairs only — never nest objects (keeps console lines parseable). */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface LoggerContext {
  [key: string]: unknown;
}

export interface LoggerOptions {
  context?: LoggerContext;
  tags?: Record<string, string>;
  fingerprint?: string[];
}

export interface LoggerUser {
  id?: string;
  email?: string;
  username?: string;
}

export interface ScopedLogger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, error?: unknown, fields?: LogFields): void;
}

export interface TraceLogger extends ScopedLogger {
  readonly traceId: string;
  readonly domain: LogDomain;
  /** Same correlation id under a different domain (e.g. Chat → LLM). */
  child(domain: LogDomain): TraceLogger;
}

interface EventPresentation {
  emoji: string;
  label: string;
}

interface TraceRuntimeState {
  hasRoot: boolean;
  hasPreview: boolean;
  /** High-resolution epoch from `nowMs()` when the trace was created. */
  startedAtMs: number;
}

/** Identifiers that clutter every line — shown only on the trace root or in debug. */
const NOISY_FIELD_KEYS = new Set([
  "conversationId",
  "userMessageId",
  "assistantMessageId",
  "messageId",
  "modelId",
  "traceId",
]);

/** Prefer these as a quoted story preview under the event line. */
const PREVIEW_FIELD_KEYS = [
  "promptPreview",
  "replyPreview",
  "query",
  "title",
  "bodyPreview",
  "systemPromptPreview",
  "userPromptPreview",
  "rawOutputPreview",
] as const;

/** Events that render a full multi-line payload block under the tree branch. */
const PAYLOAD_BLOCK_EVENTS = new Set(["payload.system_prompt", "payload.messages", "pass1.raw_output"]);

const TERMINAL_EVENTS = new Set(["send.completed", "send.failed", "trace.completed", "trace.failed"]);

/** Events that only decorate the root header — never emit as a tree branch. */
const ROOT_ONLY_EVENTS = new Set(["trace.started", "send.started"]);

const DOMAIN_EMOJI: Record<LogDomain, string> = {
  App: "📱",
  Chat: "💬",
  LLM: "🤖",
  Tool: "🔎",
  RAG: "🔍",
  DB: "🗄️",
  Download: "⬇️",
};

const EVENT_PRESENTATION: Record<string, EventPresentation> = {
  "trace.started": { emoji: "🚀", label: "Trace started" },
  "send.started": { emoji: "🚀", label: "Send started" },
  "send.completed": { emoji: "✅", label: "Send complete" },
  "send.failed": { emoji: "💥", label: "Send failed" },
  "conversation.created": { emoji: "📝", label: "Conversation created" },
  "user.persisted": { emoji: "📥", label: "User message saved" },
  "user.persist_failed": { emoji: "💥", label: "User message save failed" },
  "assistant.persisted": { emoji: "📥", label: "Assistant reply saved" },
  "model.loading": { emoji: "🧠", label: "Loading model" },
  "model.ready": { emoji: "🧠", label: "Model ready" },
  "model.load_failed": { emoji: "💥", label: "Model load failed" },
  "inference.completed": { emoji: "💬", label: "Inference finished" },
  "completion.started": { emoji: "🤖", label: "Completion started" },
  "pass1.tool_selection.started": { emoji: "🤖", label: "Pass 1 · tool selection" },
  "pass1.raw_output": { emoji: "🕵️", label: "RAW PASS 1 OUTPUT" },
  "pass1.tool_call_detected": { emoji: "🛠️", label: "Tool call detected" },
  "pass1.tool_call_ignored": { emoji: "🛠️", label: "Tool call ignored" },
  "pass1.direct_answer": { emoji: "💬", label: "Pass 1 · direct answer" },
  "pass.direct.started": { emoji: "🤖", label: "Direct reply started" },
  "pass.direct.completed": { emoji: "💬", label: "Direct reply ready" },
  "pass2.grounded_answer.started": { emoji: "🤖", label: "Pass 2 · grounded answer" },
  "pass2.grounded_answer.completed": { emoji: "💬", label: "Pass 2 · reply ready" },
  "pass2.grounded_answer.failed": { emoji: "💥", label: "Pass 2 failed" },
  "payload.system_prompt": { emoji: "📤", label: "System prompt" },
  "payload.messages": { emoji: "📤", label: "Outgoing messages" },
  "web_search.started": { emoji: "🌐", label: "Web search started" },
  "web_search.completed": { emoji: "🌐", label: "Web search done" },
  "web_search.empty_results": { emoji: "🌐", label: "Web search empty" },
  "web_search.fallback_answer": { emoji: "🌐", label: "Using search fallback answer" },
  "web_search.ui_searching": { emoji: "🌐", label: "Showing searching state" },
  "tavily.request": { emoji: "🌐", label: "Tavily request" },
  "tavily.response": { emoji: "🌐", label: "Tavily response" },
  "tavily.request_failed": { emoji: "💥", label: "Tavily request failed" },
  "embed.queued": { emoji: "🧬", label: "Embedding queued" },
  "embed.stored": { emoji: "🧬", label: "Embedding stored" },
  "embed.failed": { emoji: "💥", label: "Embedding failed" },
  "embed.skipped_model_unavailable": { emoji: "🧬", label: "Embedding skipped · model unavailable" },
  "embed.skipped_empty_vector": { emoji: "🧬", label: "Embedding skipped · empty vector" },
  "retrieve.assembled": { emoji: "🔍", label: "RAG context assembled" },
  "retrieve.failed": { emoji: "💥", label: "RAG retrieve failed" },
  "retrieve.skipped_model_unavailable": { emoji: "🔍", label: "RAG skipped · model unavailable" },
  "retrieve.skipped_empty_query_vector": { emoji: "🔍", label: "RAG skipped · empty query vector" },
  "smoke_test.failed": { emoji: "💥", label: "RAG smoke test failed" },
};

const MAX_PREVIEW_LENGTH = 96;
const MAX_STRING_FIELD_LENGTH = 120;

let traceCounter = 0;
const traceStates = new Map<string, TraceRuntimeState>();

function createTraceId(): string {
  traceCounter = (traceCounter + 1) % 10_000;
  return `t${traceCounter.toString().padStart(4, "0")}`;
}

/** Lightweight monotonic clock for trace latency — prefers `performance.now()`. */
function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

/** Ensures a trace has timing state; first touch stamps `startedAtMs`. */
function getOrCreateTraceState(traceId: string): TraceRuntimeState {
  const existing = traceStates.get(traceId);
  if (existing) {
    return existing;
  }

  const created: TraceRuntimeState = {
    hasRoot: false,
    hasPreview: false,
    startedAtMs: nowMs(),
  };
  traceStates.set(traceId, created);
  return created;
}

/** Formats elapsed seconds since trace start for a fixed, scannable column (e.g. `[0.85s]`). */
function formatElapsedLabel(startedAtMs: number): string {
  const elapsedSeconds = Math.max(0, (nowMs() - startedAtMs) / 1000);
  return `[${elapsedSeconds.toFixed(2)}s]`;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function presentEvent(domain: LogDomain, event: string): EventPresentation {
  return (
    EVENT_PRESENTATION[event] ?? {
      emoji: DOMAIN_EMOJI[domain],
      label: event,
    }
  );
}

function extractPreview(fields?: LogFields): string | undefined {
  if (!fields) {
    return undefined;
  }

  for (const key of PREVIEW_FIELD_KEYS) {
    const value = fields[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return truncate(value.replace(/\s+/g, " ").trim(), MAX_PREVIEW_LENGTH);
    }
  }

  return undefined;
}

function formatDetailValue(value: string | number | boolean | null): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  return truncate(value.replace(/\s+/g, " ").trim(), MAX_STRING_FIELD_LENGTH);
}

/** Compact secondary details — skips noisy IDs and preview keys already rendered below. */
function formatDetails(fields: LogFields | undefined, includeNoisy: boolean): string {
  if (!fields) {
    return "";
  }

  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }

    if (!includeNoisy && NOISY_FIELD_KEYS.has(key)) {
      continue;
    }

    if ((PREVIEW_FIELD_KEYS as readonly string[]).includes(key)) {
      continue;
    }

    if (key === "error") {
      parts.push(formatDetailValue(value));
      continue;
    }

    if (key === "promptLen" || key === "replyLen") {
      parts.push(`${value} chars`);
      continue;
    }

    if (key === "queryLen" || key === "textLen" || key === "contextLen") {
      parts.push(`${key.replace(/Len$/, "")} ${value}`);
      continue;
    }

    if (key === "matchCount") {
      parts.push(`${value} matches`);
      continue;
    }

    if (key === "messageCount") {
      parts.push(`${value} msgs`);
      continue;
    }

    if (key === "systemPromptLen") {
      parts.push(`${value} chars`);
      continue;
    }

    if (key === "roles" && typeof value === "string") {
      parts.push(value);
      continue;
    }

    if (key === "purpose" && typeof value === "string") {
      parts.push(value);
      continue;
    }

    if (key === "resultCount") {
      parts.push(`${value} results`);
      continue;
    }

    if (key === "vectorLen") {
      parts.push(`dim ${value}`);
      continue;
    }

    if (key === "hasContext") {
      parts.push(value ? "with context" : "no context");
      continue;
    }

    if (key === "hasAnswer") {
      parts.push(value ? "has answer" : "no answer");
      continue;
    }

    if (key === "toolsEnabled") {
      parts.push(value ? "tools on" : "tools off");
      continue;
    }

    if (key === "hasRagContext") {
      parts.push(value ? "RAG on" : "RAG off");
      continue;
    }

    if (key === "tokensPerSecond" && typeof value === "number") {
      parts.push(`${value.toFixed(1)} tok/s`);
      continue;
    }

    if (key === "tool" || key === "role") {
      parts.push(String(value));
      continue;
    }

    if (key === "ms" || key === "responseTimeMs") {
      parts.push(`${value} ms`);
      continue;
    }

    if (key === "status") {
      parts.push(`HTTP ${value}`);
      continue;
    }

    parts.push(`${key} ${formatDetailValue(value)}`);
  }

  return parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
}

function writeLine(level: LogLevel, line: string): void {
  switch (level) {
    case "debug":
      console.debug(line);
      break;
    case "info":
      console.info(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

function writePreview(level: LogLevel, preview: string, indent: string): void {
  writeLine(level, `${indent}"${preview}"`);
}

/**
 * Renders a tree-safe multi-line payload block under a branch line.
 * Prints the complete body with no character/line truncation; each source line
 * (including blanks) is prefixed so the ┌│└ box stays aligned in the trace tree.
 */
function writePayloadBlock(level: LogLevel, body: string, indent: string): void {
  const normalized = body.replace(/\r\n/g, "\n");
  if (normalized.trim().length === 0) {
    return;
  }

  const lines = normalized.split("\n");

  writeLine(level, `${indent}┌`);
  for (const line of lines) {
    writeLine(level, `${indent}│ ${line}`);
  }
  writeLine(level, `${indent}└`);
}

function extractPayloadBody(event: string, fields?: LogFields): string | undefined {
  if (!fields) {
    return undefined;
  }

  if (event === "payload.system_prompt") {
    const value = fields.systemPromptPreview;
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }

  if (event === "payload.messages") {
    const value = fields.userPromptPreview;
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }

  if (event === "pass1.raw_output") {
    const value = fields.rawOutputPreview;
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }

  return undefined;
}

function formatRootHeader(domain: LogDomain, traceId: string, fields?: LogFields): string {
  const modelId = typeof fields?.modelId === "string" ? fields.modelId : undefined;
  const suffix = modelId ? ` · ${modelId}` : "";
  return `${DOMAIN_EMOJI[domain]} ${domain}  #${traceId}${suffix}`;
}

function formatBranchLine(
  domain: LogDomain,
  level: LogLevel,
  event: string,
  fields: LogFields | undefined,
  isTerminal: boolean,
  includeNoisy: boolean,
  elapsedLabel: string,
): string {
  const presentation = presentEvent(domain, event);
  const connector = isTerminal ? "└─" : "├─";
  const levelHint = level === "warn" ? " ⚠" : level === "error" ? " ✗" : "";
  return `${connector} ${elapsedLabel} ${presentation.emoji} ${presentation.label}${levelHint}${formatDetails(fields, includeNoisy)}`;
}

function formatStandaloneLine(
  domain: LogDomain,
  level: LogLevel,
  event: string,
  fields: LogFields | undefined,
  includeNoisy: boolean,
): string {
  const presentation = presentEvent(domain, event);
  const levelHint = level === "warn" ? " ⚠" : level === "error" ? " ✗" : "";
  return `${presentation.emoji} [${domain}] ${presentation.label}${levelHint}${formatDetails(fields, includeNoisy)}`;
}

function emit(domain: LogDomain, level: LogLevel, event: string, fields?: LogFields, traceId?: string): void {
  const includeNoisy = level === "debug";
  const payloadBody = PAYLOAD_BLOCK_EVENTS.has(event) ? extractPayloadBody(event, fields) : undefined;
  const preview = payloadBody ? undefined : extractPreview(fields);

  if (!traceId) {
    writeLine(level, formatStandaloneLine(domain, level, event, fields, includeNoisy));
    if (payloadBody) {
      writePayloadBlock(level, payloadBody, "   ");
    } else if (preview) {
      writePreview(level, preview, "   ");
    }
    return;
  }

  const state = getOrCreateTraceState(traceId);
  const elapsedLabel = formatElapsedLabel(state.startedAtMs);
  const isTerminal = TERMINAL_EVENTS.has(event);

  if (!state.hasRoot) {
    writeLine(level, formatRootHeader(domain, traceId, fields));
    if (preview) {
      writePreview(level, preview, "│  ");
      state.hasPreview = true;
    }
    state.hasRoot = true;
    traceStates.set(traceId, state);

    if (ROOT_ONLY_EVENTS.has(event)) {
      return;
    }
  }

  if (ROOT_ONLY_EVENTS.has(event)) {
    if (preview && !state.hasPreview) {
      writePreview(level, preview, "│  ");
      state.hasPreview = true;
      traceStates.set(traceId, state);
    }
    return;
  }

  writeLine(level, formatBranchLine(domain, level, event, fields, isTerminal, includeNoisy, elapsedLabel));
  const branchIndent = isTerminal ? "   " : "│  ";
  if (payloadBody) {
    writePayloadBlock(level, payloadBody, branchIndent);
  } else if (preview) {
    writePreview(level, preview, branchIndent);
  }

  if (isTerminal) {
    traceStates.delete(traceId);
    return;
  }

  traceStates.set(traceId, state);
}

function createScopedLogger(domain: LogDomain, traceId?: string): ScopedLogger {
  return {
    debug(event: string, fields?: LogFields): void {
      emit(domain, "debug", event, fields, traceId);
    },
    info(event: string, fields?: LogFields): void {
      emit(domain, "info", event, fields, traceId);
    },
    warn(event: string, fields?: LogFields): void {
      emit(domain, "warn", event, fields, traceId);
    },
    error(event: string, error?: unknown, fields?: LogFields): void {
      emit(
        domain,
        "error",
        event,
        {
          ...fields,
          ...(error !== undefined ? { error: serializeError(error) } : {}),
        },
        traceId,
      );
    },
  };
}

function createTraceLogger(domain: LogDomain, traceId: string): TraceLogger {
  const scoped = createScopedLogger(domain, traceId);

  return {
    traceId,
    domain,
    ...scoped,
    child(nextDomain: LogDomain): TraceLogger {
      return createTraceLogger(nextDomain, traceId);
    },
  };
}

/**
 * Primary application logger.
 * Prefer `domain(...)` or `startTrace(...)` for feature code; legacy helpers remain for gradual migration.
 */
export const appLogger = {
  /** Returns a domain-scoped logger without a correlation id. */
  domain(domain: LogDomain): ScopedLogger {
    return createScopedLogger(domain);
  },

  /**
   * Starts a correlated log trail for a user-facing workflow (e.g. one chat send).
   * Use `child(domain)` / `forTrace(...)` to keep the same `#traceId` while switching domains.
   */
  startTrace(domain: LogDomain, fields?: LogFields): TraceLogger {
    const traceId = createTraceId();
    // Stamp the clock before the root emit so elapsed labels are relative to trace start.
    traceStates.set(traceId, {
      hasRoot: false,
      hasPreview: false,
      startedAtMs: nowMs(),
    });
    const trace = createTraceLogger(domain, traceId);
    emit(domain, "info", "trace.started", fields, traceId);
    return trace;
  },

  /** Continues an existing correlation id under a domain without emitting `trace.started`. */
  forTrace(domain: LogDomain, traceId: string): TraceLogger {
    return createTraceLogger(domain, traceId);
  },

  debug(message: string, context?: LoggerContext): void {
    emit("App", "debug", message, flattenLegacyContext(context));
  },

  info(message: string, context?: LoggerContext): void {
    emit("App", "info", message, flattenLegacyContext(context));
  },

  warn(message: string, context?: LoggerContext, _options?: LoggerOptions): void {
    emit("App", "warn", message, flattenLegacyContext(context));
  },

  error(message: string, error?: unknown, options?: LoggerOptions): void {
    emit("App", "error", message, {
      ...flattenLegacyContext(options?.context),
      ...(error !== undefined ? { error: serializeError(error) } : {}),
    });
  },

  captureException(error: unknown, options?: LoggerOptions): void {
    emit("App", "error", "exception", {
      ...flattenLegacyContext(options?.context),
      error: serializeError(error),
    });
  },

  setUser(_user: LoggerUser | null): void {},

  setTag(_key: string, _value: string): void {},

  setContext(_name: string, _context: LoggerContext): void {},
};

/** @deprecated Prefer `appLogger` — kept as a stable alias for existing call sites. */
export const logger = appLogger;

function flattenLegacyContext(context?: LoggerContext): LogFields | undefined {
  if (!context) {
    return undefined;
  }

  const fields: LogFields = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) {
      continue;
    }

    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      fields[key] = value;
      continue;
    }

    fields[key] = truncate(serializeError(value), MAX_STRING_FIELD_LENGTH);
  }

  return fields;
}
