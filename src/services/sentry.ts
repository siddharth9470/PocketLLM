import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

import { SENTRY_DSN, SENTRY_ENABLED } from "../constants/sentry";

let initialized = false;

export function initSentry(): void {
  if (initialized) {
    return;
  }

  initialized = true;

  const enabled = SENTRY_ENABLED && !!SENTRY_DSN;

  if (!enabled) {
    console.warn(
      "[Sentry] EXPO_PUBLIC_SENTRY_DSN is not set. Crash reporting is disabled.",
    );
  }

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  Sentry.init({
    dsn: SENTRY_DSN,
    enabled,
    debug: __DEV__,
    environment: __DEV__ ? "development" : "production",
    release: `pocketllm@${appVersion}`,
    dist: Constants.nativeBuildVersion ?? undefined,
    sendDefaultPii: false,
    attachStacktrace: true,
    enableAutoSessionTracking: true,
    enableNative: true,
    enableNativeCrashHandling: true,
    enableNativeNagger: false,
    enableLogs: true,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  });
}

initSentry();

export { Sentry };
