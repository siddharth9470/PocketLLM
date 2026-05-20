import { createNativeStackNavigator } from '@react-navigation/native-stack';

import InitialScreen from '../screens/InitialScreen';
import type { RootStackParamList } from './types';
import MainTabNavigator from './MainTabNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Initial" component={InitialScreen} />
      <Stack.Screen name="Main" component={MainTabNavigator} />
    </Stack.Navigator>
  );
}
