import { Ionicons } from "@expo/vector-icons";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import type { Audio } from "expo-av";
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
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
import {
  finalizeVoiceRecording,
  type PersistedAttachmentDraft,
  pickAndPersistAudio,
  pickAndPersistImage,
  startVoiceRecording,
} from "@/services/chatAttachments";
import {
  classifyInferenceError,
  initializeModel,
  releaseModel,
  resolveDownloadedModelPath,
} from "@/services/chatHelper";
import { useChatStore } from "@/stores/chatStore";
import type { HuggingFaceModel } from "@/types/models";
import { generateChatId } from "@/utils/chatIds";
import { isLanguageModelGgufFilename } from "@/utils/ggufFileSelection";
import { CHAT_ASSISTANT, CHAT_USER, type PocketChatMessage, toGiftedChatMessages } from "@/utils/giftedChatAdapter";

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
  const continueAssistantMessage = useChatStore((state) => state.continueAssistantMessage);
  const setConversationModel = useChatStore((state) => state.setConversationModel);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);
  const isSending = useChatStore((state) => state.isSending);

  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(conversation?.modelId);
  const [isInitialLoad, setIsInitialLoad] = useState(() => conversation === undefined);
  const [isChatUiMounted, setIsChatUiMounted] = useState(false);
  const [isModelPickerVisible, setIsModelPickerVisible] = useState(false);
  const [readyModelIds, setReadyModelIds] = useState<Set<string>>(new Set());
  const [pendingAttachments, setPendingAttachments] = useState<PersistedAttachmentDraft[]>([]);
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  const voiceRecordingRef = useRef<Audio.Recording | null>(null);
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
  }, [conversation?.modelId, isChatUiMounted, isInitialLoad, isModelReady, selectedModelId]);

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

      const text = messages[0]?.text.trim() ?? "";
      if (!text && pendingAttachments.length === 0) {
        return;
      }

      Keyboard.dismiss();
      const drafts = [...pendingAttachments];
      setPendingAttachments([]);

      void sendMessage(conversationId, text, {
        modelId: selectedModelId,
        attachmentDrafts: drafts,
        onInferenceError: showInferenceError,
      });
    },
    [conversationId, isModelReady, isSending, pendingAttachments, selectedModelId, sendMessage, showInferenceError],
  );

  const removePendingAttachment = useCallback((storagePath: string) => {
    setPendingAttachments((prev) => prev.filter((attachment) => attachment.storagePath !== storagePath));
  }, []);

  const handlePickImage = useCallback(async () => {
    setAttachmentMenuVisible(false);
    try {
      const draft = await pickAndPersistImage(conversationId);
      if (draft) {
        setPendingAttachments((prev) => [...prev, draft]);
      }
    } catch (error) {
      showInferenceError(error instanceof Error ? error.message : ChatScreenLabels.ATTACHMENT_ERROR_TITLE);
    }
  }, [conversationId, showInferenceError]);

  const handlePickAudio = useCallback(async () => {
    setAttachmentMenuVisible(false);
    try {
      const draft = await pickAndPersistAudio(conversationId);
      if (draft) {
        setPendingAttachments((prev) => [...prev, draft]);
      }
    } catch (error) {
      showInferenceError(error instanceof Error ? error.message : ChatScreenLabels.ATTACHMENT_ERROR_TITLE);
    }
  }, [conversationId, showInferenceError]);

  const handleToggleVoiceRecording = useCallback(async () => {
    if (isRecordingVoice && voiceRecordingRef.current) {
      try {
        const draft = await finalizeVoiceRecording(voiceRecordingRef.current, conversationId);
        voiceRecordingRef.current = null;
        setIsRecordingVoice(false);
        setPendingAttachments((prev) => [...prev, draft]);
      } catch (error) {
        voiceRecordingRef.current = null;
        setIsRecordingVoice(false);
        showInferenceError(error instanceof Error ? error.message : ChatScreenLabels.ATTACHMENT_ERROR_TITLE);
      }
      return;
    }

    try {
      const recording = await startVoiceRecording();
      voiceRecordingRef.current = recording;
      setIsRecordingVoice(true);
    } catch (error) {
      showInferenceError(error instanceof Error ? error.message : ChatScreenLabels.ATTACHMENT_ERROR_TITLE);
    }
  }, [conversationId, isRecordingVoice, showInferenceError]);

  const renderInputToolbar = useCallback(
    (props: ComponentProps<typeof InputToolbar>) => (
      <View style={styles.inputToolbarContainer}>
        {pendingAttachments.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pendingAttachmentScroll}>
            {pendingAttachments.map((attachment) => (
              <View key={attachment.storagePath} style={styles.pendingAttachmentChip}>
                <Ionicons
                  name={attachment.kind === "image" ? "image-outline" : "musical-notes-outline"}
                  size={14}
                  color={colors.primary}
                />
                <Text style={styles.pendingAttachmentText} numberOfLines={1}>
                  {attachment.kind === "image" ? "Image" : "Audio"}
                </Text>
                <Pressable
                  onPress={() => removePendingAttachment(attachment.storagePath)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={ChatScreenLabels.ATTACHMENT_REMOVE}
                >
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <InputToolbar
          {...props}
          containerStyle={styles.inputToolbarInner}
          primaryStyle={styles.inputToolbarPrimary}
          renderActions={() => (
            <View style={styles.accessoryActions}>
              <Pressable
                style={styles.accessoryButton}
                onPress={() => setAttachmentMenuVisible(true)}
                disabled={!isModelReady || isSending}
                accessibilityRole="button"
                accessibilityLabel={ChatScreenLabels.ATTACHMENT_ADD}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={26}
                  color={isModelReady ? colors.primary : colors.textSecondary}
                />
              </Pressable>

              <Pressable
                style={[styles.accessoryButton, isRecordingVoice && styles.accessoryButtonRecording]}
                onPress={() => void handleToggleVoiceRecording()}
                disabled={!isModelReady || isSending}
                accessibilityRole="button"
                accessibilityLabel={
                  isRecordingVoice ? ChatScreenLabels.ATTACHMENT_RECORDING : ChatScreenLabels.ATTACHMENT_RECORD
                }
              >
                <Ionicons
                  name={isRecordingVoice ? "stop-circle" : "mic-outline"}
                  size={24}
                  color={isRecordingVoice ? colors.danger : isModelReady ? colors.primary : colors.textSecondary}
                />
              </Pressable>
            </View>
          )}
        />
      </View>
    ),
    [
      handleToggleVoiceRecording,
      isModelReady,
      isRecordingVoice,
      isSending,
      pendingAttachments,
      removePendingAttachment,
    ],
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
          showInferenceError(ChatScreenLabels.MODEL_UNAVAILABLE);
          return;
        }

        await initializeModel(modelPath);
        setReadyModelIds((prev) => new Set(prev).add(model.id));
        void setConversationModel(conversationId, model.id);
      } catch (error) {
        setSelectedModelId(undefined);
        showInferenceError(classifyInferenceError(error).userMessage);
      } finally {
        setIsLoadingModel(false);
      }
    },
    [conversationId, setConversationModel, showInferenceError],
  );

  const renderSend = useCallback(
    (props: ComponentProps<typeof Send>) => {
      if (!isModelReady) {
        return null;
      }

      const hasText = (props.text?.trim().length ?? 0) > 0;
      const hasAttachments = pendingAttachments.length > 0;

      if (!hasText && !hasAttachments) {
        return null;
      }

      return <Send {...props} isTextOptional={hasAttachments} />;
    },
    [isModelReady, pendingAttachments.length],
  );

  const handleContinueResponse = useCallback(
    (messageId: string) => {
      if (isSending || !isModelReady || !selectedModelId) {
        return;
      }

      void continueAssistantMessage(conversationId, messageId, {
        modelId: selectedModelId,
        onInferenceError: showInferenceError,
      });
    },
    [continueAssistantMessage, conversationId, isModelReady, isSending, selectedModelId, showInferenceError],
  );

  const renderMessageText = useCallback((props: MessageTextProps<PocketChatMessage>) => {
    const text = props.currentMessage?.text;
    if (!text) {
      return null;
    }

    return <ChatMessageMarkdown text={text} position={props.position ?? "left"} />;
  }, []);

  const renderBubble = useCallback(
    (props: ComponentProps<typeof Bubble>) => {
      const currentMessage = props.currentMessage as PocketChatMessage | undefined;
      const showContinue =
        currentMessage?.truncated === true && currentMessage.user._id === CHAT_ASSISTANT._id && !isSending;

      return (
        <View style={styles.bubbleContainer}>
          <Bubble
            {...props}
            wrapperStyle={{
              left: styles.assistantBubble,
              right: styles.userBubble,
            }}
          />
          {showContinue ? (
            <Pressable
              style={styles.continueButton}
              onPress={() => handleContinueResponse(String(currentMessage._id))}
              accessibilityRole="button"
              accessibilityLabel={ChatScreenLabels.CONTINUE_RESPONSE_ACCESSIBILITY}
            >
              <Text style={styles.continueButtonText}>{ChatScreenLabels.CONTINUE_RESPONSE}</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
    [handleContinueResponse, isSending],
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
            isTyping={isSending && !hasStreamingContent}
            messagesContainerStyle={styles.messagesContainer}
            textInputProps={composerTextInputProps}
            keyboardAvoidingViewProps={{
              keyboardVerticalOffset: headerHeight,
            }}
          />
        ) : null}
      </View>

      <Modal
        visible={attachmentMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachmentMenuVisible(false)}
      >
        <Pressable style={styles.attachmentBackdrop} onPress={() => setAttachmentMenuVisible(false)}>
          <View style={styles.attachmentSheet}>
            <Text style={styles.attachmentSheetTitle}>{ChatScreenLabels.ATTACHMENT_ADD}</Text>
            <Pressable style={styles.attachmentOption} onPress={() => void handlePickImage()}>
              <Ionicons name="image-outline" size={20} color={colors.primary} />
              <Text style={styles.attachmentOptionText}>{ChatScreenLabels.ATTACHMENT_IMAGE}</Text>
            </Pressable>
            <Pressable style={styles.attachmentOption} onPress={() => void handlePickAudio()}>
              <Ionicons name="musical-notes-outline" size={20} color={colors.primary} />
              <Text style={styles.attachmentOptionText}>{ChatScreenLabels.ATTACHMENT_AUDIO}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
  inputToolbarInner: {
    backgroundColor: colors.background,
    borderTopWidth: 0,
  },
  accessoryActions: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  accessoryButton: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  accessoryButtonRecording: {
    backgroundColor: colors.chipBackground,
    borderRadius: radii.pill,
  },
  pendingAttachmentScroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    maxHeight: 44,
  },
  pendingAttachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginRight: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.chipBackground,
  },
  pendingAttachmentText: {
    ...typography.caption,
    color: colors.text,
    maxWidth: 72,
  },
  attachmentBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  attachmentSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  attachmentSheetTitle: {
    ...typography.headline,
    color: colors.text,
  },
  attachmentOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 44,
  },
  attachmentOptionText: {
    ...typography.body,
    color: colors.text,
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
  bubbleContainer: {
    maxWidth: "100%",
  },
  continueButton: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.chipBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    minHeight: 44,
    justifyContent: "center",
  },
  continueButtonText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
  },
});
