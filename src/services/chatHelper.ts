/**
 * Public llama.rn runtime API barrel.
 * Model load/release lives in `src/services/inference/llamaRuntime.ts`.
 */

export { chatCompletion } from "@/services/inference/chatCompletion";
export {
  getActiveContext,
  getCachedJinjaSupported,
  getContextWindowSize,
  initializeModel,
  releaseModel,
  releaseModelForPath,
  resolveDownloadedModelPath,
} from "@/services/inference/llamaRuntime";
