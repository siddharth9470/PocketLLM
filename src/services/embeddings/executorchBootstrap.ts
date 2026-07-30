import { initExecutorch } from "react-native-executorch";
import { ExpoResourceFetcher } from "react-native-executorch-expo-resource-fetcher";

let isInitialized = false;

/** Registers the Expo resource fetcher adapter required by ExecuTorch model downloads. */
export function initializeExecutorch(): void {
  if (isInitialized) {
    return;
  }

  initExecutorch({
    resourceFetcher: ExpoResourceFetcher,
  });

  isInitialized = true;
}
