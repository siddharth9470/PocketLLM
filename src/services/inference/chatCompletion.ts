import type { NativeCompletionResult } from "llama.rn";

import { getActiveContext } from "@/services/inference/llamaRuntime";

const stopWords = [
  "</s>",
  "<|end|>",
  "<|eot_id|>",
  "<|end_of_text|>",
  "<|im_end|>",
  "<|EOT|>",
  "<|END_OF_TURN_TOKEN|>",
  "<|end_of_turn|>",
  "<|endoftext|>",
];

export interface ChatCompletionResult {
  text: string;
  metrics?: {
    tokensPerSecond?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTimeMs?: number;
  };
}

function mapCompletionMetrics(result: NativeCompletionResult): ChatCompletionResult["metrics"] {
  const { timings } = result;
  if (!timings) {
    return undefined;
  }

  return {
    tokensPerSecond: timings.predicted_per_second,
    promptTokens: timings.prompt_n,
    completionTokens: timings.predicted_n,
    totalTimeMs: timings.prompt_ms + timings.predicted_ms,
  };
}

export async function chatCompletion(
  prompt: string,
  onToken?: (accumulatedText: string) => void,
): Promise<ChatCompletionResult> {
  const context = getActiveContext();
  if (!context) {
    throw new Error("No context found");
  }

  const msgResult = await context.completion(
    {
      messages: [
        {
          role: "system",
          content: "This is a conversation between user and assistant, a friendly chatbot.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      n_predict: 512,
      reasoning_format: "auto",
      thinking_budget_tokens: 96,
      enable_thinking: false,
      stop: stopWords,
    },
    (data) => {
      onToken?.(data.content ?? "");
    },
  );

  return {
    text: msgResult.content || msgResult.text,
    metrics: mapCompletionMetrics(msgResult),
  };
}
