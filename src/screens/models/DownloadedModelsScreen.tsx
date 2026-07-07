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

import { DownloadedModelsLabels } from "../../constants/downloadedModels";
import { colors, radii, spacing, typography } from "../../constants/theme";
import { getDownloadedModelsList } from "../../db/ModelDB";
import type { HuggingFaceModel } from "../../types/models";
import { formatFileSize } from "../../utils/formatFileSize";
import { getModelFileSizeBytes } from "../../utils/modelFileStorage";
import { parseModelId } from "../../utils/parseModelId";

interface DownloadedModelEntry extends HuggingFaceModel {
  fileSizeBytes: number | null;
}

interface DownloadedModelRowProps {
  item: DownloadedModelEntry;
  onDelete: (item: DownloadedModelEntry) => void;
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

const DownloadedModelRow = memo(function DownloadedModelRow({ item, onDelete }: DownloadedModelRowProps) {
  const { author, name } = parseModelId(item.id);
  const localPath = item.downloadInfo?.localFilePath ?? "";
  const fileSizeLabel =
    item.fileSizeBytes == null ? DownloadedModelsLabels.SIZE_UNKNOWN : formatFileSize(item.fileSizeBytes);

  return (
    <View style={styles.card}>
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
    </View>
  );
});

async function loadDownloadedModelsWithSizes(): Promise<DownloadedModelEntry[]> {
  const models = await getDownloadedModelsList();

  return Promise.all(
    models.map(async (model) => {
      const localFilePath = model.downloadInfo?.localFilePath;
      const fileSizeBytes = localFilePath ? await getModelFileSizeBytes(localFilePath) : null;

      return {
        ...model,
        fileSizeBytes,
      };
    }),
  );
}

export default function DownloadedModelsScreen() {
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const contentMaxWidth = Math.min(width - spacing.lg * 2, 720);

  const [models, setModels] = useState<DownloadedModelEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const modelsWithSizes = await loadDownloadedModelsWithSizes();
      setModels(modelsWithSizes);
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

  const handleDelete = useCallback((item: DownloadedModelEntry) => {
    const { name } = parseModelId(item.id);

    Alert.alert(DownloadedModelsLabels.DELETE_TITLE, DownloadedModelsLabels.DELETE_MESSAGE(name), [
      { text: DownloadedModelsLabels.CANCEL, style: "cancel" },
      {
        text: DownloadedModelsLabels.DELETE,
        style: "destructive",
        onPress: () => {
          const path = item.downloadInfo?.localFilePath;

          if (path) {
            console.log("[SafeMode] Would delete model file:", path);
          }

          // TODO: Enable filesystem + DB deletion once safe-mode testing is complete.
          // await FileSystem.deleteAsync(path, { idempotent: true });
          // await removeDownloadedModel(item.id);

          setModels((currentModels) => currentModels.filter((model) => model.id !== item.id));
        },
      },
    ]);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: DownloadedModelEntry }) => <DownloadedModelRow item={item} onDelete={handleDelete} />,
    [handleDelete],
  );

  const keyExtractor = useCallback((item: DownloadedModelEntry) => item.id, []);

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
