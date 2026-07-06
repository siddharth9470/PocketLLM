import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "../../constants/theme";
import type { ChatsStackScreenProps } from "../../navigation/types";
import { useChatStore } from "../../stores/chatStore";
import { parseModelId } from "../../utils/parseModelId";

export default function ChatListScreen({ navigation }: ChatsStackScreenProps<"ChatList">) {
  const conversations = useChatStore((state) => state.conversations);

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const { name: modelName } = parseModelId(item.modelId);

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
                <Text style={styles.modelLabel}>{modelName}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
});
