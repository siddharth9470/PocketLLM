import Constants from "expo-constants";

function readTavilyApiKey(): string | undefined {
  const fromProcess = process.env.EXPO_PUBLIC_TAVILY_API_KEY?.trim();
  if (fromProcess) {
    return fromProcess;
  }

  const fromExtra = Constants.expoConfig?.extra?.tavilyApiKey;
  if (typeof fromExtra === "string" && fromExtra.trim().length > 0) {
    return fromExtra.trim();
  }

  return undefined;
}

export function getTavilyApiKey(): string | undefined {
  return readTavilyApiKey();
}

export function isTavilyConfigured(): boolean {
  return Boolean(getTavilyApiKey());
}

export function logTavilyConfigStatus(): void {
  const apiKey = getTavilyApiKey();
  console.log("[env] Tavily configured:", Boolean(apiKey));

  if (apiKey) {
    console.log("[env] Tavily API key prefix:", `${apiKey.slice(0, 8)}...`);
    return;
  }

  console.warn(
    "[env] EXPO_PUBLIC_TAVILY_API_KEY is missing. Add it to .env.development (or .env.production), then restart Metro: npx expo start -c",
  );
}
