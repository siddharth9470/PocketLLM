import { useHeaderHeight } from "@react-navigation/elements";
import { useCallback, useMemo, type ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import { Bubble, GiftedChat, type IMessage } from "react-native-gifted-chat";

import ModelPicker from "../../components/ModelPicker";
import { colors, radii, spacing, typography } from "../../constants/theme";
import type { ChatsStackScreenProps } from "../../navigation/types";
import { useChatStore } from "../../stores/chatStore";
import type { HuggingFaceModel } from "../../types/models";
import {
  CHAT_USER,
  toGiftedChatMessages,
} from "../../utils/giftedChatAdapter";

export default function ChatScreen({
  route,
}: ChatsStackScreenProps<"Chat">) {
  const { conversationId } = route.params;
  const conversation = useChatStore((state) =>
    state.getConversation(conversationId),
  );
  const sendMessage = useChatStore((state) => state.sendMessage);
  const setConversationModel = useChatStore(
    (state) => state.setConversationModel,
  );

  const headerHeight = useHeaderHeight();

  const giftedMessages = useMemo(
    () => toGiftedChatMessages(conversation?.messages ?? []),
    [conversation?.messages],
  );

  const handleSend = useCallback(
    (messages: IMessage[] = []) => {
      const text = messages[0]?.text.trim();
      if (!text) {
        return;
      }

      sendMessage(conversationId, text);
    },
    [conversationId, sendMessage],
  );

  const handleSelectModel = useCallback(
    (model: HuggingFaceModel) => {
      setConversationModel(conversationId, model.id);
    },
    [conversationId, setConversationModel],
  );

  const renderBubble = useCallback(
    (props: ComponentProps<typeof Bubble>) => (
      <Bubble
        {...props}
        wrapperStyle={{
          left: styles.assistantBubble,
          right: styles.userBubble,
        }}
        textStyle={{
          left: styles.assistantText,
          right: styles.userText,
        }}
      />
    ),
    [],
  );

  return (
    <View style={styles.container}>
      <View style={styles.modelPickerRow}>
        <ModelPicker onSelectModel={handleSelectModel} />
      </View>

      <GiftedChat
        messages={giftedMessages}
        onSend={handleSend}
        user={CHAT_USER}
        renderBubble={renderBubble}
        renderAvatar={() => null}
        isUserAvatarVisible={false}
        messagesContainerStyle={styles.messagesContainer}
        textInputProps={{
          style: styles.composerInput,
          placeholder: "Message...",
          placeholderTextColor: colors.textSecondary,
        }}
        keyboardAvoidingViewProps={{
          keyboardVerticalOffset: headerHeight,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modelPickerRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    alignItems: "flex-end",
  },
  messagesContainer: {
    backgroundColor: colors.background,
  },
  composerInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.chipBackground,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.sm,
    lineHeight: 22,
  },
  userBubble: {
    backgroundColor: colors.userBubble,
    borderBottomRightRadius: radii.sm,
  },
  assistantBubble: {
    backgroundColor: colors.assistantBubble,
    borderBottomLeftRadius: radii.sm,
  },
  userText: {
    ...typography.body,
    color: colors.userBubbleText,
  },
  assistantText: {
    ...typography.body,
    color: colors.assistantText,
  },
});
