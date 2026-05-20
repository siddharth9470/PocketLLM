import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Initial: undefined;
  Home: undefined;
};

export type InitialScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Initial'
>;

export type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
