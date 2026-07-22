import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { radii, spacing, type ThemeColors, typography } from "@/constants/theme";
import { useTheme } from "@/theme/ThemeProvider";
import type { ChatMessage } from "@/types/chat";

interface ChatBubbleProps {
  message: ChatMessage;
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isUser = message.role === "user";

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>{message.content}</Text>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    rowUser: {
      alignItems: "flex-end",
    },
    rowAssistant: {
      alignItems: "flex-start",
    },
    bubble: {
      maxWidth: "82%",
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    userBubble: {
      backgroundColor: colors.userBubble,
      borderBottomRightRadius: radii.sm,
    },
    assistantBubble: {
      backgroundColor: colors.assistantBubble,
      borderBottomLeftRadius: radii.sm,
    },
    text: {
      ...typography.body,
      lineHeight: 22,
    },
    userText: {
      color: colors.userBubbleText,
    },
    assistantText: {
      color: colors.assistantText,
    },
  });
