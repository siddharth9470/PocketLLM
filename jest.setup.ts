import "@testing-library/jest-native/extend-expect";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("@op-engineering/op-sqlite", () => {
  const { mockExecute, mockExecuteSync } = require("@tests/testUtils");
  return {
    ANDROID_DATABASE_PATH: "/mock/android/db",
    IOS_LIBRARY_PATH: "/mock/ios/db",
    open: jest.fn(() => ({
      execute: mockExecute,
      executeSync: mockExecuteSync,
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
  const RN = require("react-native");
  const viewStubNames = [
    "Swipeable",
    "DrawerLayout",
    "DrawerLayoutAndroid",
    "Slider",
    "Switch",
    "ToolbarAndroid",
    "ViewPagerAndroid",
    "WebView",
    "NativeViewGestureHandler",
    "TapGestureHandler",
    "FlingGestureHandler",
    "ForceTouchGestureHandler",
    "LongPressGestureHandler",
    "PanGestureHandler",
    "PinchGestureHandler",
    "RotationGestureHandler",
    "RawButton",
    "BaseButton",
    "RectButton",
    "BorderlessButton",
    "GestureHandlerRootView",
  ];

  return {
    ...Object.fromEntries(viewStubNames.map((name) => [name, RN.View])),
    // Chat composer and message list need the real primitives so text entry and layout events work.
    ScrollView: RN.ScrollView,
    TextInput: RN.TextInput,
    FlatList: RN.FlatList,
    State: {},
    Directions: {},
    gestureHandlerRootHOC: jest.fn((component) => component),
  };
});

jest.mock("@expo/vector-icons", () => {
  const { Text } = require("react-native");
  return { Ionicons: Text };
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
  cacheDirectory: "file:///mock/cache/",
  getFreeDiskStorageAsync: jest.fn().mockResolvedValue(Number.MAX_SAFE_INTEGER),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 0 }),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
}));

jest.mock("expo-device", () => ({
  brand: "MockBrand",
  manufacturer: "MockManufacturer",
  modelName: "Mock Phone",
  modelId: "MockPhone1,1",
  osName: "MockOS",
  osVersion: "1.0",
  totalMemory: 8 * 1024 ** 3,
  supportedCpuArchitectures: ["arm64"],
  platformApiLevel: 34,
}));

jest.mock("react-native-device-info", () => ({
  getDeviceName: jest.fn().mockResolvedValue("Mock Device"),
  getModel: jest.fn().mockResolvedValue("Mock Model"),
  getSystemName: jest.fn().mockResolvedValue("MockOS"),
  getSystemVersion: jest.fn().mockResolvedValue("1.0"),
  getTotalMemory: jest.fn().mockResolvedValue(8 * 1024 ** 3),
  getUsedMemory: jest.fn().mockResolvedValue(256 * 1024 ** 2),
  getFreeDiskStorage: jest.fn().mockResolvedValue(64 * 1024 ** 3),
  getTotalDiskCapacity: jest.fn().mockResolvedValue(128 * 1024 ** 3),
  supportedAbis: jest.fn().mockResolvedValue(["arm64-v8a"]),
  getHardware: jest.fn().mockResolvedValue("mock-hardware"),
}));

jest.mock("react-native-executorch-expo-resource-fetcher", () => ({
  ExpoResourceFetcher: {
    fetch: jest.fn().mockResolvedValue({ paths: ["/mock/model.pte"], wasDownloaded: [false] }),
    readAsString: jest.fn().mockResolvedValue("{}"),
  },
}));

jest.mock("react-native-executorch", () => {
  const { EMBEDDING_DIMENSION } = require("@/constants/rag");

  const createDeterministicEmbedding = (text: string): Float32Array => {
    const vector = new Float32Array(EMBEDDING_DIMENSION);
    for (let index = 0; index < EMBEDDING_DIMENSION; index += 1) {
      vector[index] = ((text.charCodeAt(index % text.length) || 1) + index) / 1000;
    }
    return vector;
  };

  return {
    ALL_MINILM_L6_V2: {
      modelName: "all_minilm_l6_v2",
      modelSource: "mock-model",
      tokenizerSource: "mock-tokenizer",
    },
    initExecutorch: jest.fn(),
    isAvailable: true,
    TextEmbeddingsModule: {
      fromModelName: jest.fn().mockResolvedValue({
        forward: jest.fn(async (text: string) => createDeterministicEmbedding(text)),
      }),
    },
  };
});
