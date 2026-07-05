import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { colors } from "../constants/theme";
import ChatListScreen from "../screens/chats/ChatListScreen";
import ChatScreen from "../screens/chats/ChatScreen";
import InitialScreen from "../screens/InitialScreen";
import DownloadedModelsScreen from "../screens/models/DownloadedModelsScreen";
import ModelsScreen from "../screens/models/ModelsScreen";
import SettingsScreen from "../screens/settings/SettingsScreen";
import type {
  ChatsStackParamList,
  MainTabParamList,
  ModelsStackParamList,
  RootStackParamList,
  SettingsStackParamList,
} from "./types";

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const ModelsStack = createNativeStackNavigator<ModelsStackParamList>();
const ChatsStack = createNativeStackNavigator<ChatsStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

export default function CentralNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Initial" component={InitialScreen} />
      <RootStack.Screen
        name="Main"
        component={MainTab}
        options={{ headerShown: false }}
      />
    </RootStack.Navigator>
  );
}

// --- Sub-navigators (kept below the main Root export for quick traceability) ---

function MainTab() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => {
          const iconName = getTabIcon(route.name as keyof MainTabParamList);
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="ModelsTab"
        component={ModelsStackNavigator}
        options={{ title: "Models" }}
      />
      <Tab.Screen
        name="ChatsTab"
        component={ChatsStackNavigator}
        options={{ title: "Chats" }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStackNavigator}
        options={{ title: "Settings" }}
      />
    </Tab.Navigator>
  );
}

function ModelsStackNavigator() {
  return (
    <ModelsStack.Navigator
      screenOptions={{
        headerLargeTitle: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <ModelsStack.Screen
        name="Models"
        component={ModelsScreen}
        options={{ title: "Models" }}
      />
      <ModelsStack.Screen
        name="DownloadedModels"
        component={DownloadedModelsScreen}
        options={{ title: "Downloaded Models" }}
      />
    </ModelsStack.Navigator>
  );
}

function ChatsStackNavigator() {
  return (
    <ChatsStack.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <ChatsStack.Screen name="ChatList" component={ChatListScreen} />
      <ChatsStack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
    </ChatsStack.Navigator>
  );
}

function SettingsStackNavigator() {
  return (
    <SettingsStack.Navigator
      screenOptions={{
        headerLargeTitle: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <SettingsStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings" }}
      />
    </SettingsStack.Navigator>
  );
}

function getTabIcon(
  routeName: keyof MainTabParamList,
): keyof typeof Ionicons.glyphMap {
  switch (routeName) {
    case "ModelsTab":
      return "cube-outline";
    case "ChatsTab":
      return "chatbubbles-outline";
    case "SettingsTab":
      return "settings-outline";
    default:
      return "ellipse-outline";
  }
}
