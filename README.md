# 📱 PocketLLM

[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo)](https://docs.expo.dev/versions/v54.0.0/)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-TBD-lightgrey)](#license)

**PocketLLM** is a privacy-first, offline-capable AI assistant for iOS and Android. It runs quantized language models entirely on your device—no cloud inference backend, no chat data leaving the phone. Discover GGUF models from Hugging Face, download them in the background, and chat with streaming responses powered by local inference.

---

## ✨ Key Features

- **Local GGUF chat streaming** — Load quantized GGUF models with [`llama.rn`](https://github.com/mybigday/llama.rn) and stream tokens into a Gifted Chat UI on-device.
- **Encrypted local persistence** — Conversations and model metadata live in SQLCipher-backed SQLite via [`op-sqlite`](https://github.com/OP-Engineering/op-sqlite), with keys stored in the platform secure store.
- **Optional web-aware answers** — When configured, the chat stack can call tools (e.g. Tavily search) so the on-device model can ground answers in live information without sending your full chat history to a third-party LLM host.
- **Hugging Face model discovery** — Browse, filter, and sort GGUF models; resolve preferred quantizations; and download large files with pause/resume support.
- **Local model storage management** — Persist downloads under the app document directory, list completed models, pick one per conversation, and delete files you no longer need.
- **Cross-platform native shell** — Single TypeScript codebase with Expo prebuild, React Navigation tabs (Models, Chats, Settings), and New Architecture enabled for JSI-friendly native modules.

> **Roadmap note:** On-device RAG / vector retrieval over chat history and ExecuTorch (`.pte`) voice & vision pipelines are planned product directions. Current shipping inference for chat is GGUF via `llama.rn`.

---

## 🛠️ Tech Stack

| Category | Technology |
|---|---|
| **Framework** | Expo SDK 54, React Native 0.81, React 19, TypeScript 5.9 |
| **AI engine** | [`llama.rn`](https://github.com/mybigday/llama.rn) (llama.cpp / GGUF); planned: [`react-native-executorch`](https://github.com/software-mansion/react-native-executorch) for edge voice/vision (`.pte`) |
| **Database** | `@op-engineering/op-sqlite` + SQLCipher; `expo-secure-store` + `expo-crypto` for key material |
| **Downloads & files** | `@kesha-antonov/react-native-background-downloader`, `expo-file-system` |
| **Model registry** | Hugging Face Hub API (discovery & download only) |
| **Navigation & UI** | React Navigation 7, Gifted Chat, React Query, Reanimated, Keyboard Controller, Biome |

---

## 🚀 Getting Started

### Prerequisites

| Tool | Purpose |
|---|---|
| [Node.js](https://nodejs.org/) (LTS) | JavaScript runtime and npm |
| [Xcode](https://developer.apple.com/xcode/) + CocoaPods | iOS Simulator / device builds |
| [Android Studio](https://developer.android.com/studio) | Android SDK, emulator, and Gradle builds |

> **Expo Go is not supported.** PocketLLM depends on custom native modules (`llama.rn`, background downloader, SQLCipher). Use a **development build** via `expo run:ios` / `expo run:android`.

### Installation

```bash
git clone <repository-url> PocketLLM
cd PocketLLM

npm install

# iOS native deps (macOS)
npx pod-install --repo-update
```

### Run

```bash
# Metro bundler
npm start

# Native apps
npm run ios      # or: npx expo run:ios
npm run android  # or: npx expo run:android
```

Optional Android emulator helper (adjust AVD name as needed):

```bash
npm run launch-android-emulator
```

### Environment (optional)

Copy `.env.example` to `.env.local` for optional services (e.g. Sentry, Tavily web search). Restart Metro with a clean cache after changing env vars:

```bash
cp .env.example .env.local
npx expo start -c
```

---

## 📁 Model Setup (.gguf & .pte)

### GGUF chat models (supported today)

1. Open the **Models** tab and browse Hugging Face GGUF listings (filter / sort as needed).
2. Choose a text-generation GGUF (prefer mobile-friendly quants such as **Q4_K_M** when available). Avoid vision-projector / `mmproj` files for chat.
3. Start a download. Transfers use the OS background downloader and land under the app’s durable document directory.
4. Open **Chats**, create or select a conversation, pick a downloaded model in the model selector, and send a message. Tokens stream from the local `llama.rn` context.

You can also manage completed downloads from the downloaded-models screen (open / delete).

### ExecuTorch `.pte` assets (planned)

Edge AI voice and vision workflows are intended to use ExecuTorch program (`.pte`) files via `react-native-executorch`. When that path lands:

1. Place or download `.pte` assets into the app’s managed storage (alongside existing model files).
2. Select the asset from Settings / Models for the matching modality (ASR, VLM, etc.).
3. Run inference through the ExecuTorch native module—not through the GGUF chat path.

Until ExecuTorch integration ships, chat inference uses **GGUF only**.

---

## 📂 Project Architecture

```
PocketLLM/
├── App.tsx                      # Root providers, DB boot, navigation shell
├── app.config.js / app.json     # Expo config & native plugins
├── ios/ · android/              # Prebuild native projects
└── src/
    ├── api/                     # HTTP helpers (e.g. Hugging Face client)
    ├── components/              # Reusable UI (ModelCard, ModelPicker, chat bubbles, …)
    ├── config/                  # API & env helpers
    ├── constants/               # Theme tokens, copy, filters
    ├── db/                      # ChatDB + ModelDB (SQLCipher), boot / key vault
    ├── hooks/                   # Hugging Face list, filter/sort hooks
    ├── navigation/              # Root, tabs, stacks (Models · Chats · Settings)
    ├── screens/
    │   ├── chats/               # Chat list + conversation (Gifted Chat)
    │   ├── models/              # Discover, details, downloaded models
    │   └── settings/            # App & device info
    ├── services/
    │   ├── inference/           # llama.rn runtime, chat completion, tool parsing
    │   ├── HuggingFaceService.ts
    │   ├── downloadHelpers.ts
    │   ├── useModelDownloader.ts
    │   └── tavilySearch.ts      # Optional HTTPS search for tool calling
    ├── stores/                  # chatStore (conversations & send pipeline)
    ├── types/                   # Domain types (chat, models)
    └── utils/                   # GGUF selection, Gifted Chat adapters, formatting
```

### High-level data flow

1. **Discover** — Hugging Face API → Models screens  
2. **Download** — Background downloader → document storage + Model DB  
3. **Chat** — Select GGUF → `initializeModel` → streamed `chatCompletion` → Chat DB  
4. **Optional tools** — Model may request `web_search` → app calls Tavily → second completion streams the grounded reply  

---

## License

TBD
