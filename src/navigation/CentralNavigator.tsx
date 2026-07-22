import { Ionicons } from "@expo/vector-icons";
import { type BottomTabNavigationOptions, createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { RouteProp } from "@react-navigation/native";
import { createNativeStackNavigator, type NativeStackNavigationOptions } from "@react-navigation/native-stack";

import { colors } from "@/constants/theme";
import type {
  ChatsStackParamList,
  MainTabParamList,
  ModelsStackParamList,
  RootStackParamList,
  SettingsStackParamList,
} from "@/navigation/types";
import ChatListScreen from "@/screens/chats/ChatListScreen";
import ChatScreen from "@/screens/chats/ChatScreen";
import InitialScreen from "@/screens/InitialScreen";
import DownloadedModelsScreen from "@/screens/models/DownloadedModelsScreen";
import ModelDetailsScreen from "@/screens/models/ModelDetails";
import ModelsScreen from "@/screens/models/ModelsScreen";
import DeviceInfoScreen from "@/screens/settings/DeviceInfo";
import SettingsScreen from "@/screens/settings/SettingsScreen";

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const ModelsStack = createNativeStackNavigator<ModelsStackParamList>();
const ChatsStack = createNativeStackNavigator<ChatsStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  ModelsTab: "cube-outline",
  ChatsTab: "chatbubbles-outline",
  SettingsTab: "settings-outline",
};

/** Flat, themed header shared by every native stack. Blurred screens are frozen to avoid wasted renders. */
const stackScreenOptions: NativeStackNavigationOptions = {
  headerShadowVisible: false,
  headerStyle: { backgroundColor: colors.background },
  contentStyle: { backgroundColor: colors.background },
  freezeOnBlur: true,
};

const settingsStackScreenOptions: NativeStackNavigationOptions = {
  ...stackScreenOptions,
  headerLargeTitle: true,
};

/** Tab options with a per-route icon; inactive tabs are frozen to keep lifecycles clean. */
function tabScreenOptions({
  route,
}: {
  route: RouteProp<MainTabParamList, keyof MainTabParamList>;
}): BottomTabNavigationOptions {
  return {
    headerShown: false,
    freezeOnBlur: true,
    tabBarActiveTintColor: colors.tabActive,
    tabBarInactiveTintColor: colors.tabInactive,
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
    tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />,
  };
}

function modelDetailsScreenOptions({
  route,
}: {
  route: RouteProp<ModelsStackParamList, "ModelDetails">;
}): NativeStackNavigationOptions {
  return { title: route.params.model.author || "Model Details" };
}

function chatScreenOptions({ route }: { route: RouteProp<ChatsStackParamList, "Chat"> }): NativeStackNavigationOptions {
  return { title: route.params.title };
}

export default function CentralNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Initial" component={InitialScreen} />
      <RootStack.Screen name="Main" component={MainTabs} />
    </RootStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="ModelsTab" component={ModelsStackScreen} options={{ title: "Models" }} />
      <Tab.Screen name="ChatsTab" component={ChatsStackScreen} options={{ title: "Chats" }} />
      <Tab.Screen name="SettingsTab" component={SettingsStackScreen} options={{ title: "Settings" }} />
    </Tab.Navigator>
  );
}

function ModelsStackScreen() {
  return (
    <ModelsStack.Navigator screenOptions={stackScreenOptions}>
      <ModelsStack.Screen name="Models" component={ModelsScreen} options={{ title: "Models" }} />
      <ModelsStack.Screen
        name="DownloadedModels"
        component={DownloadedModelsScreen}
        options={{ title: "Downloaded Models" }}
      />
      <ModelsStack.Screen name="ModelDetails" component={ModelDetailsScreen} options={modelDetailsScreenOptions} />
    </ModelsStack.Navigator>
  );
}

function ChatsStackScreen() {
  return (
    <ChatsStack.Navigator screenOptions={stackScreenOptions}>
      <ChatsStack.Screen name="ChatList" component={ChatListScreen} />
      <ChatsStack.Screen name="Chat" component={ChatScreen} options={chatScreenOptions} />
    </ChatsStack.Navigator>
  );
}

function SettingsStackScreen() {
  return (
    <SettingsStack.Navigator screenOptions={settingsStackScreenOptions}>
      <SettingsStack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      <SettingsStack.Screen name="DeviceInfo" component={DeviceInfoScreen} options={{ title: "Device Info" }} />
    </SettingsStack.Navigator>
  );
}
