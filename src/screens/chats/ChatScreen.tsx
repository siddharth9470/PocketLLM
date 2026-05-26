import { Ionicons } from "@expo/vector-icons";
import { useHeaderHeight } from "@react-navigation/elements";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { GiftedChat } from "react-native-gifted-chat";
import ChatBubble from "../../components/ChatBubble";
import ModelPicker from "../../components/ModelPicker";
import { colors, radii, spacing } from "../../constants/theme";
import type { ChatsStackScreenProps } from "../../navigation/types";
import { useChatStore } from "../../stores/chatStore";
import { HuggingFaceModel } from "../../types/models";

export default function ChatScreen({ navigation, route }: ChatsStackScreenProps<"Chat">) {
    const { conversationId } = route.params;
    const conversation = useChatStore((state) => state.getConversation(conversationId));
    const sendMessage = useChatStore((state) => state.sendMessage);
    const setConversationModel = useChatStore((state) => state.setConversationModel);

    const [draft, setDraft] = useState("");
    const listRef = useRef<FlatList>(null);

    //const messages = conversation?.messages ?? [];

    const [selectedModel, setSelectedModel] = useState<HuggingFaceModel | undefined>();

    const [messages, setMessages] = useState<any>([]);

    const handleSend = () => {
        if (!draft.trim()) {
            return;
        }

        sendMessage(conversationId, draft);
        setDraft("");
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    };

    useEffect(() => {
        setMessages([
            {
                _id: 1,
                text: "Hello developer",
                createdAt: new Date(),
                user: {
                    _id: 2,
                    name: "John Doe",
                    avatar: "https://placeimg.com/140/140/any",
                },
            },
        ]);
    }, []);

    const onSend = useCallback((messages = []) => {
        setMessages((previousMessages: any) => GiftedChat.append(previousMessages, messages));
    }, []);

    const headerHeight = useHeaderHeight();

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={150}
        >
            <ModelPicker onSelectModel={(model) => setSelectedModel(model)} />

            <GiftedChat
                messages={messages}
                onSend={(messages: any) => onSend(messages)}
                user={{
                    _id: 1,
                }}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    messagesContent: {
        paddingVertical: spacing.lg,
        flexGrow: 1,
    },
    composer: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
    },
    input: {
        flex: 1,
        minHeight: 40,
        maxHeight: 120,
        backgroundColor: colors.chipBackground,
        borderRadius: radii.lg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        fontSize: 16,
        color: colors.text,
    },
    sendButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    sendButtonDisabled: {
        opacity: 0.4,
    },
});
