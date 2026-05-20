/**
 * Mock download implementation. Replace the body of `downloadModelFile`
 * with expo-file-system to fetch .gguf files into the document directory.
 */
export type DownloadProgressCallback = (progress: number) => void;

export interface DownloadResult {
  localPath: string;
}

const MOCK_DOWNLOAD_DURATION_MS = 4000;
const MOCK_TICK_MS = 200;

export async function downloadModelFile(
  modelId: string,
  onProgress: DownloadProgressCallback,
  signal?: AbortSignal,
): Promise<DownloadResult> {
  // Future integration example:
  // const destination = `${FileSystem.documentDirectory}${modelId.replace('/', '_')}.gguf`;
  // await FileSystem.createDownloadResumable(remoteUrl, destination, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
  //   onProgress(Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100));
  // }).downloadAsync();

  const localPath = `documents://${modelId.replace('/', '_')}.gguf`;
  const steps = MOCK_DOWNLOAD_DURATION_MS / MOCK_TICK_MS;
  let currentStep = 0;

  return new Promise((resolve, reject) => {
    const intervalId = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(intervalId);
        reject(new Error('Download cancelled'));
        return;
      }

      currentStep += 1;
      const progress = Math.min(100, Math.round((currentStep / steps) * 100));
      onProgress(progress);

      if (progress >= 100) {
        clearInterval(intervalId);
        resolve({ localPath });
      }
    }, MOCK_TICK_MS);
  });
}
