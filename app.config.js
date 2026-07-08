const appJson = require("./app.json");

/** @type {import('expo/config').ExpoConfig} */
module.exports = () => ({
  ...appJson.expo,
});
