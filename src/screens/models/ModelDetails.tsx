import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import TagChip from "@/components/TagChip";
import { ModelDetailsLabels } from "@/constants/models";
import { colors, radii, spacing, typography } from "@/constants/theme";
import type { ModelsStackScreenProps } from "@/navigation/types";
import { HuggingFaceService } from "@/services/HuggingFaceService";
import { useModelDownloader } from "@/services/useModelDownloader";
import type { GgufVariant } from "@/types/models";
import { listLanguageModelGgufVariants } from "@/utils/ggufFileSelection";
import { formatCount, formatFileSize, formatParameterBillions, parseModelId } from "@/utils/parseModelId";

export default function ModelDetails({ route }: ModelsStackScreenProps<"ModelDetails">) {
  const { model: listModel } = route.params;
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const contentMaxWidth = Math.min(width - spacing.lg * 2, 720);

  const {
    startDownload,
    cancelDownload,
    downloadProgress,
    activeDownloads,
    downloadedModelIds,
    syncDownloadedModelIds,
  } = useModelDownloader();

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["modelDetails", listModel.id],
    queryFn: () => HuggingFaceService.fetchModelDetails(listModel.id),
    placeholderData: listModel,
    staleTime: 60_000,
  });

  const model = data ?? listModel;

  useEffect(() => {
    if (isFocused) {
      void syncDownloadedModelIds();
    }
  }, [isFocused, syncDownloadedModelIds]);

  const variants = listLanguageModelGgufVariants(model.siblings);
  const { author, name: repoName } = parseModelId(model.id);
  const displayName = model.name && model.name !== model.id ? model.name : repoName;
  const isRepoDownloaded = downloadedModelIds[model.id] ?? false;
  const isDownloading = activeDownloads[model.id] ?? false;
  const progress = downloadProgress[model.id] ?? 0;

  const handleDownload = useCallback(
    (variant: GgufVariant) => {
      void startDownload(model, variant.filename, variant.sizeBytes);
    },
    [model, startDownload],
  );

  const renderVariant = useCallback(
    ({ item }: { item: GgufVariant }) => {
      const sizeLabel =
        item.sizeBytes != null && item.sizeBytes > 0 ? formatFileSize(item.sizeBytes) : "Size unknown";

      return (
        <View style={styles.variantRow}>
          <View style={styles.variantInfo}>
            <Text style={styles.variantName} numberOfLines={2}>
              {item.filename}
            </Text>
            <Text style={styles.variantSize}>{sizeLabel}</Text>
          </View>
          <Pressable
            style={[styles.variantButton, isDownloading && styles.variantButtonDisabled]}
            onPress={() => handleDownload(item)}
            disabled={isDownloading}
            accessibilityRole="button"
            accessibilityLabel={`${ModelDetailsLabels.DOWNLOAD} ${item.filename}`}
          >
            <Text style={styles.variantButtonText}>
              {isRepoDownloaded ? ModelDetailsLabels.DOWNLOADED : ModelDetailsLabels.DOWNLOAD}
            </Text>
          </Pressable>
        </View>
      );
    },
    [handleDownload, isDownloading, isRepoDownloaded],
  );

  if (isLoading && isFetching && variants.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{ModelDetailsLabels.LOADING}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth, alignSelf: "center", width: "100%" }]}
      showsVerticalScrollIndicator={false}
    >
      {error ? <Text style={styles.errorText}>{ModelDetailsLabels.FETCH_ERROR}</Text> : null}

      <Text style={styles.author}>{author || model.author}</Text>
      <Text style={styles.title}>{displayName}</Text>
      <Text style={styles.repoId}>{model.id}</Text>

      <View style={styles.metricsRow}>
        {model.parameterBillions != null ? (
          <View style={styles.metric}>
            <Ionicons name="hardware-chip-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.metricText}>{formatParameterBillions(model.parameterBillions)} params</Text>
          </View>
        ) : null}
        <View style={styles.metric}>
          <Ionicons name="download-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.metricText}>{formatCount(model.downloads)}</Text>
        </View>
        <View style={styles.metric}>
          <Ionicons name="heart-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.metricText}>{formatCount(model.likes)}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tagsScroll}
        contentContainerStyle={styles.tagsContent}
      >
        {model.tags.map((tag) => (
          <TagChip key={`${model.id}-${tag}`} label={tag} />
        ))}
      </ScrollView>

      {isDownloading ? (
        <View style={styles.progressBlock}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, progress))}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {ModelDetailsLabels.DOWNLOADING} {Math.round(progress)}%
          </Text>
          <TouchableOpacity style={styles.stopButton} onPress={() => cancelDownload(model.id)}>
            <Text style={styles.stopButtonText}>{ModelDetailsLabels.STOP}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>{ModelDetailsLabels.VARIANTS}</Text>

      {variants.length === 0 ? (
        <Text style={styles.emptyText}>{ModelDetailsLabels.NO_VARIANTS}</Text>
      ) : (
        <FlatList
          data={variants}
          keyExtractor={(item) => item.filename}
          renderItem={renderVariant}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  author: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.headline,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  repoId: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.lg,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metric: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  metricText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  tagsScroll: {
    marginBottom: spacing.lg,
  },
  tagsContent: {
    paddingRight: spacing.lg,
  },
  progressBlock: {
    marginBottom: spacing.lg,
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.progressTrack,
    borderRadius: radii.pill,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  progressText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  stopButton: {
    minHeight: 44,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  stopButtonText: {
    ...typography.headline,
    fontSize: 15,
    color: colors.danger,
  },
  sectionTitle: {
    ...typography.headline,
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  variantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  variantInfo: {
    flex: 1,
    flexShrink: 1,
  },
  variantName: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  variantSize: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
  },
  variantButton: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  variantButtonDisabled: {
    opacity: 0.6,
  },
  variantButtonText: {
    ...typography.caption,
    color: colors.surface,
    fontWeight: "600",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
