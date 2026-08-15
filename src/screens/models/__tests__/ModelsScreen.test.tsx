import { render, screen } from "@testing-library/react-native";
import { buildHuggingFaceModelsQuery, MOCK_HF_MODELS } from "@tests/testUtils";
import { ModelsScreenLabels } from "@/constants/models";
import { useHuggingFaceModels } from "@/hooks/useHuggingFaceModels";
import ModelsScreen from "@/screens/models/ModelsScreen";

jest.mock("@/hooks/useHuggingFaceModels");
jest.mock("@/services/useModelDownloader", () => ({
  useModelDownloader: () => ({
    activeDownloads: {},
    downloadProgress: {},
    activeDownloadFilenames: {},
    activeDownloadModels: {},
    downloadedModelIds: {},
    startDownload: jest.fn(),
    cancelDownload: jest.fn(),
    syncDownloadedModelIds: jest.fn(),
  }),
}));
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));

const navigation = { setOptions: jest.fn(), navigate: jest.fn() };
const route = { key: "Models", name: "Models" as const, params: undefined };

/** Stubs the catalog query with the given state and mounts the screen. */
async function mountModelsScreen(...queryState: Parameters<typeof buildHuggingFaceModelsQuery>) {
  jest.mocked(useHuggingFaceModels).mockReturnValue(buildHuggingFaceModelsQuery(...queryState));
  return render(<ModelsScreen navigation={navigation as never} route={route as never} />);
}

describe("ModelsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when useHuggingFaceModels is loading", () => {
    it("shows loading indicator and hides model list", async () => {
      await mountModelsScreen({ isLoading: true, data: undefined });

      expect(screen.getByText(ModelsScreenLabels.LOADING)).toBeTruthy();
      expect(screen.queryByText("gemma-2b-q4")).toBeNull();
    });
  });

  describe("when useHuggingFaceModels resolves successfully", () => {
    it("renders model names in the FlatList", async () => {
      await mountModelsScreen({ data: MOCK_HF_MODELS });

      expect(await screen.findByText("gemma-2b-q4")).toBeTruthy();
      expect(screen.getByText("google")).toBeTruthy();
    });

    it("does not show loading indicator", async () => {
      await mountModelsScreen({ data: MOCK_HF_MODELS });

      await screen.findByText("gemma-2b-q4");
      expect(screen.queryByText(ModelsScreenLabels.LOADING)).toBeNull();
    });
  });

  describe("when useHuggingFaceModels fails", () => {
    it("shows error banner", async () => {
      await mountModelsScreen({ error: new Error("Network request failed") });

      expect(screen.getByText(ModelsScreenLabels.FETCH_ERROR)).toBeTruthy();
    });
  });
});
