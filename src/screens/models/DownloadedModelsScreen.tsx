import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { memo, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { DownloadedModelsLabels } from "@/constants/downloadedModels";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { getDownloadedModelsList } from "@/db/ModelDB";
import type { ModelsStackScreenProps } from "@/navigation/types";
import { useModelDownloader } from "@/services/useModelDownloader";
import type { HuggingFaceModel } from "@/types/models";
import { formatFileSize } from "@/utils/formatFileSize";
import { parseModelId } from "@/utils/parseModelId";

interface DownloadedModelRowProps {
  item: HuggingFaceModel;
  onOpen: (item: HuggingFaceModel) => void;
  onDelete: (item: HuggingFaceModel) => void;
}

function shortenPath(path: string, maxLength = 48): string {
  if (path.length <= maxLength) {
    return path;
  }

  return `…${path.slice(-(maxLength - 1))}`;
}

function formatDownloadedAt(timestamp: number | undefined): string {
  if (!timestamp) {
    return "—";
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const DownloadedModelRow = memo(function DownloadedModelRow({ item, onOpen, onDelete }: DownloadedModelRowProps) {
  const { author, name } = parseModelId(item.id);
  const localPath = item.downloadInfo?.localFilePath ?? "";
  const storedSizeBytes = item.downloadInfo?.fileSizeBytes;
  const fileSizeLabel =
    storedSizeBytes == null || storedSizeBytes <= 0
      ? DownloadedModelsLabels.SIZE_UNKNOWN
      : formatFileSize(storedSizeBytes);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onOpen(item)}
      accessibilityRole="button"
    >
      <View style={styles.cardHeader}>
        <View style={styles.titleBlock}>
          <Text style={styles.author} numberOfLines={1}>
            {author}
          </Text>
          <Text style={styles.modelName} numberOfLines={2}>
            {name}
          </Text>
        </View>

        <Pressable
          style={styles.deleteButton}
          onPress={() => onDelete(item)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={DownloadedModelsLabels.DELETE_ACCESSIBILITY}
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </View>

      <View style={styles.metadataRow}>
        <View style={styles.metadataChip}>
          <Ionicons name="document-outline" size={14} color={colors.primary} />
          <Text style={styles.metadataChipText}>{fileSizeLabel}</Text>
        </View>
        <View style={styles.metadataDivider} />
        <View style={styles.metadataChip}>
          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.metadataSecondaryText}>
            {DownloadedModelsLabels.DOWNLOADED} {formatDownloadedAt(item.downloadInfo?.downloadedAt)}
          </Text>
        </View>
      </View>

      {localPath ? (
        <Text style={styles.path} numberOfLines={1} ellipsizeMode="middle">
          {shortenPath(localPath.replace(/^file:\/\//, ""))}
        </Text>
      ) : null}
    </Pressable>
  );
});

export default function DownloadedModelsScreen({ navigation }: ModelsStackScreenProps<"DownloadedModels">) {
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const contentMaxWidth = Math.min(width - spacing.lg * 2, 720);
  const { deleteDownloadedModel } = useModelDownloader();

  const [models, setModels] = useState<HuggingFaceModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const modelsFromDb = await getDownloadedModelsList();
      setModels(modelsFromDb);
    } catch (error) {
      console.error("Failed to load downloaded models", error);
      setLoadError(DownloadedModelsLabels.LOAD_FAILED);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      void loadModels();
    }
  }, [isFocused, loadModels]);

  const handleOpen = useCallback(
    (item: HuggingFaceModel) => {
      navigation.navigate("ModelDetails", { model: item });
    },
    [navigation],
  );

  const handleDelete = useCallback(
    (item: HuggingFaceModel) => {
      const { name } = parseModelId(item.id);

      Alert.alert(DownloadedModelsLabels.DELETE_TITLE, DownloadedModelsLabels.DELETE_MESSAGE(name), [
        { text: DownloadedModelsLabels.CANCEL, style: "cancel" },
        {
          text: DownloadedModelsLabels.DELETE,
          style: "destructive",
          onPress: () => {
            void deleteDownloadedModel(item.id)
              .then(() => {
                setModels((currentModels) => currentModels.filter((model) => model.id !== item.id));
              })
              .catch((error: unknown) => {
                console.error(`Failed to delete downloaded model ${item.id}:`, error);
              });
          },
        },
      ]);
    },
    [deleteDownloadedModel],
  );

  const renderItem = useCallback(
    ({ item }: { item: HuggingFaceModel }) => (
      <DownloadedModelRow item={item} onOpen={handleOpen} onDelete={handleDelete} />
    ),
    [handleDelete, handleOpen],
  );

  const keyExtractor = useCallback((item: HuggingFaceModel) => item.id, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={models}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { maxWidth: contentMaxWidth, alignSelf: "center", width: "100%" },
          models.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loadError ? <Text style={styles.emptyTitle}>{loadError}</Text> : null}
            <Text style={styles.emptyTitle}>{DownloadedModelsLabels.EMPTY}</Text>
            <Text style={styles.emptyHint}>{DownloadedModelsLabels.EMPTY_HINT}</Text>
          </View>
        }
      />
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
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  titleBlock: {
    flex: 1,
    flexShrink: 1,
  },
  author: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  modelName: {
    ...typography.headline,
    color: colors.text,
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.chipBackground,
  },
  metadataRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metadataChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  metadataChipText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
  },
  metadataSecondaryText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  metadataDivider: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    backgroundColor: colors.border,
  },
  path: {
    ...typography.caption,
    color: colors.textTertiary,
    fontFamily: "monospace",
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    ...typography.headline,
    color: colors.text,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  emptyHint: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
