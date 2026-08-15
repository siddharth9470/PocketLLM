import { MOCK_HF_MODELS } from "@tests/testUtils";
import * as FileSystem from "expo-file-system/legacy";
import {
  buildGgufDownloadTarget,
  deleteLocalModelFile,
  getDownloadUrlForModel,
  getRemoteGgufFileSizeBytes,
  localFileBasename,
  normalizeFileUri,
} from "@/services/downloadHelpers";

const MODEL = MOCK_HF_MODELS[0];
const GGUF_FILENAME = "gemma-2b-q4.gguf";

/** Replaces `global.fetch` with the given mock; the cast is confined to this boundary helper. */
function installFetchMock(mock: jest.Mock): void {
  global.fetch = mock as unknown as typeof fetch;
}

function mockHeadResponse(contentLength: string | null, ok = true): void {
  installFetchMock(
    jest.fn().mockResolvedValue({
      ok,
      headers: { get: jest.fn().mockReturnValue(contentLength) },
    }),
  );
}

describe("downloadHelpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("normalizeFileUri (STORE-01)", () => {
    it("preserves a well-formed file:// uri", () => {
      expect(normalizeFileUri("file:///mock/model.gguf")).toBe("file:///mock/model.gguf");
    });

    it("prefixes an absolute path with file://", () => {
      expect(normalizeFileUri("/mock/model.gguf")).toBe("file:///mock/model.gguf");
    });

    it("repairs a file:// uri missing its leading slash", () => {
      expect(normalizeFileUri("file://mock/model.gguf")).toBe("file:///mock/model.gguf");
    });

    it("returns an empty string untouched", () => {
      expect(normalizeFileUri("   ")).toBe("");
    });
  });

  describe("localFileBasename", () => {
    it("extracts the file name from a file:// uri", () => {
      expect(localFileBasename("file:///mock/dir/model.gguf")).toBe("model.gguf");
    });

    it("returns null for an undefined uri", () => {
      expect(localFileBasename(undefined)).toBeNull();
    });
  });

  describe("buildGgufDownloadTarget", () => {
    it("builds the Hugging Face resolve url from the model id and basename", () => {
      const target = buildGgufDownloadTarget(MODEL.id, `subdir/${GGUF_FILENAME}`, 1234);

      expect(target).toEqual({
        url: `https://huggingface.co/${MODEL.id}/resolve/main/${GGUF_FILENAME}`,
        filename: GGUF_FILENAME,
        fileSizeBytes: 1234,
      });
    });
  });

  describe("getRemoteGgufFileSizeBytes (STORE-03)", () => {
    it("parses a positive content-length header", async () => {
      mockHeadResponse("2393231840");

      await expect(getRemoteGgufFileSizeBytes(MODEL.id, GGUF_FILENAME)).resolves.toBe(2_393_231_840);
    });

    it("returns null on a non-ok response", async () => {
      mockHeadResponse("100", false);

      await expect(getRemoteGgufFileSizeBytes(MODEL.id, GGUF_FILENAME)).resolves.toBeNull();
    });

    it("returns null when the content-length header is absent", async () => {
      mockHeadResponse(null);

      await expect(getRemoteGgufFileSizeBytes(MODEL.id, GGUF_FILENAME)).resolves.toBeNull();
    });

    it("returns null when the request throws", async () => {
      installFetchMock(jest.fn().mockRejectedValue(new Error("network down")));

      await expect(getRemoteGgufFileSizeBytes(MODEL.id, GGUF_FILENAME)).resolves.toBeNull();
    });
  });

  describe("getDownloadUrlForModel (STORE-04)", () => {
    it("uses the known size and skips the HEAD request", async () => {
      installFetchMock(jest.fn());

      const target = await getDownloadUrlForModel(MODEL, GGUF_FILENAME, 999);

      expect(target?.fileSizeBytes).toBe(999);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("falls back to a HEAD lookup when the size is unknown", async () => {
      mockHeadResponse("555");

      const target = await getDownloadUrlForModel(MODEL, GGUF_FILENAME);

      expect(target?.fileSizeBytes).toBe(555);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteLocalModelFile (STORE-02)", () => {
    it("deletes an existing file", async () => {
      jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false } as never);
      const deleteSpy = jest.mocked(FileSystem.deleteAsync).mockResolvedValue(undefined);

      await deleteLocalModelFile("/mock/model.gguf");

      expect(deleteSpy).toHaveBeenCalledTimes(1);
    });

    it("returns without deleting when the file does not exist", async () => {
      jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: false } as never);
      const deleteSpy = jest.mocked(FileSystem.deleteAsync);

      await deleteLocalModelFile("/mock/missing.gguf");

      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("throws the last error when every candidate path fails", async () => {
      jest.mocked(FileSystem.getInfoAsync).mockRejectedValue(new Error("stat failed"));

      await expect(deleteLocalModelFile("/mock/model.gguf")).rejects.toThrow("stat failed");
    });
  });
});
