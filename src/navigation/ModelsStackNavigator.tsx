import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ModelsScreen from '../screens/models/ModelsScreen';
import { colors } from '../constants/theme';
import type { ModelsStackParamList } from './types';

const Stack = createNativeStackNavigator<ModelsStackParamList>();

export default function ModelsStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerLargeTitle: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="Models"
        component={ModelsScreen}
        options={{ title: 'Models' }}
      />
    </Stack.Navigator>
  );
}
