import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  buildMockConversations,
  MOCK_NEW_CONVERSATION_ID,
  mockChatStore,
  restoreRealChatStore,
} from "@tests/testUtils";
import { ChatScreenLabels } from "@/constants/chat";
import ChatListScreen from "@/screens/chats/ChatListScreen";

jest.mock("@/stores/chatStore", () => {
  const actual = jest.requireActual("@/stores/chatStore") as typeof import("@/stores/chatStore");
  return {
    ...actual,
    useChatStore: jest.fn(actual.useChatStore),
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
jest.mock("@expo/vector-icons", () => {
  const { Text } = require("react-native");
  return { Ionicons: Text };
});

const MOCK_CONVERSATIONS = buildMockConversations();

const navigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

const chatListRoute = { key: "ChatList", name: "ChatList" as const, params: undefined };

function mountChatList() {
  return render(<ChatListScreen navigation={navigation as never} route={chatListRoute as never} />);
}

describe("ChatListScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restoreRealChatStore();
  });

  it("shows empty-state copy when no conversations exist", async () => {
    mockChatStore({ conversations: [], isLoadingConversations: false });
    await mountChatList();
    expect(screen.getByText(ChatScreenLabels.EMPTY_STATE)).toBeTruthy();
  });

  it("inflates conversation rows with titles and previews", async () => {
    mockChatStore({ conversations: MOCK_CONVERSATIONS, isLoadingConversations: false });
    await mountChatList();
    expect(screen.getByText("Gemma chat")).toBeTruthy();
    expect(screen.getByText("Hello there")).toBeTruthy();
    expect(screen.getByText("Quick test")).toBeTruthy();
  });

  it("navigates to Chat when Create New Chat is pressed", async () => {
    mockChatStore({ conversations: [], isLoadingConversations: false });
    await mountChatList();
    fireEvent.press(screen.getByText(ChatScreenLabels.CREATE_NEW_CHAT));
    expect(navigation.navigate).toHaveBeenCalledWith("Chat", {
      conversationId: MOCK_NEW_CONVERSATION_ID,
      title: ChatScreenLabels.NEW_CHAT_TITLE,
    });
  });
});
