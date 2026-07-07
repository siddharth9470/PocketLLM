import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { initializeAllDatabases } from "@/db";
import CentralNavigator from "@/navigation/CentralNavigator";
import { ChatStoreProvider } from "@/stores/chatStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 15,
    },
  },
});

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
    <QueryClientProvider client={queryClient}>
      <ChatStoreProvider>
        {/* <DownloadStoreProvider> */}
        <NavigationContainer>
          <CentralNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
        {/* </DownloadStoreProvider> */}
      </ChatStoreProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  bootContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
