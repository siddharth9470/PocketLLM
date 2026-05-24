import { Ionicons } from "@expo/vector-icons";
import { useLayoutEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";

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

    const messages = conversation?.messages ?? [];

    const [selectedModel, setSelectedModel] = useState<HuggingFaceModel | undefined>();

    const handleSend = () => {
        if (!draft.trim()) {
            return;
        }

        sendMessage(conversationId, draft);
        setDraft("");
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={90}
        >
            <ModelPicker onSelectModel={(model) => setSelectedModel(model)} />

            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <ChatBubble message={item} />}
                contentContainerStyle={styles.messagesContent}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />

            <View style={styles.composer}>
                <TextInput
                    style={styles.input}
                    placeholder="Message"
                    placeholderTextColor={colors.textTertiary}
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                />
                <Pressable
                    style={[styles.sendButton, !draft.trim() && styles.sendButtonDisabled]}
                    onPress={handleSend}
                    disabled={!draft.trim()}
                >
                    <Ionicons name="arrow-up" size={20} color={colors.surface} />
                </Pressable>
            </View>
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
