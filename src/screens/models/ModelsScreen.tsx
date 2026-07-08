import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import ModelCard from "@/components/ModelCard";
import ModelFilterSortSheet from "@/components/ModelFilterSortSheet";
import { ModelsScreenLabels } from "@/constants/models";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { useHuggingFaceModels } from "@/hooks/useHuggingFaceModels";
import { useModelFilterSort } from "@/hooks/useModelFilterSort";
import type { ModelsStackScreenProps } from "@/navigation/types";
import { useModelDownloader } from "@/services/useModelDownloader";
import type { HuggingFaceModel } from "@/types/models";

export default function ModelsScreen(props: ModelsStackScreenProps<"Models">) {
  const isFocused = useIsFocused();
  const { navigation } = props;

  const { data: models = [], isLoading, error, refetch, isRefetching } = useHuggingFaceModels();
  const { downloadedModelIds, syncDownloadedModelIds } = useModelDownloader();

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
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    paddingVertical: spacing.xxl,
  },
});
