import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { memo, useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../constants/theme";
import { getDownloadedModels, getDownloadedModelsList, LocalHuggingFaceModel } from "../storage/modelStorage";
import { HuggingFaceModel } from "../types/models";
import { parseModelId } from "../utils/parseModelId";

interface ModelPickerProps {
    onSelectModel: (model: LocalHuggingFaceModel) => void;
}

export default function ModelPicker({ onSelectModel }: ModelPickerProps) {
    const isFocused = useIsFocused();

    const [visible, setVisible] = useState(false);

    const [availableModel, setAvailableModel] = useState<LocalHuggingFaceModel[]>([]);
    const [selectedModel, setSelectedModel] = useState<LocalHuggingFaceModel | undefined>();

    const load = useCallback(async () => {
        try {
            const modelsFromLocalStorage = await getDownloadedModelsList();

            setAvailableModel(modelsFromLocalStorage);
        } catch (err) {
            console.error("Failed to load downloaded models", err);
        }
    }, []);

    useEffect(() => {
        if (isFocused) load();
    }, [isFocused, load]);

    const handleSelect = useCallback(
        (item: LocalHuggingFaceModel) => {
            setSelectedModel(item);
            onSelectModel(item);
            setVisible(false);
        },
        [onSelectModel]
    );

    const renderModels = useCallback(
        ({ item }: { item: LocalHuggingFaceModel }) => {
            const isSelected = item.id === selectedModel?.id;
            return <ModelListItem item={item} isSelected={isSelected} onSelect={handleSelect} />;
        },
        [selectedModel, handleSelect]
    );

    return (
        <>
            <Pressable style={styles.trigger} onPress={() => setVisible(true)}>
                <Ionicons name="hardware-chip-outline" size={16} color={colors.primary} />
                <Text style={styles.triggerText} numberOfLines={1}>
                    {selectedModel ? parseModelId(selectedModel.id).name : "Select a Modal"}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
            </Pressable>

            <Modal visible={visible} transparent animationType="fade">
                <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
                    <View style={styles.sheet}>
                        <Text style={styles.sheetTitle}>Active Model</Text>
                        {availableModel.length === 0 ? (
                            <Text style={styles.emptyText}>
                                Download a model from the Models tab to use it in chat.
                            </Text>
                        ) : (
                            <FlatList
                                data={availableModel}
                                renderItem={renderModels}
                                keyExtractor={(item) => item.id}
                            />
                        )}
                    </View>
                </Pressable>
            </Modal>
        </>
    );
}

const ModelListItem = memo(
    ({
        item,
        isSelected,
        onSelect,
    }: {
        item: LocalHuggingFaceModel;
        isSelected: boolean;
        onSelect: (item: LocalHuggingFaceModel) => void;
    }) => {
        const { author, name } = parseModelId(item.id);

        return (
            <Pressable style={[styles.option, isSelected && styles.optionSelected]} onPress={() => onSelect(item)}>
                <View style={styles.optionTextWrap}>
                    <Text style={styles.optionName}>{name}</Text>
                    <Text style={styles.optionAuthor}>{author}</Text>
                </View>
                {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </Pressable>
        );
    }
);

const styles = StyleSheet.create({
    trigger: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        maxWidth: "100%",
        alignSelf: "flex-end",
        backgroundColor: colors.chipBackground,
        borderRadius: radii.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
    },
    triggerText: {
        ...typography.caption,
        color: colors.primary,
        fontWeight: "600",
        flexShrink: 1,
    },
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.35)",
        justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radii.lg,
        borderTopRightRadius: radii.lg,
        padding: spacing.lg,
        maxHeight: "55%",
    },
    sheetTitle: {
        ...typography.headline,
        color: colors.text,
        marginBottom: spacing.md,
    },
    emptyText: {
        ...typography.caption,
        color: colors.textSecondary,
        paddingVertical: spacing.lg,
    },
    option: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    optionSelected: {
        backgroundColor: colors.chipBackground,
        borderRadius: radii.sm,
        paddingHorizontal: spacing.sm,
    },
    optionTextWrap: {
        flex: 1,
    },
    optionName: {
        ...typography.headline,
        fontSize: 15,
        color: colors.text,
    },
    optionAuthor: {
        ...typography.caption,
        color: colors.textSecondary,
    },
});
