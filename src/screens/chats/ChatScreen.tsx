import { useFocusEffect } from "@react-navigation/native";
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  type TextInputContentSizeChangeEvent,
  View,
} from "react-native";
import { TextInput } from "react-native-gesture-handler";
import {
  Bubble,
  type Composer,
  GiftedChat,
  type IMessage,
  InputToolbar,
  type MessageTextProps,
  Send,
} from "react-native-gifted-chat";

import { ChatMessageMarkdown } from "@/components/ChatMessageMarkdown";
import ModelPicker from "@/components/ModelPicker";
import { ChatScreenLabels } from "@/constants/chat";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { getDownloadedModelsList } from "@/db/ModelDB";
import type { ChatsStackScreenProps } from "@/navigation/types";
import { initializeModel, resolveDownloadedModelPath } from "@/services/chatHelper";
import { useChatStore } from "@/stores/chatStore";
import type { HuggingFaceModel } from "@/types/models";
import { generateChatId } from "@/utils/chatIds";
import { isLanguageModelGgufFilename } from "@/utils/ggufFileSelection";
import { CHAT_USER, type PocketChatMessage, toGiftedChatMessages } from "@/utils/giftedChatAdapter";

const COMPOSER_LINE_HEIGHT = 22;
const COMPOSER_VERTICAL_PADDING = spacing.sm * 2;
const COMPOSER_MIN_HEIGHT = COMPOSER_LINE_HEIGHT + COMPOSER_VERTICAL_PADDING;
const COMPOSER_MAX_LINES = 6;
const COMPOSER_MAX_HEIGHT = COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES + COMPOSER_VERTICAL_PADDING;

