import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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
import { initializeModel, releaseModel, resolveDownloadedModelPath, runInference } from "@/services/chatHelper";
import { ChatStoreProvider } from "@/stores/chatStore";

jest.mock("@/stores/chatStore", () => {
  const actual = jest.requireActual("@/stores/chatStore") as typeof import("@/stores/chatStore");
  return {
    ...actual,
    useChatStore: jest.fn(actual.useChatStore),
  };
});
jest.mock("@/db/ModelDB", () => ({
  getDownloadedModelsList: jest.fn(),
}));
jest.mock("@/services/chatHelper", () => ({
  initializeModel: jest.fn(),
  releaseModel: jest.fn(),
  resolveDownloadedModelPath: jest.fn(),
  runInference: jest.fn(),
  runContinueInference: jest.fn(),
  buildChatContextFromHistory: jest.fn((messages: Array<{ role: string; content: string }>) =>
    messages.map((message) => ({ role: message.role, content: message.content })),
  ),
  classifyInferenceError: jest.fn((error: unknown) => ({
    userMessage: "Sorry, something went wrong generating a response.",
    logMessage: String(error),
  })),
}));
jest.mock("@/utils/chatIds", () => ({
  generateChatId: jest.fn(() => `chat-id-${Date.now()}`),
  deriveConversationTitle: (prompt: string) => prompt.trim().slice(0, 50),
}));
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
jest.mock("@expo/vector-icons", () => {
  const { Text } = require("react-native");
  return { Ionicons: Text };
});
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
jest.mock("react-native-gesture-handler", () => {
  const RN = require("react-native");
  return {
    Swipeable: RN.View,
    DrawerLayout: RN.View,
    State: {},
    ScrollView: RN.ScrollView,
    Slider: RN.View,
    Switch: RN.View,
    TextInput: RN.TextInput,
    ToolbarAndroid: RN.View,
    ViewPagerAndroid: RN.View,
    DrawerLayoutAndroid: RN.View,
    WebView: RN.View,
    NativeViewGestureHandler: RN.View,
    TapGestureHandler: RN.View,
    FlingGestureHandler: RN.View,
    ForceTouchGestureHandler: RN.View,
    LongPressGestureHandler: RN.View,
    PanGestureHandler: RN.View,
    PinchGestureHandler: RN.View,
    RotationGestureHandler: RN.View,
    RawButton: RN.View,
    BaseButton: RN.View,
    RectButton: RN.View,
    BorderlessButton: RN.View,
    FlatList: RN.FlatList,
    gestureHandlerRootHOC: jest.fn((component: unknown) => component),
    Directions: {},
    GestureHandlerRootView: RN.View,
  };
});

const GIFTED_CHAT_SEND_TEST_ID = "GC_SEND_TOUCHABLE";
const MOCK_MODEL = buildCompletedModel();
const MOCK_USER_PROMPT = "What is on-device inference?";
const MOCK_ASSISTANT_RESPONSE = "On-device inference runs the model locally on your phone.";

const navigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

const chatRoute = {
  key: "Chat",
  name: "Chat" as const,
  params: { conversationId: MOCK_NEW_CONVERSATION_ID, title: ChatScreenLabels.NEW_CHAT_TITLE },
};

const dbSyncRoute = {
  key: "Chat",
  name: "Chat" as const,
  params: { conversationId: "conv-db-sync", title: ChatScreenLabels.NEW_CHAT_TITLE },
};

function getChatMessageInserts(): unknown[][] {
  return mockExecute.mock.calls
    .filter(([sql]) => String(sql).includes("INSERT INTO chat_messages"))
    .map(([, params]) => params as unknown[]);
}

function mountChatScreen() {
  return render(<ChatScreen navigation={navigation as never} route={chatRoute as never} />);
}

async function mountChatScreenWithProvider(route = chatRoute) {
  let view: ReturnType<typeof render> | undefined;
  await act(async () => {
    view = render(
      <ChatStoreProvider>
        <ChatScreen navigation={navigation as never} route={route as never} />
      </ChatStoreProvider>,
    );
  });
  await waitFor(() => expect(screen.getByTestId("GC_WRAPPER")).toBeTruthy());
  return view as ReturnType<typeof render>;
}

