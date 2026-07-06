import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import PrimaryButton from "../../components/PrimaryButton";
import { ChatScreenLabels } from "../../constants/chat";
import { colors, spacing, typography } from "../../constants/theme";
import type { ChatsStackScreenProps } from "../../navigation/types";
import { useChatStore } from "../../stores/chatStore";
import { parseModelId } from "../../utils/parseModelId";

export default function ChatListScreen({ navigation }: ChatsStackScreenProps<"ChatList">) {
  const conversations = useChatStore((state) => state.conversations);
  const isLoadingConversations = useChatStore((state) => state.isLoadingConversations);
  const refreshConversations = useChatStore((state) => state.refreshConversations);
  const createConversationId = useChatStore((state) => state.createConversationId);

  useFocusEffect(
    useCallback(() => {
      void refreshConversations().catch((error: unknown) => {
        console.error("Failed to refresh conversations on focus:", error);
      });
    }, [refreshConversations]),
  );

  const handleCreateNewChat = useCallback(() => {
    const conversationId = createConversationId();
    navigation.navigate("Chat", {
      conversationId,
      title: ChatScreenLabels.NEW_CHAT_TITLE,
    });
  }, [createConversationId, navigation]);

  if (!isLoadingConversations && conversations.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{ChatScreenLabels.EMPTY_STATE}</Text>
          <PrimaryButton label={ChatScreenLabels.CREATE_NEW_CHAT} onPress={handleCreateNewChat} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const { name: modelName } = parseModelId(item.modelId || "unknown/model");

          return (
            <Pressable
              style={styles.row}
              onPress={() =>
                navigation.navigate("Chat", {
                  conversationId: item.id,
                  title: item.title,
                })
              }
            >
              <View style={styles.rowContent}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.preview} numberOfLines={1}>
                  {item.preview}
                </Text>
                {item.modelId ? <Text style={styles.modelLabel}>{modelName}</Text> : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <View style={styles.footer}>
        <PrimaryButton label={ChatScreenLabels.CREATE_NEW_CHAT} onPress={handleCreateNewChat} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  emptyText: {
    ...typography.headline,
    color: colors.textSecondary,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
  },
  rowContent: {
    flex: 1,
  },
  title: {
    ...typography.headline,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  preview: {
    ...typography.body,
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  modelLabel: {
    ...typography.caption,
    color: colors.primary,
  },
  chevron: {
    fontSize: 24,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  separator: {
    height: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
