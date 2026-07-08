import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { HuggingFaceModel } from "@/types/models";

export type RootStackParamList = {
  Initial: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  ModelsTab: undefined;
  ChatsTab: undefined;
  SettingsTab: undefined;
};

export type ModelsStackParamList = {
  Models: undefined;
  DownloadedModels: undefined;
  ModelDetails: { model: HuggingFaceModel };
};

export type ChatsStackParamList = {
  ChatList: undefined;
  Chat: { conversationId: string; title: string };
};

export type SettingsStackParamList = {
  Settings: undefined;
  DeviceInfo: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList> = BottomTabScreenProps<MainTabParamList, T>;

export type ModelsStackScreenProps<T extends keyof ModelsStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<ModelsStackParamList, T>,
  BottomTabScreenProps<MainTabParamList>
>;

export type ChatsStackScreenProps<T extends keyof ChatsStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<ChatsStackParamList, T>,
  BottomTabScreenProps<MainTabParamList>
>;

export type SettingsStackScreenProps<T extends keyof SettingsStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, T>,
  BottomTabScreenProps<MainTabParamList>
>;
