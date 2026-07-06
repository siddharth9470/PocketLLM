import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { initializeAllDatabases } from "./src/db";
import CentralNavigator from "./src/navigation/CentralNavigator";
import { ChatStoreProvider } from "./src/stores/chatStore";
///import { DownloadStoreProvider } from "./src/stores/downloadStore";

export default function App() {
  useEffect(() => {
    initializeAllDatabases();
  }, []);

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
