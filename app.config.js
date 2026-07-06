const appJson = require("./app.json");

/** @type {import('expo/config').ExpoConfig} */
module.exports = () => {
  const sentryOrg = process.env.SENTRY_ORG;
  const sentryProject = process.env.SENTRY_PROJECT;

  const plugins = appJson.expo.plugins.filter((plugin) => {
    if (typeof plugin === "string") {
      return (
        plugin !== "@sentry/react-native" &&
        plugin !== "@sentry/react-native/expo"
      );
    }

    if (Array.isArray(plugin)) {
      return (
        plugin[0] !== "@sentry/react-native" &&
        plugin[0] !== "@sentry/react-native/expo"
      );
    }

    return true;
  });

  if (sentryOrg && sentryProject) {
    plugins.push([
      "@sentry/react-native/expo",
      {
        url: "https://sentry.io/",
        organization: sentryOrg,
        project: sentryProject,
      },
    ]);
  } else {
    plugins.push("@sentry/react-native");
  }

  return {
    ...appJson.expo,
    plugins,
  };
};
