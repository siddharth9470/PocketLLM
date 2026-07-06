import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { memo, useCallback } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import PrimaryButton from "../../components/PrimaryButton";
import { ChatScreenLabels } from "../../constants/chat";
import { colors, radii, spacing, typography } from "../../constants/theme";
import type { ChatsStackScreenProps } from "../../navigation/types";
import { useChatStore } from "../../stores/chatStore";
import type { Conversation } from "../../types/chat";
import { parseModelId } from "../../utils/parseModelId";

interface ConversationRowProps {
  conversation: Conversation;
  onOpen: (conversation: Conversation) => void;
  onDelete: (conversation: Conversation) => void;
}

const ConversationRow = memo(function ConversationRow({
  conversation,
  onOpen,
  onDelete,
}: ConversationRowProps) {
  const { name: modelName } = parseModelId(conversation.modelId || "unknown/model");

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.rowPressable}
        onPress={() => onOpen(conversation)}
        accessibilityRole="button"
        accessibilityLabel={conversation.title}
      >
        <View style={styles.rowContent}>
          <Text style={styles.title}>{conversation.title}</Text>
          <Text style={styles.preview} numberOfLines={1}>
            {conversation.preview}
          </Text>
          {conversation.modelId ? <Text style={styles.modelLabel}>{modelName}</Text> : null}
        </View>
      </Pressable>

      <Pressable
        style={styles.deleteButton}
        onPress={() => onDelete(conversation)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={ChatScreenLabels.DELETE_CHAT_ACCESSIBILITY}
      >
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
      </Pressable>

      <Text style={styles.chevron}>›</Text>
    </View>
  );
});

export default function ChatListScreen({ navigation }: ChatsStackScreenProps<"ChatList">) {
  const conversations = useChatStore((state) => state.conversations);
  const isLoadingConversations = useChatStore((state) => state.isLoadingConversations);
  const refreshConversations = useChatStore((state) => state.refreshConversations);
  const createConversationId = useChatStore((state) => state.createConversationId);
  const deleteConversation = useChatStore((state) => state.deleteConversation);

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

  const handleOpenConversation = useCallback(
    (conversation: Conversation) => {
      navigation.navigate("Chat", {
        conversationId: conversation.id,
        title: conversation.title,
      });
    },
    [navigation],
  );

  const handleDeleteConversation = useCallback(
    (conversation: Conversation) => {
      Alert.alert(ChatScreenLabels.DELETE_CHAT_TITLE, ChatScreenLabels.DELETE_CHAT_MESSAGE, [
        { text: ChatScreenLabels.DELETE_CHAT_CANCEL, style: "cancel" },
        {
          text: ChatScreenLabels.DELETE_CHAT_CONFIRM,
          style: "destructive",
          onPress: () => {
            void deleteConversation(conversation.id).catch((error: unknown) => {
              console.error("Failed to delete conversation:", error);
              Alert.alert(ChatScreenLabels.DELETE_CHAT_TITLE, ChatScreenLabels.DELETE_CHAT_FAILED);
            });
          },
        },
      ]);
    },
    [deleteConversation],
  );

  const renderConversation = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationRow conversation={item} onOpen={handleOpenConversation} onDelete={handleDeleteConversation} />
    ),
    [handleDeleteConversation, handleOpenConversation],
  );

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
        renderItem={renderConversation}
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
    borderRadius: radii.md,
    paddingRight: spacing.lg,
  },
  rowPressable: {
    flex: 1,
    flexShrink: 1,
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
  deleteButton: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: 44,
    marginLeft: spacing.xs,
  },
  chevron: {
    fontSize: 24,
    color: colors.textTertiary,
    marginLeft: spacing.xs,
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
