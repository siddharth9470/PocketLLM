import { initLlama, type LlamaContext } from "llama.rn";

// 1. Maintain a single, reusable context in memory
let llamaContext: LlamaContext | null = null;

const STOP_WORDS = [
  "</s>",
  "<|end|>",
  "<|eot_id|>",
  "<|end_of_text|>",
  "<|im_end|>",
  "<|user|>",
  "\n<|user|>",
  "User:",
  "<|EOT|>",
  "<|END_OF_TURN_TOKEN|>",
  "<|end_of_turn|>",
  "<|endoftext|>",
];

/**
 * Initialize the Llama model. Call this ONCE when your app or chat screen mounts.
 */
export const initializeModel = async (modelPath: string): Promise<void> => {
  if (llamaContext) {
    console.log("Model is already initialized.");
    return;
  }

  try {
    console.log("Loading model into memory...");
    llamaContext = await initLlama({
      model: modelPath,
      use_mlock: true,
      n_ctx: 2048,
      n_gpu_layers: 99, // Adjust based on target device capabilities
    });
    console.log("Model successfully loaded!");
  } catch (error) {
    console.error("Failed to initialize Llama model:", error);
    throw error;
  }
};

/**
 * Send a question to the LLM and return the generated text response.
 */
export const initiateChat = async (question: string): Promise<string> => {
  // Prevent querying if the model hasn't finished loading
  if (!llamaContext) {
    throw new Error(
      "Llama context is not initialized. Please call initializeModel() first.",
    );
  }

  try {
    const msgResult = await llamaContext.completion(
      {
        messages: [
          {
            role: "system",
            content:
              "This is a conversation between user and assistant, a friendly chatbot.",
          },
          {
            role: "user",
            content: question, // Pass the dynamic user question here
          },
        ],
        n_predict: 256, // Increased slightly to allow for longer natural responses
        stop: STOP_WORDS,
      },
      (data) => {
        // Future enhancement: You can use this callback to stream tokens
        // to your React Native UI state one by one as they generate!
        // const { token } = data;
      },
    );

    console.log("Generation Timings:", msgResult.timings);

    // Return the final generated string
    return msgResult.text;
  } catch (error) {
    console.error("Error during chat completion:", error);
    throw error;
  }
};

/**
 * Free up device memory when closing the chat screen or app.
 */
export const releaseModel = async (): Promise<void> => {
  if (llamaContext) {
    await llamaContext.release();
    llamaContext = null;
    console.log("Model released from memory.");
  }
};
