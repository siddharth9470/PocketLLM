import "@testing-library/jest-native/extend-expect";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@op-engineering/op-sqlite", () => {
  const { mockExecute } = require("@tests/testUtils");
  return {
    ANDROID_DATABASE_PATH: "/mock/android/db",
    IOS_LIBRARY_PATH: "/mock/ios/db",
    open: jest.fn(() => ({
      execute: mockExecute,
      close: jest.fn(),
    })),
  };
});

jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  Reanimated.default.call = () => {};
  return Reanimated;
});

jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  return {
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    ScrollView: View,
    Slider: View,
    Switch: View,
    TextInput: View,
    ToolbarAndroid: View,
    ViewPagerAndroid: View,
    DrawerLayoutAndroid: View,
    WebView: View,
    NativeViewGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    PanGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: View,
    gestureHandlerRootHOC: jest.fn((component) => component),
    Directions: {},
    GestureHandlerRootView: View,
  };
});

jest.mock("@kesha-antonov/react-native-background-downloader", () => ({
  __esModule: true,
  default: {
    checkForExistingDownloads: jest.fn().mockResolvedValue([]),
    download: jest.fn(() => ({
      id: "mock-task-id",
      begin: jest.fn().mockReturnThis(),
      progress: jest.fn().mockReturnThis(),
      done: jest.fn().mockReturnThis(),
      error: jest.fn().mockReturnThis(),
      pause: jest.fn().mockReturnThis(),
      resume: jest.fn().mockReturnThis(),
      stop: jest.fn().mockReturnThis(),
    })),
  },
}));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///mock/documents/",
  getFreeDiskStorageAsync: jest.fn().mockResolvedValue(Number.MAX_SAFE_INTEGER),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 0 }),
}));
