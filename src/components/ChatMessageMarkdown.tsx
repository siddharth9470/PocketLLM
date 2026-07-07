import { memo, useMemo } from "react";
import { Platform, StyleSheet, Text, type TextStyle, View } from "react-native";
import Markdown, { type MarkdownProps, renderRules } from "react-native-markdown-display";

import { colors, radii, spacing, typography } from "@/constants/theme";

const MESSAGE_LINE_HEIGHT = 22;

type ChatMessagePosition = "left" | "right";

type ChatMessageMarkdownProps = {
  text: string;
  position: ChatMessagePosition;
};

function resolveTextColor(position: ChatMessagePosition): string {
  return position === "right" ? colors.userBubbleText : colors.assistantText;
}

function buildMarkdownStyles(position: ChatMessagePosition): MarkdownProps["style"] {
  const textColor = resolveTextColor(position);
  const baseText: TextStyle = {
    ...typography.body,
    color: textColor,
    lineHeight: MESSAGE_LINE_HEIGHT,
  };

  return {
    body: {
      flexShrink: 1,
    },
    paragraph: {
      marginTop: MESSAGE_LINE_HEIGHT,
      marginBottom: 0,
    },
    text: baseText,
    textgroup: baseText,
    strong: {
      ...baseText,
      fontWeight: "700",
    },
    em: {
      ...baseText,
      fontStyle: "italic",
    },
    bullet_list: {
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
    },
    ordered_list: {
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
    },
    list_item: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: spacing.xs,
    },
    bullet_list_icon: {
      marginLeft: spacing.sm,
      marginRight: spacing.sm,
      lineHeight: MESSAGE_LINE_HEIGHT,
      fontSize: typography.body.fontSize,
      color: textColor,
    },
    bullet_list_content: {
      flex: 1,
      flexShrink: 1,
    },
    ordered_list_icon: {
      marginLeft: spacing.sm,
      marginRight: spacing.sm,
      lineHeight: MESSAGE_LINE_HEIGHT,
      fontSize: typography.body.fontSize,
      color: textColor,
    },
    ordered_list_content: {
      flex: 1,
      flexShrink: 1,
    },
    link: {
      ...baseText,
      color: position === "right" ? colors.userBubbleText : colors.primary,
      textDecorationLine: "underline",
    },
    code_inline: {
      ...baseText,
      backgroundColor: position === "right" ? "rgba(255,255,255,0.18)" : colors.chipBackground,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.xs,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    },
    heading1: {
      ...baseText,
      fontSize: 22,
      fontWeight: "700",
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    heading2: {
      ...baseText,
      fontSize: 20,
      fontWeight: "700",
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    heading3: {
      ...baseText,
      fontSize: 18,
      fontWeight: "600",
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
  };
}

const selectableMarkdownRules: MarkdownProps["rules"] = {
  ...renderRules,
  text: (node, _children, _parent, styles, inheritedStyles = {}) => (
    <Text key={node.key} style={[inheritedStyles, styles.text]} selectable>
      {node.content}
    </Text>
  ),
  textgroup: (node, children, _parent, styles) => (
    <Text key={node.key} style={styles.textgroup} selectable>
      {children}
    </Text>
  ),
};

function ChatMessageMarkdownComponent({ text, position }: ChatMessageMarkdownProps) {
  const markdownStyles = useMemo(() => buildMarkdownStyles(position), [position]);

  return (
    <View style={styles.container}>
      <Markdown style={markdownStyles} rules={selectableMarkdownRules} mergeStyle>
        {text}
      </Markdown>
    </View>
  );
}

export const ChatMessageMarkdown = memo(ChatMessageMarkdownComponent);

const styles = StyleSheet.create({
  container: {
    marginVertical: 5,
    marginHorizontal: spacing.sm + 2,
    flexShrink: 1,
    maxWidth: "100%",
  },
});
