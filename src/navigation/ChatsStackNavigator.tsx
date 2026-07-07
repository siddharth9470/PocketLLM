import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "@/constants/theme";
import type { ChatsStackParamList } from "@/navigation/types";
import ChatListScreen from "@/screens/chats/ChatListScreen";
import ChatScreen from "@/screens/chats/ChatScreen";

const Stack = createNativeStackNavigator<ChatsStackParamList>();

export default function ChatsStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="ChatList" component={ChatListScreen} />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({
          title: route.params.title,
          freezeOnBlur: true,
        })}
      />
    </Stack.Navigator>
  );
}
