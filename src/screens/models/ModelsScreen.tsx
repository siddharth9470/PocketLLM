import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import ModelCard from "@/components/ModelCard";
import ModelFilterSortSheet from "@/components/ModelFilterSortSheet";
import { ModelsScreenLabels } from "@/constants/models";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { useHuggingFaceModels } from "@/hooks/useHuggingFaceModels";
import { useModelFilterSort } from "@/hooks/useModelFilterSort";
import type { ModelsStackScreenProps } from "@/navigation/types";
import { useModelDownloader } from "@/services/useModelDownloader";
import type { HuggingFaceModel } from "@/types/models";
import { parseModelId } from "@/utils/parseModelId";

interface ActiveDownloadItem {
  modelId: string;
  model: HuggingFaceModel;
  filename: string;
  progress: number;
}

export default function ModelsScreen(props: ModelsStackScreenProps<"Models">) {
  const isFocused = useIsFocused();
  const { navigation } = props;
  const { width: windowWidth } = useWindowDimensions();

  const { data: models = [], isLoading, error, refetch, isRefetching } = useHuggingFaceModels();
  const {
    downloadedModelIds,
    syncDownloadedModelIds,
    activeDownloads,
    activeDownloadFilenames,
    activeDownloadModels,
    downloadProgress,
  } = useModelDownloader();

  const {
    displayedModels,
    sortBy,
    selectedAuthor,
    selectedPipelineTag,
    showDownloadedOnly,
    uniqueAuthors,
    uniquePipelineTags,
    toggleSort,
    toggleAuthor,
    togglePipelineTag,
    toggleDownloadedOnly,
    hasActiveFilters,
  } = useModelFilterSort(models, downloadedModelIds);

  const activeDownloadsList = useMemo((): ActiveDownloadItem[] => {
    return Object.entries(activeDownloads)
      .filter(([, isActive]) => isActive)
      .flatMap(([modelId]) => {
        const model = activeDownloadModels[modelId] ?? models.find((entry) => entry.id === modelId);
        if (!model) {
          return [];
        }

        return [
          {
            modelId,
            model,
            filename: activeDownloadFilenames[modelId] ?? "",
            progress: downloadProgress[modelId] ?? 0,
          },
        ];
      });
  }, [activeDownloadFilenames, activeDownloadModels, activeDownloads, downloadProgress, models]);

  const activeDownloadCardWidth =
    activeDownloadsList.length > 1 ? Math.min(windowWidth * 0.88, 360) : windowWidth - spacing.lg * 2;

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate("DownloadedModels")} style={{ marginRight: 12 }}>
          <Ionicons name="download-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    if (isFocused) {
      syncDownloadedModelIds();
    }
  }, [isFocused, syncDownloadedModelIds]);

  const handleOpenModel = useCallback(
    (model: HuggingFaceModel) => {
      navigation.navigate("ModelDetails", { model });
    },
    [navigation],
  );

  const renderModelCard = useCallback(
    ({ item }: { item: HuggingFaceModel }) => <ModelCard model={item} onPress={handleOpenModel} />,
    [handleOpenModel],
  );

  const renderActiveDownloadItem = useCallback(
    ({ item }: { item: ActiveDownloadItem }) => {
      const { author, name } = parseModelId(item.model.id);
      const repoTitle = `${author}/${name}`;

      return (
        <Pressable
          style={({ pressed }) => [
            styles.activeDownloadBanner,
            { width: activeDownloadCardWidth },
            pressed && styles.activeDownloadBannerPressed,
          ]}
          onPress={() => handleOpenModel(item.model)}
          accessibilityRole="button"
          accessibilityLabel={`${ModelsScreenLabels.ACTIVE_DOWNLOAD_TITLE}: ${repoTitle}`}
        >
          <View style={styles.activeDownloadContent}>
            <View style={styles.activeDownloadHeader}>
              <Ionicons name="download-outline" size={18} color={colors.primary} />
              <Text style={styles.activeDownloadTitle}>{ModelsScreenLabels.ACTIVE_DOWNLOAD_TITLE}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.activeDownloadRepo} numberOfLines={1}>
              {repoTitle}
            </Text>
            {item.filename ? (
              <Text style={styles.activeDownloadVariant} numberOfLines={1}>
                {ModelsScreenLabels.ACTIVE_DOWNLOAD_PROGRESS(item.filename, item.progress)}
              </Text>
            ) : null}
            <View style={styles.activeDownloadTrack}>
              <View
                style={[styles.activeDownloadFill, { width: `${Math.min(100, Math.max(0, item.progress))}%` }]}
              />
            </View>
          </View>
        </Pressable>
      );
    },
    [activeDownloadCardWidth, handleOpenModel],
  );

  const activeDownloadKeyExtractor = useCallback((item: ActiveDownloadItem) => item.modelId, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{ModelsScreenLabels.LOADING}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{ModelsScreenLabels.FETCH_ERROR}</Text>
        </View>
      ) : null}

      <ModelFilterSortSheet
        sortBy={sortBy}
        selectedAuthor={selectedAuthor}
        selectedPipelineTag={selectedPipelineTag}
        showDownloadedOnly={showDownloadedOnly}
        uniqueAuthors={uniqueAuthors}
        uniquePipelineTags={uniquePipelineTags}
        hasActiveFilters={hasActiveFilters}
        onToggleSort={toggleSort}
        onToggleAuthor={toggleAuthor}
        onTogglePipelineTag={togglePipelineTag}
        onToggleDownloadedOnly={toggleDownloadedOnly}
      />

      {activeDownloadsList.length > 0 ? (
        <View style={styles.activeDownloadsSection}>
          {activeDownloadsList.length > 1 ? (
            <Text style={styles.activeDownloadsSectionTitle}>{ModelsScreenLabels.ACTIVE_DOWNLOADS_TITLE}</Text>
          ) : null}
          <FlatList
            data={activeDownloadsList}
            keyExtractor={activeDownloadKeyExtractor}
            renderItem={renderActiveDownloadItem}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled={activeDownloadsList.length > 1}
            style={styles.activeDownloadsList}
            contentContainerStyle={styles.activeDownloadsListContent}
            ItemSeparatorComponent={() => <View style={styles.activeDownloadSeparator} />}
          />
        </View>
      ) : null}

      <FlatList
        data={displayedModels}
        keyExtractor={(item) => item._id}
        renderItem={renderModelCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={isRefetching}
        onRefresh={() => {
          void refetch();
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {models.length === 0 ? ModelsScreenLabels.LOADING : ModelsScreenLabels.NO_MATCHES}
          </Text>
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
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.chipBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
  },
  activeDownloadBanner: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  activeDownloadsSection: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    flexGrow: 0,
  },
  activeDownloadsList: {
    flexGrow: 0,
  },
  activeDownloadsListContent: {
    flexGrow: 0,
    paddingHorizontal: spacing.lg,
  },
  activeDownloadSeparator: {
    width: spacing.sm,
  },
  activeDownloadsSectionTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  activeDownloadBannerPressed: {
    opacity: 0.92,
  },
  activeDownloadContent: {
    gap: spacing.xs,
  },
  activeDownloadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  activeDownloadTitle: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
    flex: 1,
  },
  activeDownloadRepo: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
  },
  activeDownloadVariant: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  activeDownloadTrack: {
    height: 4,
    backgroundColor: colors.progressTrack,
    borderRadius: radii.pill,
    overflow: "hidden",
    marginTop: spacing.xs,
  },
  activeDownloadFill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    paddingVertical: spacing.xxl,
  },
});
