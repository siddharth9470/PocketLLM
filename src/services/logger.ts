import * as Sentry from "@sentry/react-native";

import { SENTRY_ENABLED } from "@/constants/sentry";

type LogLevel = "debug" | "info" | "warning" | "error";

export interface LoggerContext {
  [key: string]: unknown;
}

export interface LoggerOptions {
  context?: LoggerContext;
  tags?: Record<string, string>;
  fingerprint?: string[];
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

function addBreadcrumb(level: LogLevel, message: string, context?: LoggerContext): void {
  if (!SENTRY_ENABLED) {
    return;
  }

  Sentry.addBreadcrumb({
    category: "app",
    message,
    level,
    data: context,
  });
}

function sendToSentry(level: LogLevel, message: string, error?: unknown, options?: LoggerOptions): void {
  if (!SENTRY_ENABLED) {
    return;
  }

  Sentry.withScope((scope) => {
    if (options?.context) {
      scope.setContext("details", options.context);
    }

    if (options?.tags) {
      for (const [key, value] of Object.entries(options.tags)) {
        scope.setTag(key, value);
      }
    }

    if (options?.fingerprint) {
      scope.setFingerprint(options.fingerprint);
    }

    if (error instanceof Error) {
      scope.setExtra("logMessage", message);
      Sentry.captureException(error);
      return;
    }

    if (error !== undefined) {
      scope.setExtra("error", serializeError(error));
    }

    Sentry.captureMessage(message, level);
  });
}

export const logger = {
  debug(message: string, context?: LoggerContext): void {
    writeToConsole("debug", message, context);
    addBreadcrumb("debug", message, context);
  },

  info(message: string, context?: LoggerContext): void {
    writeToConsole("info", message, context);
    addBreadcrumb("info", message, context);
  },

  warn(message: string, context?: LoggerContext, options?: LoggerOptions): void {
    writeToConsole("warning", message, context);
    addBreadcrumb("warning", message, context);
    sendToSentry("warning", message, undefined, {
      ...options,
      context: { ...options?.context, ...context },
    });
  },

  error(message: string, error?: unknown, options?: LoggerOptions): void {
    const context = {
      ...options?.context,
      ...(error !== undefined ? { error: serializeError(error) } : {}),
    };

    writeToConsole("error", message, context);
    addBreadcrumb("error", message, context);
    sendToSentry("error", message, error, options);
  },

  captureException(error: unknown, options?: LoggerOptions): void {
    const message = serializeError(error);
    writeToConsole("error", message, options?.context);
    sendToSentry("error", message, error, options);
  },

  setUser(user: Sentry.User | null): void {
    if (!SENTRY_ENABLED) {
      return;
    }

    Sentry.setUser(user);
  },

  setTag(key: string, value: string): void {
    if (!SENTRY_ENABLED) {
      return;
    }

    Sentry.setTag(key, value);
  },

  setContext(name: string, context: LoggerContext): void {
    if (!SENTRY_ENABLED) {
      return;
    }

    Sentry.setContext(name, context);
  },
};
