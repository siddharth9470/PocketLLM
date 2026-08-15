import Constants from "expo-constants";

import { getTavilyApiKey, isTavilyConfigured, logTavilyConfigStatus } from "@/config/env";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} as Record<string, unknown> } },
}));

const ENV_KEY = "EXPO_PUBLIC_TAVILY_API_KEY";

function setExtraKey(value: unknown): void {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  if (extra) {
    extra.tavilyApiKey = value;
  }
}

describe("env / Tavily configuration", () => {
  const originalEnvValue = process.env[ENV_KEY];

  beforeEach(() => {
    delete process.env[ENV_KEY];
    setExtraKey(undefined);
  });

  afterAll(() => {
    if (originalEnvValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnvValue;
    }
  });

  describe("getTavilyApiKey (ENV-01, ENV-02, ENV-03)", () => {
    it("reads and trims the key from process.env first", () => {
      process.env[ENV_KEY] = "  tvly-from-process  ";

      expect(getTavilyApiKey()).toBe("tvly-from-process");
    });

    it("falls back to expoConfig.extra when process.env is unset (ENV-02)", () => {
      setExtraKey("  tvly-from-extra  ");

      expect(getTavilyApiKey()).toBe("tvly-from-extra");
    });

    it("prefers process.env over expoConfig.extra when both are present", () => {
      process.env[ENV_KEY] = "tvly-from-process";
      setExtraKey("tvly-from-extra");

      expect(getTavilyApiKey()).toBe("tvly-from-process");
    });

    it("returns undefined when neither source holds a usable value (ENV-03)", () => {
      process.env[ENV_KEY] = "   ";
      setExtraKey("   ");

      expect(getTavilyApiKey()).toBeUndefined();
    });

    it("ignores a non-string extra value", () => {
      setExtraKey(12345);

      expect(getTavilyApiKey()).toBeUndefined();
    });
  });

  describe("isTavilyConfigured (ENV-04)", () => {
    it("returns true only when a key is resolvable", () => {
      process.env[ENV_KEY] = "tvly-key";
      expect(isTavilyConfigured()).toBe(true);
    });

    it("returns false when no key is resolvable", () => {
      expect(isTavilyConfigured()).toBe(false);
    });
  });

  describe("logTavilyConfigStatus (ENV-07)", () => {
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
      warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("logs only a truncated prefix and never the full key", () => {
      process.env[ENV_KEY] = "tvly-secret-1234567890";

      logTavilyConfigStatus();

      const loggedOutput = logSpy.mock.calls.flat().join(" ");
      expect(loggedOutput).toContain("tvly-sec...");
      expect(loggedOutput).not.toContain("tvly-secret-1234567890");
    });

    it("warns with remediation guidance when the key is missing", () => {
      logTavilyConfigStatus();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(".env.development"));
    });
  });
});
