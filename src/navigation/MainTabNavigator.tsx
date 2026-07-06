import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { colors } from "../constants/theme";
import ChatsStackNavigator from "./ChatsStackNavigator";
import ModelsStackNavigator from "./ModelsStackNavigator";
import SettingsStackNavigator from "./SettingsStackNavigator";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
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
          const iconName = getTabIcon(route.name);
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="ModelsTab" component={ModelsStackNavigator} options={{ title: "Models" }} />
      <Tab.Screen name="ChatsTab" component={ChatsStackNavigator} options={{ title: "Chats" }} />
      <Tab.Screen name="SettingsTab" component={SettingsStackNavigator} options={{ title: "Settings" }} />
    </Tab.Navigator>
  );
}

function getTabIcon(routeName: keyof MainTabParamList): keyof typeof Ionicons.glyphMap {
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
