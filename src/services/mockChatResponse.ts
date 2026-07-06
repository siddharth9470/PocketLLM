import { ChatScreenLabels, MOCK_RESPONSE_DELAY_MS } from "../constants/chat";

export async function getMockAssistantResponse(): Promise<string> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, MOCK_RESPONSE_DELAY_MS);
  });

  return ChatScreenLabels.MOCK_ASSISTANT_RESPONSE;
}
