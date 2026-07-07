# PocketLLM — Testing Guide

This document defines **what to test before production** and how tests are organized in this repo. Use it as the single source of truth when adding or reviewing tests.

---

## Goals

- Catch **data loss**, **broken downloads**, and **inference failures** before release.
- Prefer **high-value tests** over exhaustive line coverage.
- Keep tests **lean**: shared helpers in `__tests__/testUtils.ts`, one test file per screen where practical.

**Target before production:** ~25–35 meaningful tests. Minimum bar: every item in **Production Gate** sections 1, 2, and 6 below must have at least one test.

---

## Test infrastructure

| Piece | Location | Purpose |
|---|---|---|
| Jest config | `jest.config.js` | `@/` → `src/`, `@tests/` → `__tests__/` |
| Global mocks | `jest.setup.ts` | op-sqlite, reanimated, gesture-handler, downloader, file-system |
| Shared helpers | `__tests__/testUtils.ts` | `mockExecute`, `buildCompletedModel`, `mockChatStore`, query builders |
| Path aliases | `tsconfig.json` | `@/*` → `src/*`, `@tests/*` → `__tests__/*` |

### Import conventions

```typescript
import { ChatScreenLabels } from "@/constants/chat";
import { mockChatStore } from "@tests/testUtils";
```

### Run tests

```bash
npm run test
npm run test:watch
```

---

## Existing tests (baseline)

| File | Count | Coverage |
|---|---|---|
| `src/screens/chats/__tests__/ChatListScreen.test.tsx` | 3 | Empty state, row render, create chat navigation |
| `src/screens/chats/__tests__/ChatScreen.test.tsx` | 3 | Model picker, sendMessage dispatch, SQLite persist pipeline |
| `src/screens/models/__tests__/ModelScreen.test.tsx` | 4 | Loading, success list, no loading flash, fetch error |
| `src/db/__tests__/modelDB.test.ts` | 4 | saveDownloadedModel upsert + metadata |

**Total today:** 14 tests.

---

## Production gate — write these before release

### 1. Chat — core user journey (highest priority)

| Test | Why | Status |
|---|---|---|
| Send message → user row persisted in SQLite | Data loss = broken app | Partial (integration test exists) |
| Send message → assistant row persisted after inference | Core value prop | Partial |
| Inference failure → user sees error, state stays consistent | No silent failures | Pending |
| Send blocked when no model selected | Prevents broken inference | Partial (picker shown) |
| Send blocked while already sending | Race / duplicate messages | Pending |
| Continue truncated response → merged text persisted | Real edge case | Pending |
| Delete conversation → removed from DB and list | Orphan data | Pending |
| Open existing chat → loads messages from DB | History must work | Pending |
| Conversation title/preview updated after first message | List metadata | Pending |

### 2. Model download & storage

| Test | Why | Status |
|---|---|---|
| Download completes → `saveDownloadedModel` uses **`location`** from done callback | Wrong path = unusable model | Pending |
| Completed download → readable as `downloadInfo.status === 'completed'` | Open vs Download UI | Pending |
| Re-download same model → upsert updates path/size | No duplicate/corrupt rows | Done |
| Delete downloaded model → row removed, UI updates | Storage leaks | Pending |
| No valid GGUF sibling → download URL null, no crash | Bad catalog entries | Pending |
| `resolveDownloadedModelPath` finds file for downloaded model | Chat can't run without this | Pending |

### 3. Inference & chat helper layer

| Test | Why | Status |
|---|---|---|
| `buildChatContextFromHistory` — correct roles/order | Wrong context = bad replies | Pending |
| `classifyInferenceError` — user-safe messages | Raw errors in UI | Pending |
| `validateModelForInference` — rejects missing file | Crash on missing gguf | Pending |
| `stripReasoningTags` / `sanitizeAssistantResponse` | Leaked tags in chat UI | Pending |

### 4. Model catalog (Models screen)

| Test | Why | Status |
|---|---|---|
| Loading / error / success states | Network failures | Done |
| Download starts for undownloaded model | Primary action | Pending |
| Downloaded model shows Open, not Download | Correct CTA | Pending |
| Filter/sort does not hide all models incorrectly | List regression | Pending |

### 5. Pure utils (cheap, high leverage)

| Test | Why | Status |
|---|---|---|
| `getLanguageModelGgufFilename` picks LM file, not mmproj/vision | Wrong file downloaded | Pending |
| `parseModelId` / `formatFileSize` | Display correctness | Pending |
| `deriveConversationTitle` / `buildConversationPreview` | Chat list metadata | Pending |

### 6. DB layer (ChatDB + ModelDB)

| Test | Why | Status |
|---|---|---|
| ChatDB: create/read/update/delete conversations + messages | Chat foundation | Pending |
| ModelDB: save/read/delete downloaded models | Model foundation | Partial (save only) |
| `initializeAllDatabases` succeeds | App boot | Pending |

### 7. Minimal UI regression guards

| Test | Why | Status |
|---|---|---|
| ChatList empty state + create new chat | Onboarding | Done |
| ChatScreen model picker when no model | Blocks broken sends | Done |
| `Keyboard.dismiss` on send (`jest.spyOn(Keyboard, "dismiss")`) | UX regression | Pending |

---

## Defer until post-v1 (or E2E/manual)

- Settings / InitialScreen static content
- Empty `ModelDetails` stub
- Component smoke tests (PrimaryButton, TagChip, ChatBubble)
- Full navigator wiring tests
- Sentry / logger internals
- Real keyboard animation, live network downloads, on-device llama.rn inference

Use **Detox / Maestro / manual QA** for native behavior Jest cannot simulate.

---

## What not to over-test

- Every `Keyboard.dismiss` call site (one send-path test is enough)
- Static copy on Settings screen
- Trivial presentational components with no logic
- 100% line coverage for its own sake

---

## Adding new tests — patterns

### Screen test (mocked store/API)

```typescript
jest.mock("@/stores/chatStore", () => {
  const actual = jest.requireActual("@/stores/chatStore");
  return { ...actual, useChatStore: jest.fn(actual.useChatStore) };
});

import { mockChatStore, restoreRealChatStore } from "@tests/testUtils";
```

### Pure util test

Test the function directly — no mocks, fast, high ROI.

### DB test

Use `mockExecute` from `@tests/testUtils` (wired in `jest.setup.ts` to op-sqlite mock).

### Keyboard side effect

```typescript
const dismissSpy = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
// ... trigger send ...
expect(dismissSpy).toHaveBeenCalled();
dismissSpy.mockRestore();
```

---

## Priority order for new work

1. **chatStore** send/delete/load pipeline  
2. **ChatDB** CRUD  
3. **useModelDownloader** + downloadHelpers  
4. Remaining **ChatListScreen** / **ChatScreen** UI flows  
5. **Pure utils** (gguf selection, reasoning filter, parseModelId)  
6. **ModelsScreen** download states + filters  

---

## Agent / reviewer reminder

When asked *"what tests should we add?"* or *"are we ready for production?"* — check **Production gate** tables above. Sections **1, 2, and 6** must be green before release.
