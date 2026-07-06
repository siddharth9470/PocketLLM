import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { initializeAllDatabases } from "./src/db";
import CentralNavigator from "./src/navigation/CentralNavigator";
import { ChatStoreProvider } from "./src/stores/chatStore";
///import { DownloadStoreProvider } from "./src/stores/downloadStore";

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);

  useEffect(() => {
    initializeAllDatabases()
      .then(() => setIsDbReady(true))
      .catch((error) => {
        console.error("Failed to initialize databases:", error);
      });
  }, []);

  if (!isDbReady) {
    return (
      <View style={styles.bootContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ChatStoreProvider>
      {/* <DownloadStoreProvider> */}
      <NavigationContainer>
        <CentralNavigator />
        <StatusBar style="auto" />
      </NavigationContainer>
      {/* </DownloadStoreProvider> */}
    </ChatStoreProvider>
  );
}

const styles = StyleSheet.create({
  bootContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
