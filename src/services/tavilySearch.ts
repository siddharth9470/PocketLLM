import { getTavilyApiKey } from "@/config/env";

/** https://docs.tavily.com/api-reference/endpoint/search */
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

interface TavilySearchResult {
  title?: string;
  url?: string;
  content?: string;
}

interface TavilySearchResponse {
  answer?: string;
  response_time?: number;
  results?: TavilySearchResult[];
}

export interface WebSearchResult {
  answer: string | null;
  formatted: string;
  resultCount: number;
}

function formatSearchResults(data: TavilySearchResponse): string {
  const parts: string[] = [];

  if (data.answer?.trim()) {
    parts.push(`Answer: ${data.answer.trim()}`);
  }

  for (const [index, result] of (data.results ?? []).entries()) {
    const title = result.title?.trim() || `Result ${index + 1}`;
    const snippet = result.content?.trim() || "";
    const url = result.url?.trim() || "";
    parts.push(`${title}${url ? `\nURL: ${url}` : ""}${snippet ? `\n${snippet}` : ""}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : "No results found.";
}

export async function searchWeb(query: string): Promise<WebSearchResult> {
  const apiKey = getTavilyApiKey();
  console.log("[tavilySearch] API key configured:", Boolean(apiKey));
  if (apiKey) {
    console.log("[tavilySearch] API key prefix:", `${apiKey.slice(0, 8)}...`);
  }

  if (!apiKey) {
    throw new Error("Tavily API key is not configured.");
  }

  console.log("[tavilySearch] Query:", query);

  const response = await fetch(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 8,
      include_answer: true,
      search_depth: "advanced",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[tavilySearch] Request failed:", response.status, errorText);
    throw new Error(`Web search failed (${response.status}).`);
  }

  const data = (await response.json()) as TavilySearchResponse;
  const formatted = formatSearchResults(data);
  const answer = data.answer?.trim() ?? null;
  const resultCount = data.results?.length ?? 0;

  console.log("[tavilySearch] Answer:", answer);
  console.log("[tavilySearch] Result count:", resultCount);
  console.log("[tavilySearch] Response time (ms):", data.response_time);
  console.log("[tavilySearch] Formatted results:", formatted);

  return { answer, formatted, resultCount };
}
