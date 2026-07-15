# Pocket LLM

A privacy-first, on-device AI assistant for iOS and Android. Pocket LLM runs large language model inference entirely on your phone — no cloud APIs, no data leaving the device.

> **Status:** Early rebuild. Core scaffolding is in place for model discovery, background downloads, and native inference. Chat UI and secure session persistence are the immediate focus.

---

## Project Philosophy

### Offline-first by design

Inference happens locally on the device using downloaded GGUF model files. Once a model is on disk, conversations require no network connection. Hugging Face is used only as a model registry and download source — never as an inference backend.

### Zero cloud dependency for user data

Chat history, encryption keys, and model files stay on-device. There are no telemetry pipelines, remote logging endpoints, or third-party AI APIs in the inference path.

### Cross-platform, native where it matters

The app is built with React Native and Expo, sharing a single TypeScript codebase across iOS and Android. Performance-critical work — GGUF loading, token generation, encrypted storage, and background downloads — runs through native modules and JSI bridges rather than JavaScript.

### Security as a first-class concern

Chat persistence is designed around SQLCipher (via `@op-engineering/op-sqlite`) with keys stored in the platform secure enclave (`expo-secure-store`). Model binaries are written to the OS document directory, which is durable and not subject to cache eviction.

---

## Technical Stack

