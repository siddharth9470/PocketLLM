# PocketLLM

PocketLLM is an offline-first mobile AI application prototype built with React Native and Expo. Its goal is to run local LLM inference on-device using `llama.rn`, while downloading and persisting large `.gguf` model files so they can be executed without network dependency.

## Project Overview

PocketLLM is designed to:

- Discover Hugging Face GGUF model metadata from the HF API.
- Download model binaries to device storage using Expo's resumable download API.
- Persist huge model files in `FileSystem.documentDirectory` so Android/iOS do not evict them during low-storage pressure.
- Prepare local model URIs to bootstrap a native llama inference engine via `llama.rn`.

The current codebase includes the app shell, model discovery UI, download state tracking, and a framework for eventual on-device inference. The actual llama runtime invocation is expected to be connected as the next integration step.

## Tech Stack & Native Architecture

### React Native + Expo

- The app is built on **Expo** with an explicit native directory structure present in `ios/` and `android/`.
- `app.json` indicates Expo configuration and native prebuild requirements.
- The repository uses an Expo prebuilt workflow, which means the native projects are checked into source control and can be customized directly.

### Native Code & CocoaPods

- `ios/Podfile` and `ios/Podfile.properties.json` exist for CocoaPods dependency resolution.
- CocoaPods is required for iOS native dependency installation and for linking native modules used by Expo and `llama.rn`.
- On macOS, developers should install CocoaPods via Homebrew and run pod install or `npx pod-install` after `npm install`.

### llama.rn & JSI Bridge

- `llama.rn` is included in `package.json` as the local inference bridge.
- The intended architecture is:
  - download a `.gguf` model file to local storage,
  - then hand the file URI to `llama.rn` / native JSI bootstrap methods,
  - allowing C++ inference to run inside the React Native app.
- In the current codebase, runtime inference is stubbed in `src/stores/chatStore.ts` and a settings note shows that `llama.rn` integration is not wired yet.

## Core Functionality - Fetching Models

### API client

The project uses a thin HTTP helper in `src/api/apiClient.ts`:

```ts
export const getRequest = <T>(
  endpoint: string,
  params?: Record<string, unknown>,
  options?: RequestOptions,
) => request<T>("GET", endpoint, undefined, { ...options, params });
```

It builds a full URL from `API_CONFIG.BASE_URL` using `https://huggingface.co/` and applies query parameters with a timeout-aware `AbortController`.

### Model discovery screen

`src/screens/models/ModelsScreen.tsx` currently performs the initial Hugging Face search:

```ts
getRequest(
  "api/models?search=ggfu&limit=2000&sort=downloads&direction=-1",
).then((res) => {
  setHFModels(res.data as HuggingFaceModel[]);
});
```

This fetches a ranked set of GGUF-compatible models from Hugging Face and populates the UI.

### Expected two-step model resolution

A robust offline-first workflow should be:

1. Fetch the model list via `api/models` with a search query for `ggfu`.
2. For a selected model ID, fetch its details from the model-specific endpoint and inspect the `siblings` array.

From `src/types/models.ts`:

```ts
export interface HFSibling {
  rfilename: string;
}

export interface HFModelDetails {
  siblings: HFSibling[];
}
```

A typical detail fetch would look like:

```ts
const details = await getRequest<HFModelDetails>(`api/models/${encodeURIComponent(modelId)}`);
const ggufFile = details.data.siblings.find(
  (item) => item.rfilename.endsWith('.gguf') && item.rfilename.includes('q4_k_m'),
);
```

That two-step pattern is the intended logic for reliably locating quantized `.gguf` assets.

## Core Functionality - Downloading & Storage

### Why `expo-file-system` and documentDirectory

Large GGUF models can exceed 2GB, so they must be stored in a durable directory that the OS will not purge. The app uses `FileSystem.documentDirectory` to ensure model files are kept persistently.

The download flow is consolidated in:

- `src/services/downloadHelpers.ts`
- `src/services/downloadModel.ts`
- `src/stores/downloadStore.ts`

### Download helper logic

The helper module exposes core file utilities:

