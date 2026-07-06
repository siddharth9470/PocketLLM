import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, StyleSheet, View } from "react-native";
import { Bubble, GiftedChat, type IMessage } from "react-native-gifted-chat";

import ModelPicker from "../../components/ModelPicker";
import { ChatScreenLabels } from "../../constants/chat";
import { colors, radii, spacing, typography } from "../../constants/theme";
import type { ChatsStackScreenProps } from "../../navigation/types";
import { useChatStore } from "../../stores/chatStore";
import type { HuggingFaceModel } from "../../types/models";
import { generateChatId } from "../../utils/chatIds";
import { CHAT_USER, toGiftedChatMessages } from "../../utils/giftedChatAdapter";

export default function ChatScreen({ route, navigation }: ChatsStackScreenProps<"Chat">) {
  const { conversationId } = route.params;

  const conversation = useChatStore((state) => state.conversationDetails[conversationId]);
  const loadConversation = useChatStore((state) => state.loadConversation);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const setConversationModel = useChatStore((state) => state.setConversationModel);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);
  const isSending = useChatStore((state) => state.isSending);

  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(conversation?.modelId);
  const [isInitialLoad, setIsInitialLoad] = useState(() => conversation === undefined);
  const [isChatUiMounted, setIsChatUiMounted] = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const headerHeight = useHeaderHeight();

  useFocusEffect(
    useCallback(() => {
      let isCancelled = false;

      setActiveConversationId(conversationId);
      setIsChatUiMounted(true);

      void loadConversation(conversationId).finally(() => {
        if (!isCancelled && isMountedRef.current) {
          setIsInitialLoad(false);
        }
      });

      return () => {
        isCancelled = true;
        setActiveConversationId(null);
        Keyboard.dismiss();
        setIsChatUiMounted(false);
      };
    }, [conversationId, loadConversation, setActiveConversationId]),
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      Keyboard.dismiss();
      setIsChatUiMounted(false);
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (!isChatUiMounted || !conversation?.modelId) {
      return;
    }

    setSelectedModelId(conversation.modelId);
  }, [conversation?.modelId, isChatUiMounted]);

  useEffect(() => {
    if (!isChatUiMounted || !conversation?.title) {
      return;
    }

    navigation.setOptions({ title: conversation.title });
  }, [conversation?.title, isChatUiMounted, navigation]);

  const giftedMessages = useMemo(
    () => toGiftedChatMessages(conversation?.messages ?? []),
    [conversation?.messages],
  );

  const handleSend = useCallback(
    (messages: IMessage[] = []) => {
      if (isSending) {
        return;
      }

      const text = messages[0]?.text.trim();
      if (!text) {
        return;
      }

      void sendMessage(conversationId, text, {
        modelId: selectedModelId,
      });
    },
    [conversationId, isSending, selectedModelId, sendMessage],
  );

  const handleSelectModel = useCallback(
    (model: HuggingFaceModel) => {
      setSelectedModelId(model.id);
      void setConversationModel(conversationId, model.id);
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

  if (isInitialLoad && conversation === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.modelPickerRow}>
        <ModelPicker onSelectModel={handleSelectModel} />
      </View>

      <View style={styles.chatContainer}>
        {isChatUiMounted ? (
          <GiftedChat
            key={conversationId}
            messages={giftedMessages}
            onSend={handleSend}
            user={CHAT_USER}
            messageIdGenerator={generateChatId}
            renderBubble={renderBubble}
            renderAvatar={() => null}
            isUserAvatarVisible={false}
            isTyping={isSending}
            messagesContainerStyle={styles.messagesContainer}
            textInputProps={{
              style: styles.composerInput,
              placeholder: ChatScreenLabels.COMPOSER_PLACEHOLDER,
              placeholderTextColor: colors.textSecondary,
            }}
            keyboardAvoidingViewProps={{
              keyboardVerticalOffset: headerHeight,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  modelPickerRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    alignItems: "flex-end",
  },
  chatContainer: {
    flex: 1,
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
