import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { DialogProvider } from "@/components/AppDialog";
import { logTavilyConfigStatus } from "@/config/env";
import { CUSTOM_FONT_ASSETS } from "@/constants/fonts";
import { colors } from "@/constants/theme";
import { initializeAllDatabases } from "@/db";
import CentralNavigator from "@/navigation/CentralNavigator";
import { ChatStoreProvider } from "@/stores/chatStore";
import { ThemeProvider } from "@/theme/ThemeProvider";

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
  const [fontsLoaded] = useFonts(CUSTOM_FONT_ASSETS);

  useEffect(() => {
    logTavilyConfigStatus();

    initializeAllDatabases()
      .then(() => setIsDbReady(true))
      .catch((error) => {
        console.error("Failed to initialize databases:", error);
      });
  }, []);

  if (!isDbReady || !fontsLoaded) {
    return (
      <View style={styles.bootContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ChatStoreProvider>
          <DialogProvider>
            <NavigationContainer>
              <CentralNavigator />
              <StatusBar style="light" />
            </NavigationContainer>
          </DialogProvider>
        </ChatStoreProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  bootContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
