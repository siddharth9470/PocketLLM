const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? "";

export const SENTRY_DSN = sentryDsn.length > 0 ? sentryDsn : undefined;

export const SENTRY_ENABLED = SENTRY_DSN !== undefined;
