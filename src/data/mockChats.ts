import type { Conversation } from "../types/chat";

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "conv-1",
    title: "Trip planning",
    preview: "Can you summarize the best offline maps app?",
    updatedAt: "2026-05-19T18:30:00.000Z",
    modelId: "TheBloke/Llama-2-7B-Chat-GGUF",
    messages: [
      {
        id: "m1",
        role: "user",
        content: "What should I pack for a weekend hike?",
        createdAt: "2026-05-19T18:28:00.000Z",
      },
      {
        id: "m2",
        role: "assistant",
        content:
          "Bring layers, water, a headlamp, and a paper map. Tell me your elevation and weather forecast for a tighter list.",
        createdAt: "2026-05-19T18:28:30.000Z",
      },
      {
        id: "m3",
        role: "user",
        content: "Can you summarize the best offline maps app?",
        createdAt: "2026-05-19T18:30:00.000Z",
      },
    ],
  },
  {
    id: "conv-2",
    title: "Code review",
    preview: "The download manager should expose progress callbacks.",
    updatedAt: "2026-05-18T11:05:00.000Z",
    modelId: "microsoft/Phi-3-mini-4k-instruct-gguf",
    messages: [
      {
        id: "m4",
        role: "user",
        content: "How do I structure a mock download manager?",
        createdAt: "2026-05-18T11:00:00.000Z",
      },
      {
        id: "m5",
        role: "assistant",
        content: "The download manager should expose progress callbacks and return a local file path when complete.",
        createdAt: "2026-05-18T11:05:00.000Z",
      },
    ],
  },
  {
    id: "conv-3",
    title: "Aviation briefing",
    preview: "METAR indicates VFR with light winds from the west.",
    updatedAt: "2026-05-17T07:15:00.000Z",
    modelId: "BluelarkAviation/llama-aviation-pte",
    messages: [
      {
        id: "m6",
        role: "user",
        content: "Summarize this METAR: KPAO 170756Z 27004KT 10SM CLR",
        createdAt: "2026-05-17T07:14:00.000Z",
      },
      {
        id: "m7",
        role: "assistant",
        content: "METAR indicates VFR with light winds from the west.",
        createdAt: "2026-05-17T07:15:00.000Z",
      },
    ],
  },
];
