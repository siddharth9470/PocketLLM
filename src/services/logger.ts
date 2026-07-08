type LogLevel = "debug" | "info" | "warning" | "error";

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

function writeToConsole(level: LogLevel, message: string, context?: LoggerContext): void {
  const payload = context && Object.keys(context).length > 0 ? [message, context] : [message];

  switch (level) {
    case "debug":
      console.debug(...payload);
      break;
    case "info":
      console.info(...payload);
      break;
    case "warning":
      console.warn(...payload);
      break;
    case "error":
      console.error(...payload);
      break;
  }
}

export const logger = {
  debug(message: string, context?: LoggerContext): void {
    writeToConsole("debug", message, context);
  },

  info(message: string, context?: LoggerContext): void {
    writeToConsole("info", message, context);
  },

  warn(message: string, context?: LoggerContext, _options?: LoggerOptions): void {
    writeToConsole("warning", message, context);
  },

  error(message: string, error?: unknown, options?: LoggerOptions): void {
    const context = {
      ...options?.context,
      ...(error !== undefined ? { error: serializeError(error) } : {}),
    };

    writeToConsole("error", message, context);
  },

  captureException(error: unknown, options?: LoggerOptions): void {
    const message = serializeError(error);
    writeToConsole("error", message, options?.context);
  },

  setUser(_user: LoggerUser | null): void {},

  setTag(_key: string, _value: string): void {},

  setContext(_name: string, _context: LoggerContext): void {},
};
