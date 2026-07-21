const { loadEnvFiles } = require("@expo/env");

const appJson = require("./app.json");

loadEnvFiles(process.cwd());

const tavilyApiKey = process.env.EXPO_PUBLIC_TAVILY_API_KEY?.trim();

if (tavilyApiKey) {
  console.log("[app.config] EXPO_PUBLIC_TAVILY_API_KEY loaded:", `${tavilyApiKey.slice(0, 8)}...`);
} else {
  console.warn("[app.config] EXPO_PUBLIC_TAVILY_API_KEY not found in .env / .env.local");
}

/** @type {import('expo/config').ExpoConfig} */
module.exports = () => ({
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    tavilyApiKey,
  },
});