function ChatComposer({ text = "", textInputProps }: ComponentProps<typeof Composer>) {
  const [inputHeight, setInputHeight] = useState(COMPOSER_MIN_HEIGHT);

  useEffect(() => {
    if (!text) {
      setInputHeight(COMPOSER_MIN_HEIGHT);
    }
  }, [text]);

  const handleContentSizeChange = useCallback(
    (event: TextInputContentSizeChangeEvent) => {
      const contentHeight = event.nativeEvent.contentSize.height;
      const nextHeight = Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, contentHeight));

      setInputHeight(nextHeight);
      textInputProps?.onContentSizeChange?.(event);
    },
    [textInputProps],
  );

  const placeholder = textInputProps?.placeholder ?? ChatScreenLabels.COMPOSER_PLACEHOLDER;
  const accessibilityLabel =
    textInputProps?.accessibilityLabel ?? (placeholder.length > 0 ? placeholder : ChatScreenLabels.MODEL_SELECT_PROMPT);

  return (
    <View style={styles.composerContainer}>
      <TextInput
        {...textInputProps}
        testID={placeholder.length > 0 ? placeholder : ChatScreenLabels.COMPOSER_PLACEHOLDER}
        accessible
        accessibilityLabel={accessibilityLabel}
        value={text}
        multiline
        scrollEnabled={inputHeight >= COMPOSER_MAX_HEIGHT}
        enablesReturnKeyAutomatically
        underlineColorAndroid="transparent"
        keyboardAppearance="light"
        placeholder={placeholder}
        onContentSizeChange={handleContentSizeChange}
        style={[styles.composerInput, { height: Math.max(COMPOSER_MIN_HEIGHT, inputHeight) }, textInputProps?.style]}
      />
    </View>
  );
}

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
  const [selectedModelPath, setSelectedModelPath] = useState<string | undefined>();
  const [isInitialLoad, setIsInitialLoad] = useState(() => conversation === undefined);
  const [isChatUiMounted, setIsChatUiMounted] = useState(false);
  const [isModelPickerVisible, setIsModelPickerVisible] = useState(false);
  const [readyModelIds, setReadyModelIds] = useState<Set<string>>(new Set());
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedModelId) {
      setSelectedModelPath(undefined);
      return;
    }

    let isCancelled = false;

    void resolveDownloadedModelPath(selectedModelId).then((path) => {
      if (!isCancelled && path) {
        setSelectedModelPath(path);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [selectedModelId]);

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

  const showChatError = useCallback((message: string) => {
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
  }, [conversation?.modelId, isChatUiMounted, isInitialLoad, isModelReady, selectedModelId]);

  useEffect(() => {
    if (!isChatUiMounted || !conversation?.title) {
      return;
    }

    navigation.setOptions({ title: conversation.title });
  }, [conversation?.title, isChatUiMounted, navigation]);

  const giftedMessages = useMemo(() => toGiftedChatMessages(conversation?.messages ?? []), [conversation?.messages]);

  const handleSend = useCallback(
    (messages: IMessage[] = []) => {
      if (isSending || !isModelReady || !selectedModelId) {
        if (!isModelReady) {
          setIsModelPickerVisible(true);
        }
        return;
      }

      const text = messages[0]?.text.trim() ?? "";
      if (!text) {
        return;
      }

      Keyboard.dismiss();

      void sendMessage(conversationId, text, {
        modelId: selectedModelId,
        onSendError: showChatError,
      });
    },
    [conversationId, isModelReady, isSending, selectedModelId, sendMessage, showChatError],
  );

  const renderInputToolbar = useCallback(
    (props: ComponentProps<typeof InputToolbar>) => (
      <InputToolbar {...props} containerStyle={styles.inputToolbarContainer} primaryStyle={styles.inputToolbarPrimary} />
    ),
    [],
  );

  const renderComposer = useCallback((props: ComponentProps<typeof Composer>) => <ChatComposer {...props} />, []);

  const composerTextInputProps = useMemo(() => {
    const placeholder = isModelReady
      ? ChatScreenLabels.COMPOSER_PLACEHOLDER
      : isLoadingModel
        ? ChatScreenLabels.MODEL_LOADING
        : "";

    const accessibilityLabel = isModelReady
      ? ChatScreenLabels.COMPOSER_PLACEHOLDER
      : isLoadingModel
        ? ChatScreenLabels.MODEL_LOADING
        : ChatScreenLabels.MODEL_SELECT_PROMPT;

    return {
      editable: isModelReady,
      placeholder,
      accessibilityLabel,
      placeholderTextColor: colors.textSecondary,
    };
  }, [isLoadingModel, isModelReady]);

  const handleSelectModel = useCallback(
    async (model: HuggingFaceModel) => {
      setIsLoadingModel(true);
      setSelectedModelId(model.id);
      setIsModelPickerVisible(false);

      try {
        const modelPath = await resolveDownloadedModelPath(model.id);
        if (!modelPath) {
          setSelectedModelId(undefined);
          showChatError(ChatScreenLabels.MODEL_UNAVAILABLE);
          return;
        }

        await initializeModel(modelPath);
        setSelectedModelPath(modelPath);
        setReadyModelIds((prev) => new Set(prev).add(model.id));
        void setConversationModel(conversationId, model.id);
      } catch (error) {
        setSelectedModelId(undefined);
        showChatError(error instanceof Error ? error.message : ChatScreenLabels.MODEL_INIT_FAILED);
      } finally {
        setIsLoadingModel(false);
      }
    },
    [conversationId, setConversationModel, showChatError],
  );

  const renderSend = useCallback(
    (props: ComponentProps<typeof Send>) => {
      if (!isModelReady) {
        return null;
      }

      const hasText = (props.text?.trim().length ?? 0) > 0;
      if (!hasText) {
        return null;
      }

      return <Send {...props} />;
    },
    [isModelReady],
  );

  const renderMessageText = useCallback((props: MessageTextProps<PocketChatMessage>) => {
    const text = props.currentMessage?.text;
    if (!text) {
      return null;
    }

    return <ChatMessageMarkdown text={text} position={props.position ?? "left"} />;
  }, []);

  const renderBubble = useCallback(
    (props: ComponentProps<typeof Bubble>) => (
      <Bubble
        {...props}
        wrapperStyle={{
          left: styles.assistantBubble,
          right: styles.userBubble,
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
            renderMessageText={renderMessageText}
            renderInputToolbar={renderInputToolbar}
            renderComposer={renderComposer}
            renderSend={renderSend}
            isSendButtonAlwaysVisible
            renderAvatar={() => null}
            isUserAvatarVisible={false}
            isTyping={isSending}
            messagesContainerStyle={styles.messagesContainer}
            textInputProps={composerTextInputProps}
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
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.xs,
  },
  inputToolbarPrimary: {
    alignItems: "flex-end",
    backgroundColor: colors.background,
  },
  composerContainer: {
    flex: 1,
    justifyContent: "center",
  },
  composerInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.chipBackground,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    marginHorizontal: spacing.sm,
    lineHeight: COMPOSER_LINE_HEIGHT,
    textAlignVertical: "center",
  },
  userBubble: {
    backgroundColor: colors.userBubble,
    borderBottomRightRadius: radii.sm,
  },
  assistantBubble: {
    backgroundColor: colors.assistantBubble,
    borderBottomLeftRadius: radii.sm,
  },
});