async function initializeGiftedChat() {
  const wrapper = await waitFor(() => screen.getByTestId("GC_WRAPPER"));
  await act(async () => {
    fireEvent(wrapper, "layout", {
      nativeEvent: { layout: { height: 600, width: 400, x: 0, y: 0 } },
    });
  });
}

async function selectDownloadedModel() {
  const [modelTrigger] = screen.getAllByText(ChatScreenLabels.MODEL_SELECT_TITLE);
  await act(async () => {
    fireEvent.press(modelTrigger);
  });
  const modelOption = await screen.findByText("gemma-2b-q4");
  await act(async () => {
    fireEvent.press(modelOption);
  });
}

async function typeAndSendMessage(prompt: string) {
  await initializeGiftedChat();
  const composer = await screen.findByTestId(ChatScreenLabels.COMPOSER_PLACEHOLDER);
  await act(async () => {
    fireEvent.changeText(composer, prompt);
  });
  await waitFor(() => expect(composer.props.value).toBe(prompt));

  const sendButton = await screen.findByTestId(GIFTED_CHAT_SEND_TEST_ID);
  await act(async () => {
    fireEvent.press(sendButton);
  });
}

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

describe("ChatScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restoreRealChatStore();
    mockExecute.mockClear();
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1 });

    jest.mocked(getDownloadedModelsList).mockResolvedValue([MOCK_MODEL]);
    jest.mocked(resolveDownloadedModelPath).mockResolvedValue("/mock/path.gguf");
    jest.mocked(initializeModel).mockResolvedValue(undefined);
    jest.mocked(releaseModel).mockResolvedValue(undefined);
    jest.mocked(runInference).mockResolvedValue({ text: MOCK_ASSISTANT_RESPONSE, truncated: false });
  });

  it("shows the model selector when no model is assigned", async () => {
    mockChatStore({
      conversationDetails: {
        [MOCK_NEW_CONVERSATION_ID]: {
          ...buildReadyConversation(MOCK_MODEL),
          modelId: "",
        },
      },
      loadConversation: jest.fn().mockResolvedValue(null),
    });

    await mountChatScreen();
    expect(screen.getAllByText(ChatScreenLabels.MODEL_SELECT_TITLE).length).toBeGreaterThan(0);
  });

  it("dispatches the typed message through sendMessage when Gifted Chat send is pressed", async () => {
    const store = mockChatStore({
      conversationDetails: { [MOCK_NEW_CONVERSATION_ID]: buildReadyConversation(MOCK_MODEL) },
      loadConversation: jest.fn().mockResolvedValue(null),
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
  beforeAll(async () => {
    await chatDb.initialize("test-hardware-key");
  });

  beforeEach(() => {
    jest.clearAllMocks();
    restoreRealChatStore();
    mockExecute.mockClear();
    installTrackedSqlMock();

    jest.mocked(getDownloadedModelsList).mockResolvedValue([MOCK_MODEL]);
    jest.mocked(resolveDownloadedModelPath).mockResolvedValue("/mock/path.gguf");
    jest.mocked(initializeModel).mockResolvedValue(undefined);
    jest.mocked(releaseModel).mockResolvedValue(undefined);
    jest.mocked(runInference).mockResolvedValue({ text: MOCK_ASSISTANT_RESPONSE, truncated: false });
  });

  it("persists user and assistant messages after Gifted Chat send completes inference", async () => {
    await mountChatScreenWithProvider(dbSyncRoute);

    if (screen.queryAllByText(ChatScreenLabels.MODEL_SELECT_TITLE).length > 0) {
      await selectDownloadedModel();
    }

    await typeAndSendMessage(MOCK_USER_PROMPT);

    await waitFor(() => expect(runInference).toHaveBeenCalled());

    const inserts = getChatMessageInserts();
    const userInsert = inserts.find((params) => params[2] === "user");
    const assistantInsert = inserts.find((params) => params[2] === "assistant");

    expect(userInsert?.[3]).toBe(MOCK_USER_PROMPT);
    expect(assistantInsert?.[3]).toBe(MOCK_ASSISTANT_RESPONSE);
    expect(inserts.length).toBeGreaterThanOrEqual(2);
  });
});
