import { buildCompletedModel, MOCK_DOWNLOADED_AT, MOCK_HF_MODELS, mockExecute } from "../../../__tests__/testUtils";
import { modelDb, saveDownloadedModel } from "../ModelDB";

const INSERT = { localFilePath: 13, downloadStatus: 14, downloadedAt: 15, fileSize: 16 } as const;

function getInsertCall(): [string, unknown[]] {
  const call = mockExecute.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO downloaded_models"));
  if (!call) throw new Error("Expected saveDownloadedModel to execute an INSERT statement.");
  return call as [string, unknown[]];
}

describe("ModelDB.saveDownloadedModel", () => {
  beforeAll(async () => {
    await modelDb.initialize("test-hardware-key");
  });

  beforeEach(() => {
    mockExecute.mockClear();
    mockExecute.mockResolvedValue({ rows: [], rowsAffected: 1 });
  });

  it("upserts local_file_path and file_size from download completion metadata", async () => {
    await saveDownloadedModel(buildCompletedModel());

    const [sql, params] = getInsertCall();
    expect(sql).toMatch(/INSERT INTO downloaded_models/i);
    expect(sql).toMatch(/ON CONFLICT\(id\) DO UPDATE SET/i);
    expect(params[INSERT.localFilePath]).toBe("/mock/path.gguf");
    expect(params[INSERT.fileSize]).toBe(2_393_231_840);
    expect(params[INSERT.downloadStatus]).toBe("completed");
  });

  it("binds downloaded_at from downloadInfo.downloadedAt", async () => {
    await saveDownloadedModel(buildCompletedModel());
    expect(getInsertCall()[1][INSERT.downloadedAt]).toBe(MOCK_DOWNLOADED_AT);
  });

  it("executes upsert again when saving the same model id", async () => {
    const model = buildCompletedModel();
    await saveDownloadedModel(model);
    await saveDownloadedModel({
      ...model,
      downloadInfo: {
        localFilePath: "/mock/updated-path.gguf",
        status: "completed",
        downloadedAt: MOCK_DOWNLOADED_AT,
        fileSizeBytes: 3_000_000_000,
      },
    });

    const calls = mockExecute.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO downloaded_models"));
    expect(calls).toHaveLength(2);
    expect(calls[1]?.[1]?.[INSERT.localFilePath]).toBe("/mock/updated-path.gguf");
    expect(calls[1]?.[1]?.[INSERT.fileSize]).toBe(3_000_000_000);
  });

  it("persists catalog metadata alongside download fields", async () => {
    const [base] = MOCK_HF_MODELS;
    await saveDownloadedModel(buildCompletedModel(base));

    const [, params] = getInsertCall();
    expect(params[0]).toBe(base.id);
    expect(params[1]).toBe(base._id);
    expect(params[7]).toBe(base.author);
    expect(params[11]).toBe(base.pipeline_tag);
  });
});
