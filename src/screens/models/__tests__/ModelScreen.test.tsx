import { render, screen } from "@testing-library/react-native";

import { buildHuggingFaceModelsQuery, MOCK_HF_MODELS } from "../../../../__tests__/testUtils";
import { ModelsScreenLabels } from "../../../constants/models";
import { useHuggingFaceModels } from "../../../hooks/useHuggingFaceModels";
import ModelsScreen from "../ModelsScreen";

jest.mock("../../../hooks/useHuggingFaceModels");
jest.mock("../../../services/useModelDownloader", () => ({
  useModelDownloader: () => ({
    activeDownloads: {},
    downloadProgress: {},
    downloadedModelIds: {},
    startDownload: jest.fn(),
    cancelDownload: jest.fn(),
    syncDownloadedModelIds: jest.fn(),
  }),
}));
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));
jest.mock("@expo/vector-icons", () => {
  const { Text } = require("react-native");
  return { Ionicons: Text };
});

const navigation = { setOptions: jest.fn(), navigate: jest.fn() };
const route = { key: "Models", name: "Models" as const, params: undefined };

function mockQuery(...args: Parameters<typeof buildHuggingFaceModelsQuery>) {
  jest.mocked(useHuggingFaceModels).mockReturnValue(buildHuggingFaceModelsQuery(...args));
}

async function mount() {
  return render(<ModelsScreen navigation={navigation as never} route={route as never} />);
}

describe("ModelsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery();
  });

  describe("when useHuggingFaceModels is loading", () => {
    it("shows loading indicator and hides model list", async () => {
      mockQuery({ isLoading: true, data: undefined });
      await mount();
      expect(screen.getByText(ModelsScreenLabels.LOADING)).toBeTruthy();
      expect(screen.queryByText("gemma-2b-q4")).toBeNull();
    });
  });

  describe("when useHuggingFaceModels resolves successfully", () => {
    it("renders model names in the FlatList", async () => {
      mockQuery({ data: MOCK_HF_MODELS });
      await mount();
      expect(await screen.findByText("gemma-2b-q4")).toBeTruthy();
      expect(screen.getByText("google")).toBeTruthy();
    });

    it("does not show loading indicator", async () => {
      mockQuery({ data: MOCK_HF_MODELS });
      await mount();
      await screen.findByText("gemma-2b-q4");
      expect(screen.queryByText(ModelsScreenLabels.LOADING)).toBeNull();
    });
  });

  describe("when useHuggingFaceModels fails", () => {
    it("shows error banner", async () => {
      mockQuery({ error: new Error("Network request failed") });
      await mount();
      expect(screen.getByText(ModelsScreenLabels.FETCH_ERROR)).toBeTruthy();
    });
  });
});
