export type ModelArchitecture = "gemma" | "llama" | "qwen" | "mistral" | "generic";

export function detectModelArchitecture(modelPath: string): ModelArchitecture {
  const normalized = modelPath.toLowerCase();

  if (normalized.includes("gemma")) {
    return "gemma";
  }

  if (normalized.includes("llama") || normalized.includes("meta-llama") || normalized.includes("mistral")) {
    return normalized.includes("mistral") ? "mistral" : "llama";
  }

  if (normalized.includes("qwen")) {
    return "qwen";
  }

  return "generic";
}

const GEMMA_STOP_SEQUENCES = ["<turn|>", "<|turn|>", "<channel|>", "<|channel>thought"];

const LLAMA_STOP_SEQUENCES = [
  "<|eot_id|>",
  "<|start_header_id|>user<|end_header_id|>",
  "<|start_header_id|>assistant<|end_header_id|>",
];

const QWEN_STOP_SEQUENCES = ["", "<|im_start|>user", "<|im_start|>assistant"];

const MISTRAL_STOP_SEQUENCES = ["[/INST]", "[INST]"];

const GENERIC_FALLBACK_STOP_SEQUENCES = [
  "</s>",
  "<|end|>",
  "<|end_of_text|>",
  "<|endoftext|>",
  "<|end_of_turn|>",
  "<|im_end|>",
  "<|EOT|>",
  "<|END_OF_TURN_TOKEN|>",
];

const ARCHITECTURE_STOP_SEQUENCES: Record<ModelArchitecture, string[]> = {
  gemma: GEMMA_STOP_SEQUENCES,
  llama: LLAMA_STOP_SEQUENCES,
  qwen: QWEN_STOP_SEQUENCES,
  mistral: MISTRAL_STOP_SEQUENCES,
  generic: GENERIC_FALLBACK_STOP_SEQUENCES,
};

export function buildStopSequences(modelPath: string, jinjaSupported: boolean): string[] {
  const architecture = detectModelArchitecture(modelPath);
  const architectureStops = ARCHITECTURE_STOP_SEQUENCES[architecture];

  if (jinjaSupported) {
    // Jinja chat templates inject template-specific additional_stops automatically.
    // Only append architecture extras that templates may omit.
    return architectureStops;
  }

  return [...GENERIC_FALLBACK_STOP_SEQUENCES, ...architectureStops];
}
