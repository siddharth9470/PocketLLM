import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import {
  buildCompletedModel,
  buildReadyConversation,
  MOCK_NEW_CONVERSATION_ID,
  mockChatStore,
  mockExecute,
  restoreRealChatStore,
} from "@tests/testUtils";
import { ChatScreenLabels } from "@/constants/chat";
import { chatDb } from "@/db/ChatDB";
import { getDownloadedModelsList } from "@/db/ModelDB";
import ChatScreen from "@/screens/chats/ChatScreen";
import { chatCompletion, initializeModel, releaseModel, resolveDownloadedModelPath } from "@/services/chatHelper";
import { ChatStoreProvider } from "@/stores/chatStore";

jest.mock("@/stores/chatStore", () => {
  const actual = jest.requireActual("@/stores/chatStore") as typeof import("@/stores/chatStore");
  return {
    ...actual,
    useChatStore: jest.fn(actual.useChatStore),
  };
});
// The orchestrator owns SecureStore / crypto / orphan-file cleanup, none of which belong in a screen
// test; background embedding only needs it to resolve. `modelDb` is stubbed too because `@/db/index`
// consumes the manager instance directly, and an incomplete mock surfaces as an undefined `initialize`.
jest.mock("@/db", () => ({
  ensureDatabaseReady: jest.fn().mockResolvedValue(undefined),
  initializeAllDatabases: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/db/ModelDB", () => ({
  modelDb: { initialize: jest.fn().mockResolvedValue(undefined) },
  getDownloadedModelsList: jest.fn(),
}));
jest.mock("@/services/chatHelper", () => ({
  initializeModel: jest.fn(),
  releaseModel: jest.fn(),
  resolveDownloadedModelPath: jest.fn(),
  chatCompletion: jest.fn(),
}));
jest.mock("@/utils/chatIds", () => {
  let chatIdCounter = 0;
  return {
    generateChatId: jest.fn(() => {
      chatIdCounter += 1;
      return `chat-id-${chatIdCounter}`;
    }),
    deriveConversationTitle: (prompt: string) => prompt.trim().slice(0, 50),
  };
});
jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    useFocusEffect: (callback: () => undefined | (() => void)) => {
      React.useEffect(() => callback(), []);
    },
  };
});
jest.mock("@react-navigation/elements", () => ({
  useHeaderHeight: () => 0,
}));
jest.mock("react-native-keyboard-controller", () => {
  const RN = require("react-native");
  return {
    KeyboardAvoidingView: RN.View,
    KeyboardProvider: ({ children }: { children: unknown }) => children,
  };
});
jest.mock("@expo/react-native-action-sheet", () => ({
  ActionSheetProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  return {
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    SafeAreaView: RN.View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const GIFTED_CHAT_WRAPPER_TEST_ID = "GC_WRAPPER";
const GIFTED_CHAT_SEND_TEST_ID = "GC_SEND_TOUCHABLE";
const MOCK_MODEL = buildCompletedModel();
const MOCK_MODEL_PATH = "/mock/path.gguf";
const MOCK_USER_PROMPT = "What is on-device inference?";
const MOCK_ASSISTANT_RESPONSE = "On-device inference runs the model locally on your phone.";

const navigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

const buildChatRoute = (conversationId: string) => ({
  key: "Chat",
  name: "Chat" as const,
  params: { conversationId, title: ChatScreenLabels.NEW_CHAT_TITLE },
});

const chatRoute = buildChatRoute(MOCK_NEW_CONVERSATION_ID);
const dbSyncRoute = buildChatRoute("conv-db-sync");

/** Bound parameters of every execute whose SQL contains `sqlFragment`, in call order. */
function getInsertParams(sqlFragment: string): unknown[][] {
  return mockExecute.mock.calls
    .filter(([sql]) => String(sql).includes(sqlFragment))
    .map(([, params]) => params as unknown[]);
}

async function mountChatScreen(route = chatRoute) {
  return render(<ChatScreen navigation={navigation as never} route={route as never} />);
}

/** Mounts inside the real store provider and waits for Gifted Chat to be on screen. */
async function mountChatScreenWithProvider(route = chatRoute) {
  const view = await render(
    <ChatStoreProvider>
      <ChatScreen navigation={navigation as never} route={route as never} />
    </ChatStoreProvider>,
  );
  await screen.findByTestId(GIFTED_CHAT_WRAPPER_TEST_ID);
  return view;
}

/** Gifted Chat only renders its composer once the wrapper has reported a layout. */
async function layoutGiftedChat() {
  const wrapper = await screen.findByTestId(GIFTED_CHAT_WRAPPER_TEST_ID);
  await fireEvent(wrapper, "layout", { nativeEvent: { layout: { height: 600, width: 400, x: 0, y: 0 } } });
}

async function selectDownloadedModel() {
  const [modelTrigger] = screen.getAllByText(ChatScreenLabels.MODEL_SELECT_TITLE);
  await fireEvent.press(modelTrigger);
  await fireEvent.press(await screen.findByText("gemma-2b-q4"));
}

async function typeAndSendMessage(prompt: string) {
  await layoutGiftedChat();

  const composer = await screen.findByTestId(ChatScreenLabels.COMPOSER_PLACEHOLDER);
  await fireEvent.changeText(composer, prompt);
  await waitFor(() => expect(composer.props.value).toBe(prompt));

  await fireEvent.press(await screen.findByTestId(GIFTED_CHAT_SEND_TEST_ID));
}

/** Backs `mockExecute` with an in-memory conversation/message store so reads observe prior writes. */
function installTrackedSqlMock() {
  const trackedConversations = new Set<string>();
  const trackedMessages: Array<{ role: string; content: string; conversationId: string }> = [];

  mockExecute.mockImplementation(async (sql: string, params?: unknown[]) => {
    const query = String(sql);
    if (query.includes("INSERT INTO conversations")) {
      trackedConversations.add(String(params?.[0]));
      return { rows: [], rowsAffected: 1 };
    }
    if (query.includes("SELECT id FROM conversations WHERE id")) {
      const conversationId = String(params?.[0]);
      return {
        rows: trackedConversations.has(conversationId) ? [{ id: conversationId }] : [],
        rowsAffected: 0,
      };
    }
    if (query.includes("INSERT INTO chat_messages")) {
      trackedMessages.push({
        role: String(params?.[2]),
        content: String(params?.[3]),
        conversationId: String(params?.[1]),
      });
      return { rows: [], rowsAffected: 1 };
    }
    if (query.includes("SELECT * FROM chat_messages")) {
      const conversationId = String(params?.[0]);
      return {
        rows: trackedMessages
          .filter((message) => message.conversationId === conversationId)
          .map((message) => ({
            id: "row-id",
            conversation_id: message.conversationId,
            role: message.role,
            content: message.content,
            status: "completed",
            created_at: "2024-06-01T10:00:00.000Z",
            error: null,
            truncated: 0,
            tokens_per_second: null,
            prompt_tokens: null,
            completion_tokens: null,
            total_time_ms: null,
          })),
        rowsAffected: 0,
      };
    }
    return { rows: [], rowsAffected: 1 };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  restoreRealChatStore();
  mockExecute.mockClear();
  mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1 });

  jest.mocked(getDownloadedModelsList).mockResolvedValue([MOCK_MODEL]);
  jest.mocked(resolveDownloadedModelPath).mockResolvedValue(MOCK_MODEL_PATH);
  jest.mocked(initializeModel).mockResolvedValue(undefined);
  jest.mocked(releaseModel).mockResolvedValue(undefined);
});

describe("ChatScreen", () => {
  it("shows the model selector when no model is assigned", async () => {
    mockChatStore({
      conversationDetails: {
        [MOCK_NEW_CONVERSATION_ID]: { ...buildReadyConversation(MOCK_MODEL), modelId: "" },
      },
    });

    await mountChatScreen();

    expect(screen.getAllByText(ChatScreenLabels.MODEL_SELECT_TITLE).length).toBeGreaterThan(0);
  });

  it("dispatches the typed message through sendMessage when Gifted Chat send is pressed", async () => {
    const store = mockChatStore({
      conversationDetails: { [MOCK_NEW_CONVERSATION_ID]: buildReadyConversation(MOCK_MODEL) },
    });

    await mountChatScreen();
    await typeAndSendMessage(MOCK_USER_PROMPT);

    await waitFor(() => {
      expect(store.sendMessage).toHaveBeenCalledWith(
        MOCK_NEW_CONVERSATION_ID,
        MOCK_USER_PROMPT,
        expect.objectContaining({ modelId: MOCK_MODEL.id }),
      );
    });
  });
});

describe("Messaging pipeline and database sync", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(async () => {
    await chatDb.initialize("test-hardware-key");
  });

  beforeEach(() => {
    installTrackedSqlMock();
    // Recorded, not silenced: real failures stay visible in the test output.
    consoleErrorSpy = jest.spyOn(console, "error");
    jest.mocked(chatCompletion).mockImplementation(async (_prompt, onToken) => {
      onToken?.("On-device ");
      onToken?.(MOCK_ASSISTANT_RESPONSE);
      return { text: MOCK_ASSISTANT_RESPONSE };
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  /** Drives a full send from an empty conversation through to chat completion. */
  async function sendFirstMessage() {
    await mountChatScreenWithProvider(dbSyncRoute);

    if (screen.queryAllByText(ChatScreenLabels.MODEL_SELECT_TITLE).length > 0) {
      await selectDownloadedModel();
    }

    await typeAndSendMessage(MOCK_USER_PROMPT);
  }

  it("persists user and assistant messages after chat completion", async () => {
    await sendFirstMessage();

    await waitFor(() => {
      const inserts = getInsertParams("INSERT INTO chat_messages");
      expect(inserts.find((params) => params[2] === "user")?.[3]).toBe(MOCK_USER_PROMPT);
      expect(inserts.find((params) => params[2] === "assistant")?.[3]).toBe(MOCK_ASSISTANT_RESPONSE);
      expect(inserts.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("stores background embeddings for both turns without logging a failure", async () => {
    await sendFirstMessage();

    await waitFor(() => {
      expect(getInsertParams("INSERT INTO message_embeddings").length).toBeGreaterThanOrEqual(2);
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
