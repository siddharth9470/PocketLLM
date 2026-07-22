import { Ionicons } from "@expo/vector-icons";
import { type BottomTabNavigationOptions, createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { RouteProp } from "@react-navigation/native";
import { createNativeStackNavigator, type NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";

import AppHeader from "@/components/AppHeader";
import type { ThemeColors } from "@/constants/theme";
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
import { useTheme } from "@/theme/ThemeProvider";

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

/** Themed custom header shared by every native stack. Blurred screens are frozen to avoid wasted renders. */
function buildStackScreenOptions(colors: ThemeColors): NativeStackNavigationOptions {
  return {
    header: (props) => <AppHeader {...props} />,
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.background },
    freezeOnBlur: true,
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
  const { colors } = useTheme();

  const screenOptions = useCallback(
    ({ route }: { route: RouteProp<MainTabParamList, keyof MainTabParamList> }): BottomTabNavigationOptions => ({
      headerShown: false,
      freezeOnBlur: true,
      tabBarActiveTintColor: colors.tabActive,
      tabBarInactiveTintColor: colors.tabInactive,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />,
    }),
    [colors],
  );

  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="ModelsTab" component={ModelsStackScreen} options={{ title: "Models" }} />
      <Tab.Screen name="ChatsTab" component={ChatsStackScreen} options={{ title: "Chats" }} />
      <Tab.Screen name="SettingsTab" component={SettingsStackScreen} options={{ title: "Settings" }} />
    </Tab.Navigator>
  );
}

function ModelsStackScreen() {
  const { colors } = useTheme();
  const screenOptions = useMemo(() => buildStackScreenOptions(colors), [colors]);

  return (
    <ModelsStack.Navigator screenOptions={screenOptions}>
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
  const { colors } = useTheme();
  const screenOptions = useMemo(() => buildStackScreenOptions(colors), [colors]);

  return (
    <ChatsStack.Navigator screenOptions={screenOptions}>
      <ChatsStack.Screen name="ChatList" component={ChatListScreen} options={{ title: "Chats" }} />
      <ChatsStack.Screen name="Chat" component={ChatScreen} options={chatScreenOptions} />
    </ChatsStack.Navigator>
  );
}

function SettingsStackScreen() {
  const { colors } = useTheme();
  const screenOptions = useMemo(() => buildStackScreenOptions(colors), [colors]);

  return (
    <SettingsStack.Navigator screenOptions={screenOptions}>
      <SettingsStack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      <SettingsStack.Screen name="DeviceInfo" component={DeviceInfoScreen} options={{ title: "Device Info" }} />
    </SettingsStack.Navigator>
  );
}
