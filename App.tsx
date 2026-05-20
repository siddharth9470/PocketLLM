import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";

import RootNavigator from "./src/navigation/RootNavigator";
import { ChatStoreProvider } from "./src/stores/chatStore";
import { DownloadStoreProvider } from "./src/stores/downloadStore";

export default function App() {
    return (
        <ChatStoreProvider>
            <DownloadStoreProvider>
                <NavigationContainer>
                    <RootNavigator />
                    <StatusBar style="auto" />
                </NavigationContainer>
            </DownloadStoreProvider>
        </ChatStoreProvider>
    );
}