```ts
export function getModelLocalUri(modelId: string) {
  return `${FileSystem.documentDirectory}${getModelFileName(modelId)}`;
}

export function getModelRemoteUrl(modelId: string) {
  return `https://huggingface.co/${modelId}/resolve/main/${getModelFileName(modelId)}`;
}
```

It also centralizes resumable download setup:

```ts
export function createResumableDownload(
  modelId: string,
  onProgress: DownloadProgressCallback,
): FileSystem.DownloadResumable {
  return FileSystem.createDownloadResumable(
    getModelRemoteUrl(modelId),
    getModelLocalUri(modelId),
    {},
    (event) => {
      onProgress(progressFromEvent(event));
    },
  );
}
```

And handles pause/cancel semantics with `AbortSignal`:

```ts
export async function downloadResumable(
  resumable: FileSystem.DownloadResumable,
  signal?: AbortSignal,
): Promise<FileSystem.FileSystemDownloadResult | undefined> {
  if (signal?.aborted) {
    throw new Error("Download cancelled");
  }

  const downloadAsync = resumable.downloadAsync();

  if (!signal) {
    return downloadAsync;
  }

  let aborted = false;
  const onAbort = async () => {
    aborted = true;
    try {
      await resumable.pauseAsync();
    } catch {
      // Ignore pause failure; cancellation is best effort.
    }
  };

  signal.addEventListener("abort", onAbort, { once: true });

  try {
    const result = await downloadAsync;
    if (aborted) {
      throw new Error("Download cancelled");
    }
    return result;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
```

### Download state management

`src/stores/downloadStore.ts` maintains download lifecycle state across the application using React hooks and context.

The store tracks per-model state as:

- `idle`
- `downloading`
- `completed`
- `failed`

Each state object also carries `progress` and an optional `localPath`.

The core download action is:

```ts
const result = await downloadModelFile(modelId, (progress) => {
  setDownloadState(modelId, {
    status: "downloading",
    progress,
  });
});

setDownloadState(modelId, {
  status: "completed",
  progress: 100,
  localPath: result.localPath,
});
```

This keeps UI feedback and persisted file location synchronized.

### Why `createDownloadResumable`

`createDownloadResumable` is the correct primitive for large model files because it:

- supports progress callbacks,
- can pause and resume safely,
- allows cancellation via `AbortSignal`, and
- is robust for unbounded binary transfers.

For model downloads, this is essential since any network interruption must not force a full retry from zero for multi-gigabyte files.

## Core Functionality - Engine Initialization

The intended runtime path is:

1. Download a local `.gguf` model file.
2. Persist it under `FileSystem.documentDirectory`.
3. Pass the local file URI into the llama runtime bootstrap.

In a final llama integration, this looks like:

```ts
const modelUri = downloadState.localPath;
await initLlama({ modelPath: modelUri, quantization: 'q4_k_m' });
```

Because `llama.rn` is a JSI-native bridge, the model URI should be handed to native code rather than re-downloaded through JavaScript.

### Current engine status

- `llama.rn` is already present as a dependency.
- The current chat reply path in `src/stores/chatStore.ts` is mocked with a placeholder assistant response.
- `src/screens/settings/SettingsScreen.tsx` explicitly notes that `llama.rn` integration is not yet wired.

This makes the repository a strong foundation for local inference once the native bridge is connected.

## Getting Started / Setup Instructions

### Prerequisites

- Node.js / npm
- Expo CLI (optional, but recommended)
- Homebrew (macOS)
- CocoaPods for iOS native dependencies

### Install dependencies

```bash
cd PocketLLM
npm install
```

### Install iOS native dependencies

```bash
brew install cocoapods
cd ios
pod install
cd ..
```

If you prefer a one-liner:

```bash
npx pod-install --repo-update
```

### Run the app

- iOS:

```bash
npx expo run:ios
```

- Android:

```bash
npx expo run:android
```

- Expo web / local dev:

```bash
npm start
```

## Project Structure

- `App.tsx` — app entrypoint and provider wiring
- `src/api/apiClient.ts` — Hugging Face request helper with timeout handling
- `src/screens/models/ModelsScreen.tsx` — model discovery UI
- `src/services/downloadHelpers.ts` — download path + resumable download utilities
- `src/services/downloadModel.ts` — model file download orchestration
- `src/stores/downloadStore.ts` — download state tracking and persistence
- `src/stores/chatStore.ts` — chat session state and local conversation updates
- `src/types/models.ts` — Hugging Face model typings

## Notes for Senior Engineers

- The current model discovery path uses `api/models?search=ggfu` and should be extended to query the selected model's detail endpoint for the `siblings` array.
- `q4_k_m` quantized `.gguf` assets are the intended target for mobile inference.
- Local storage is intentionally `FileSystem.documentDirectory` to avoid eviction and preserve large model files.
- The architecture is intentionally built for Expo prebuild / native code, so the next step is wiring the `llama.rn` JSI bridge into a real `initLlama` call.

## Future Work

- Complete model-specific detail fetching and asset selection from the Hugging Face `siblings` metadata.
- Wire `llama.rn` native initialization and inference.
- Add offline validation of downloaded models before engine bootstrap.
- Support pause/resume across app restarts via saved resumable metadata.
- Add authenticated Hugging Face access for private model repositories.
