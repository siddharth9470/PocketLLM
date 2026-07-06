import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { ChatScreenLabels } from "../constants/chat";
import { colors, radii, spacing, typography } from "../constants/theme";
import { getDownloadedModelsList } from "../db/ModelDB";
import type { HuggingFaceModel } from "../types/models";
import { isLanguageModelGgufFilename } from "../utils/ggufFileSelection";
import { parseModelId } from "../utils/parseModelId";

interface ModelPickerProps {
  selectedModelId?: string;
  visible?: boolean;
  onOpenRequest?: () => void;
  onClose?: () => void;
  onSelectModel: (model: HuggingFaceModel) => void;
}

function isModelReady(model: HuggingFaceModel): boolean {
  const localFilePath = model.downloadInfo?.localFilePath;
  return (
    model.downloadInfo?.status === "completed" &&
    Boolean(localFilePath) &&
    isLanguageModelGgufFilename(localFilePath ?? "")
  );
}

export default function ModelPicker({
  selectedModelId,
  visible,
  onOpenRequest,
  onClose,
  onSelectModel,
}: ModelPickerProps) {
  const isControlled = visible !== undefined;
  const [internalVisible, setInternalVisible] = useState(false);
  const [availableModels, setAvailableModels] = useState<HuggingFaceModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<HuggingFaceModel | undefined>();

  const modalVisible = isControlled ? visible : internalVisible;

  const load = useCallback(async () => {
    try {
      const modelsFromLocalStorage = await getDownloadedModelsList();
      setAvailableModels(modelsFromLocalStorage.filter(isModelReady));
    } catch (err) {
      console.error("Failed to load downloaded models", err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedModelId) {
      setSelectedModel(undefined);
      return;
    }

    const matched = availableModels.find((model) => model.id === selectedModelId);
    if (matched) {
      setSelectedModel(matched);
    }
  }, [availableModels, selectedModelId]);

  const closeModal = useCallback(() => {
    if (isControlled) {
      onClose?.();
      return;
    }

    setInternalVisible(false);
  }, [isControlled, onClose]);

  const openModal = useCallback(() => {
    if (isControlled) {
      onOpenRequest?.();
      return;
    }

    setInternalVisible(true);
  }, [isControlled, onOpenRequest]);

  const handleSelect = useCallback(
    (item: HuggingFaceModel) => {
      setSelectedModel(item);
      onSelectModel(item);
      closeModal();
    },
    [closeModal, onSelectModel],
  );

  const renderModels = useCallback(
    ({ item }: { item: HuggingFaceModel }) => {
      const isSelected = item.id === selectedModel?.id;
      return <ModelListItem item={item} isSelected={isSelected} onSelect={handleSelect} />;
    },
    [selectedModel, handleSelect],
  );

  return (
    <>
      <Pressable style={styles.trigger} onPress={openModal}>
        <Ionicons name="hardware-chip-outline" size={16} color={colors.primary} />
        <Text style={styles.triggerText} numberOfLines={1}>
          {selectedModel ? parseModelId(selectedModel.id).name : ChatScreenLabels.MODEL_SELECT_TITLE}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <Pressable style={styles.backdrop} onPress={closeModal}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sheetTitle}>{ChatScreenLabels.MODEL_SELECT_TITLE}</Text>
            <Text style={styles.sheetPrompt}>{ChatScreenLabels.MODEL_SELECT_PROMPT}</Text>
            {availableModels.length === 0 ? (
              <Text style={styles.emptyText}>
                Download a text-generation GGUF from the Models tab. Vision projector files (mmproj) cannot
                be used for chat.
              </Text>
            ) : (
              <FlatList
                data={availableModels}
                renderItem={renderModels}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
              />
            )}
          </Pressable>
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
    item: HuggingFaceModel;
    isSelected: boolean;
    onSelect: (item: HuggingFaceModel) => void;
  }) => {
    const { author, name } = parseModelId(item.id);

    return (
      <Pressable style={[styles.option, isSelected && styles.optionSelected]} onPress={() => onSelect(item)}>
        <View style={styles.optionTextWrap}>
          <Text style={styles.optionName}>{name}</Text>
          <Text style={styles.optionAuthor}>{author}</Text>
        </View>
        {isSelected ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
      </Pressable>
    );
  },
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
    marginBottom: spacing.xs,
  },
  sheetPrompt: {
    ...typography.body,
    color: colors.textSecondary,
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
