import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "@/constants/theme";
import type { SettingsStackParamList } from "@/navigation/types";
import SettingsScreen from "@/screens/settings/SettingsScreen";

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerLargeTitle: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
    </Stack.Navigator>
  );
}
