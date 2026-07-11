/**
 * Public inference API barrel.
 * Implementation is split across `src/services/inference/` by responsibility.
 */

export {
  type ChatCompletionResult,
  type InferenceTokenHandler,
  runContinueInference,
  runInference,
} from "@/services/inference/chatCompletion";
export { buildChatContextFromHistory, buildContinuationContext } from "@/services/inference/chatContext";
export { classifyInferenceError, type InferenceErrorInfo } from "@/services/inference/inferenceErrors";
export {
  initializeModel,
  releaseModel,
  releaseModelForPath,
  resolveDownloadedModelPath,
} from "@/services/inference/llamaRuntime";
