import { getActiveContext } from "@/services/inference/llamaRuntime";


const stopWords = ['</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|EOT|>', '<|END_OF_TURN_TOKEN|>', '<|end_of_turn|>', '<|endoftext|>']



export async function chatCompletion(prompt: string) {
    console.log('Calling chatCompletion')
  const context = getActiveContext();
  if (!context) {
    throw new Error("No context found");
  }
  console.log('context not null ')
  const msgResult = await context.completion(
    {
      messages: [
        {
          role: 'system',
          content: 'This is a conversation between user and assistant, a friendly chatbot.',
        },
        {
          role: 'user',
          content: 'Hello!',
        },
      ],
      n_predict: 100,
      stop: stopWords,
      // ...other params
    },
    (data) => {
      // This is a partial completion callback
      const { token } = data
      console.log('token:', token)
    },
  )
  console.log('Result:', msgResult.text)
  console.log('Timings:', msgResult.timings)
};

