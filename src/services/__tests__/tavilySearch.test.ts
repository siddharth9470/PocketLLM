import { getTavilyApiKey } from "@/config/env";
import { searchWeb } from "@/services/tavilySearch";

jest.mock("@/config/env", () => ({ getTavilyApiKey: jest.fn() }));

const MOCK_API_KEY = "tvly-test-key";
const QUERY = "iphone 17 pro max price india";

interface TavilyResponseBody {
  answer?: string;
  response_time?: number;
  results?: Array<{ title?: string; url?: string; content?: string }>;
}

function mockFetchResponse(body: TavilyResponseBody, init: { ok?: boolean; status?: number } = {}): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

describe("searchWeb", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.mocked(getTavilyApiKey).mockReturnValue(MOCK_API_KEY);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("authentication (INF-11)", () => {
    it("throws before making a request when the API key is missing", async () => {
      jest.mocked(getTavilyApiKey).mockReturnValue(undefined);
      global.fetch = jest.fn();

      await expect(searchWeb(QUERY)).rejects.toThrow("Tavily API key is not configured.");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("request contract", () => {
    it("posts the query with advanced depth and an included answer", async () => {
      mockFetchResponse({ answer: "answer", results: [] });

      await searchWeb(QUERY);

      const [url, init] = jest.mocked(global.fetch).mock.calls[0];
      expect(url).toBe("https://api.tavily.com/search");
      const body = JSON.parse(String((init as RequestInit).body));
      expect(body).toMatchObject({
        api_key: MOCK_API_KEY,
        query: QUERY,
        max_results: 8,
        include_answer: true,
        search_depth: "advanced",
      });
    });
  });

  describe("successful responses", () => {
    it("returns the trimmed answer, formatted snippets, and result count", async () => {
      mockFetchResponse({
        answer: "  The iPhone 17 Pro Max starts at ₹1,49,900.  ",
        results: [
          { title: "Apple India", url: "https://apple.com/in", content: "Pricing details" },
          { title: "News", url: "https://news.com", content: "Launch coverage" },
        ],
      });

      const result = await searchWeb(QUERY);

      expect(result.answer).toBe("The iPhone 17 Pro Max starts at ₹1,49,900.");
      expect(result.resultCount).toBe(2);
      expect(result.formatted).toContain("Answer: The iPhone 17 Pro Max starts at ₹1,49,900.");
      expect(result.formatted).toContain("Apple India");
      expect(result.formatted).toContain("URL: https://apple.com/in");
    });

    it("returns a null answer and zero results when Tavily returns nothing", async () => {
      mockFetchResponse({ results: [] });

      const result = await searchWeb(QUERY);

      expect(result.answer).toBeNull();
      expect(result.resultCount).toBe(0);
      expect(result.formatted).toBe("No results found.");
    });

    it("falls back to positional titles for results missing a title", async () => {
      mockFetchResponse({ results: [{ content: "snippet only" }] });

      const result = await searchWeb(QUERY);

      expect(result.formatted).toContain("Result 1");
    });
  });

  describe("error responses (INF-10)", () => {
    it("throws with the HTTP status when the request is unauthorized", async () => {
      mockFetchResponse({}, { ok: false, status: 401 });

      await expect(searchWeb(QUERY)).rejects.toThrow("Web search failed (401).");
    });

    it("throws with the HTTP status on rate limiting", async () => {
      mockFetchResponse({}, { ok: false, status: 429 });

      await expect(searchWeb(QUERY)).rejects.toThrow("Web search failed (429).");
    });
  });
});
