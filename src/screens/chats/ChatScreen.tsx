import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { Bubble, GiftedChat, InputToolbar, type IMessage, Send } from "react-native-gifted-chat";

import ModelPicker from "../../components/ModelPicker";
import { ChatScreenLabels } from "../../constants/chat";
import { colors, radii, spacing, typography } from "../../constants/theme";
import { getDownloadedModelsList } from "../../db/ModelDB";
import type { ChatsStackScreenProps } from "../../navigation/types";
import {
  classifyInferenceError,
  initializeModel,
  releaseModel,
  resolveDownloadedModelPath,
} from "../../services/chatHelper";
import { useChatStore } from "../../stores/chatStore";
import type { HuggingFaceModel } from "../../types/models";
import { generateChatId } from "../../utils/chatIds";
import { isLanguageModelGgufFilename } from "../../utils/ggufFileSelection";
import { CHAT_USER, toGiftedChatMessages } from "../../utils/giftedChatAdapter";

function isDownloadReadyModel(model: HuggingFaceModel): boolean {
  const localFilePath = model.downloadInfo?.localFilePath;
  return (
    model.downloadInfo?.status === "completed" &&
    Boolean(localFilePath) &&
    isLanguageModelGgufFilename(localFilePath ?? "")
  );
}

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
  const [isModelPickerVisible, setIsModelPickerVisible] = useState(false);
  const [readyModelIds, setReadyModelIds] = useState<Set<string>>(new Set());

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const headerHeight = 130;

  const refreshReadyModels = useCallback(async () => {
    try {
      const models = await getDownloadedModelsList();
      setReadyModelIds(new Set(models.filter(isDownloadReadyModel).map((model) => model.id)));
    } catch (error) {
      console.error("Failed to load downloaded models for chat:", error);
    }
  }, []);

  const isModelReady = Boolean(selectedModelId && readyModelIds.has(selectedModelId));

  const showInferenceError = useCallback((message: string) => {
    Alert.alert(ChatScreenLabels.INFERENCE_ERROR_TITLE, message);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isCancelled = false;

      setActiveConversationId(conversationId);
      setIsChatUiMounted(true);
      void refreshReadyModels();

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
        setIsModelPickerVisible(false);
        void releaseModel();
      };
    }, [conversationId, loadConversation, refreshReadyModels, setActiveConversationId]),
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
    if (!isChatUiMounted) {
      return;
    }

    if (isModelReady) {
      setIsModelPickerVisible(false);
      return;
    }

    const assignedModelId = selectedModelId ?? conversation?.modelId;
    if (assignedModelId) {
      return;
    }

    if (isInitialLoad) {
      return;
    }

    setIsModelPickerVisible(true);
  }, [
    conversation?.modelId,
    isChatUiMounted,
    isInitialLoad,
    isModelReady,
    selectedModelId,
  ]);

  useEffect(() => {
    if (!isChatUiMounted || !conversation?.title) {
      return;
    }

    navigation.setOptions({ title: conversation.title });
  }, [conversation?.title, isChatUiMounted, navigation]);

  const giftedMessages = useMemo(() => toGiftedChatMessages(conversation?.messages ?? []), [conversation?.messages]);

  const hasStreamingContent = useMemo(
    () =>
      conversation?.messages?.some((message) => message.status === "streaming" && message.content.trim().length > 0) ??
      false,
    [conversation?.messages],
  );

  const handleSend = useCallback(
    (messages: IMessage[] = []) => {
      if (isSending || !isModelReady || !selectedModelId) {
        if (!isModelReady) {
          setIsModelPickerVisible(true);
        }
        return;
      }

      const text = messages[0]?.text.trim();
      if (!text) {
        return;
      }

      Keyboard.dismiss();

      void sendMessage(conversationId, text, {
        modelId: selectedModelId,
        onInferenceError: showInferenceError,
      });
    },
    [conversationId, isModelReady, isSending, selectedModelId, sendMessage, showInferenceError],
  );

  const renderInputToolbar = useCallback(
    (props: ComponentProps<typeof InputToolbar>) => (
      <InputToolbar
        {...props}
        containerStyle={styles.inputToolbarContainer}
        primaryStyle={styles.inputToolbarPrimary}
      />
    ),
    [],
  );

  const handleSelectModel = useCallback(
    async (model: HuggingFaceModel) => {
      const modelPath = await resolveDownloadedModelPath(model.id);
      if (!modelPath) {
        showInferenceError(ChatScreenLabels.MODEL_UNAVAILABLE);
        return;
      }

      try {
        await initializeModel(modelPath);
      } catch (error) {
        showInferenceError(classifyInferenceError(error).userMessage);
        return;
      }

      setSelectedModelId(model.id);
      setReadyModelIds((prev) => new Set(prev).add(model.id));
      setIsModelPickerVisible(false);
      void setConversationModel(conversationId, model.id);
    },
    [conversationId, setConversationModel, showInferenceError],
  );

  const renderSend = useCallback(
    (props: ComponentProps<typeof Send>) => {
      if (!isModelReady) {
        return null;
      }

      return <Send {...props} />;
    },
    [isModelReady],
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
      {!isModelReady ? (
        <Pressable style={styles.modelPromptBanner} onPress={() => setIsModelPickerVisible(true)}>
          <Text style={styles.modelPromptText}>{ChatScreenLabels.MODEL_SELECT_PROMPT}</Text>
        </Pressable>
      ) : null}

      <View style={styles.modelPickerRow}>
        <ModelPicker
          selectedModelId={selectedModelId}
          visible={isModelPickerVisible}
          onOpenRequest={() => setIsModelPickerVisible(true)}
          onClose={() => setIsModelPickerVisible(false)}
          onSelectModel={handleSelectModel}
        />
      </View>

      <View style={styles.chatContainer}>
        {isChatUiMounted ? (
          <GiftedChat
            key={conversationId}
            messages={giftedMessages}
            onSend={handleSend}
            user={CHAT_USER}
            colorScheme="light"
            messageIdGenerator={generateChatId}
            renderBubble={renderBubble}
            renderInputToolbar={renderInputToolbar}
            renderSend={renderSend}
            isSendButtonAlwaysVisible
            renderAvatar={() => null}
            isUserAvatarVisible={false}
            isTyping={isSending && !hasStreamingContent}
            messagesContainerStyle={styles.messagesContainer}
            textInputProps={{
              style: styles.composerInput,
              editable: isModelReady,
              placeholder: isModelReady
                ? ChatScreenLabels.COMPOSER_PLACEHOLDER
                : ChatScreenLabels.MODEL_REQUIRED,
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
  modelPromptBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.chipBackground,
  },
  modelPromptText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
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
  inputToolbarContainer: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
  },
  inputToolbarPrimary: {
    backgroundColor: colors.background,
  },
  composerInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.chipBackground,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.sm,
    lineHeight: 22,
    flex: 1,
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