| Layer | Technology | Role |
|---|---|---|
| **Framework** | React Native 0.83 + Expo 54 | Cross-platform app shell, native prebuild workflow |
| **Language** | TypeScript | Shared application logic |
| **Navigation** | React Navigation 7 | Tab + stack navigation (Models, Chats, Settings) |
| **Inference** | [`llama.rn`](https://github.com/mybigday/llama.rn) | JSI bridge to llama.cpp for on-device GGUF inference |
| **Model format** | GGUF (Q4_K_M preferred) | Quantized weights optimized for mobile RAM/CPU |
| **Model source** | Hugging Face Hub API | Model discovery and file download only |
| **Background downloads** | `@kesha-antonov/react-native-background-downloader` | Resumable, OS-managed large file transfers |
| **File storage** | `expo-file-system` | Persistent model file storage in `documentDirectory` |
| **Model metadata** | `@react-native-async-storage/async-storage` | Downloaded model registry (paths, status, timestamps) |
| **Chat database** | `@op-engineering/op-sqlite` + SQLCipher | Encrypted local message storage |
| **Key management** | `expo-secure-store` + `expo-crypto` | Hardware-backed encryption key vault |
| **Chat UI** | `react-native-gifted-chat` | Conversational message interface (in progress) |
| **Linting** | Biome | Formatting and static analysis |

### Native architecture

Pocket LLM uses Expo's **prebuild workflow** with checked-in `ios/` and `android/` directories. Native plugins are configured in `app.json`:

- **`llama.rn`** — links the llama.cpp runtime for GGUF inference via JSI
- **`@kesha-antonov/react-native-background-downloader`** — native background download tasks with pause/resume

The New Architecture (`newArchEnabled: true`) is enabled for improved JSI performance with native modules.

---

## Current State

This section reflects what is implemented in the codebase today. Update it as features land.

### Implemented

| Area | Status | Notes |
|---|---|---|
| App shell & tab navigation | Done | Models, Chats, and Settings tabs via `CentralNavigator` |
| Hugging Face model discovery | Done | Fetches Q4 GGUF models ranked by downloads |
| GGUF file resolution | Done | Two-step lookup with community-clone fallback; prefers `q4_k_m` quantization |
| Background model downloads | Done | Progress tracking, pause/resume, re-attach on app restart |
| Downloaded model management | Done | List, delete, and metadata persistence via AsyncStorage |
| Model picker in chat | Done | Select from locally downloaded models |
| llama.rn inference helpers | Done | `initializeModel`, `initiateChat`, `releaseModel` in `chatHelper.ts` |
| SQLCipher database layer | Done | Schema and CRUD in `ChatDB.ts`; key vault in `db/index.ts` |
| Chat list UI | Partial | Renders mock conversations from in-memory store |
| Chat screen UI | Partial | `react-native-gifted-chat` integrated; not yet wired to store or inference |
| Settings screen | Placeholder | Static info cards |

### Not yet wired

- **Database boot** — `initializeAllDatabases()` exists but is not called at app startup
- **Chat persistence** — `chatStore` uses mock data; no reads/writes to SQLCipher
- **Live inference** — `chatStore.sendMessage` returns a stub response; `chatHelper` is not connected to the chat flow
- **Chat ↔ model binding** — Selecting a model in `ModelPicker` does not trigger `initializeModel`
- **Model details screen** — `ModelDetails.tsx` is an empty stub
- **Unified API client** — `apiClient.ts` exists; model screens currently use direct `fetch` calls

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     React Native UI                     │
│  ModelsScreen · ChatScreen · ChatListScreen · Settings  │
└────────────┬──────────────────────────────┬─────────────┘
             │                              │
    ┌────────▼────────┐            ┌────────▼────────┐
    │  Model Pipeline │            │   Chat Pipeline  │
    │                 │            │                  │
    │ HF API (fetch)  │            │  chatStore (JS)  │
    │ downloadHelpers │            │  GiftedChat UI   │
    │ useModelDownloader           │  ModelPicker     │
    │ modelStorage    │            │  chatHelper (*)  │
    └────────┬────────┘            └────────┬─────────┘
             │                              │
    ┌────────▼────────┐            ┌────────▼─────────┐
    │ Native Modules  │            │  Secure Storage   │
    │                 │            │                   │
    │ background-     │            │  op-sqlite +      │
    │ downloader      │            │  SQLCipher (*)    │
    │ expo-file-system│            │  expo-secure-store│
    │ llama.rn (JSI)  │            │                   │
    └─────────────────┘            └───────────────────┘

(*) Built but not yet connected to the app lifecycle
```

### Model download workflow

1. **Discover** — Query the Hugging Face Hub for GGUF models (`ModelsScreen`)
2. **Resolve** — Fetch model details, inspect the `siblings` array, and select a Q4_K_M file (with community-clone fallback) via `getDownloadUrlForModel`
3. **Download** — Transfer the file to `FileSystem.documentDirectory` using the background downloader
4. **Persist** — Save model metadata (local path, status, timestamp) to AsyncStorage
5. **Infer** — Pass the local file URI to `llama.rn` via `initLlama` (helpers ready; integration pending)

### Chat data flow (target)

1. **Boot** — Generate or retrieve an AES key from SecureStore; open the SQLCipher database
2. **Load** — Hydrate conversations and messages from the encrypted database into the chat store
3. **Send** — User message → persist to DB → call `initiateChat` → stream/store assistant reply
4. **Release** — Free llama context from memory when switching models or leaving a session

---

## Roadmap

Roadmap items are ordered by priority. Check them off as they ship and add new items as the project evolves.

### Phase 1 — Foundation (current)

- [ ] **Responsive chat interface** — Finish GiftedChat integration; connect to `chatStore` for send/receive; support keyboard avoidance and message streaming
- [ ] **Database boot at startup** — Call `initializeAllDatabases()` from the initial/splash screen before entering the main app
- [ ] **Chat session persistence** — Wire `chatStore` to `ChatDB` for create/read/update of conversations and messages
- [ ] **Inference integration** — Connect `ModelPicker` → `initializeModel` → `initiateChat` in the chat send flow; replace stub responses

### Phase 2 — Model management

- [ ] **Model details screen** — Show available quantizations, estimated size, and RAM requirements before download
- [ ] **Download resume across restarts** — Reconcile pending downloads on cold start via `retreiveCompletedDownloads`
- [ ] **Model validation** — Verify downloaded GGUF integrity before passing to the inference engine
- [ ] **Storage management** — Surface total disk usage and provide bulk delete in Settings

### Phase 3 — Production readiness

- [ ] **Token streaming** — Stream assistant tokens to the UI via the `llama.rn` completion callback
- [ ] **Conversation management** — Create, rename, and delete conversations; search history
- [ ] **Authenticated Hugging Face access** — Support private/gated model repositories
- [ ] **Device capability detection** — Recommend quantizations based on available RAM and GPU layers
- [ ] **Error handling & offline UX** — Graceful degradation when no model is downloaded or inference fails

---

## Setup

Development environment setup for macOS. Android builds can also be run from macOS via the Android SDK.

### Prerequisites

| Tool | Purpose |
|---|---|
| [Node.js](https://nodejs.org/) (LTS) | JavaScript runtime and npm |
| [Xcode](https://developer.apple.com/xcode/) | iOS builds and Simulator |
| [CocoaPods](https://cocoapods.org/) | iOS native dependency management |
| [Android Studio](https://developer.android.com/studio) | Android SDK, emulator, and builds |
| [Homebrew](https://brew.sh/) | Package manager for macOS tooling |

### Install

```bash
# Clone and enter the project
git clone <repository-url> PocketLLM
cd PocketLLM

# Install JavaScript dependencies
npm install

# Install iOS native dependencies
brew install cocoapods
npx pod-install --repo-update
```

### Run

```bash
# Start the Metro bundler
npm start

# iOS (Simulator or connected device)
npm run ios
# or: npx expo run:ios

# Android (emulator or connected device)
npm run android
# or: npx expo run:android
```

> Pocket LLM requires a **development build** (not Expo Go) because it depends on native modules (`llama.rn`, background downloader, op-sqlite with SQLCipher). Always use `expo run:ios` or `expo run:android` to compile the native project.

### Android emulator shortcut

A convenience script launches the `Pixel_10_Pro_XL` AVD:

```bash
npm run launch-android-emulator
```

---

## Project Structure

```
PocketLLM/
├── App.tsx                          # Root component, provider wiring
├── app.json                         # Expo config and native plugin declarations
├── ios/                             # iOS native project (CocoaPods)
├── android/                         # Android native project (Gradle)
└── src/
    ├── api/
    │   └── apiClient.ts             # Hugging Face HTTP helper (timeout-aware)
    ├── components/
    │   ├── ChatBubble.tsx           # Message bubble component
    │   ├── ModelCard.tsx            # Model list card with download UI
    │   ├── ModelPicker.tsx          # Downloaded model selector for chat
    │   ├── PrimaryButton.tsx
    │   └── TagChip.tsx
    ├── constants/
    │   └── theme.ts                 # Colors, spacing, typography tokens
    ├── data/
    │   └── mockChats.ts             # Placeholder conversations (to be replaced)
    ├── db/
    │   ├── ChatDB.ts                # SQLCipher database manager (singleton)
    │   └── index.ts                 # Key vault + database boot orchestrator
    ├── navigation/
    │   ├── CentralNavigator.tsx     # Root stack + tab + sub-stack navigators
    │   └── types.ts                 # Navigation param lists
    ├── screens/
    │   ├── InitialScreen.tsx        # Splash / boot screen
    │   ├── chats/
    │   │   ├── ChatListScreen.tsx   # Conversation list
    │   │   └── ChatScreen.tsx       # Active chat (GiftedChat)
    │   ├── models/
    │   │   ├── ModelsScreen.tsx     # Hugging Face model discovery
    │   │   ├── DownloadedModelsScreen.tsx
    │   │   └── ModelDetails.tsx     # (stub)
    │   └── settings/
    │       └── SettingsScreen.tsx
    ├── services/
    │   ├── chatHelper.ts            # llama.rn init / completion / release
    │   ├── downloadHelpers.ts       # GGUF URL resolution logic
    │   └── useModelDownloader.ts    # Background download hook
    ├── storage/
    │   └── modelStorage.ts          # AsyncStorage model registry
    ├── stores/
    │   └── chatStore.ts             # In-memory chat state (mock data)
    ├── types/
    │   ├── chat.ts                  # Conversation and message types
    │   └── models.ts                # Hugging Face model types
    └── utils/
        └── parseModelId.ts          # Model ID parsing and formatting
```

---

## Contributing & Maintenance

This README is intentionally modular. When adding a feature:

1. Update the **Current State** table to reflect what shipped.
2. Check off completed items in the **Roadmap**.
3. Add new roadmap items under the appropriate phase.
4. Extend **Project Structure** if new top-level directories or modules are introduced.

For AI-assisted development, see `AGENTS.md` for project-specific conventions.

---

## License

TBD
