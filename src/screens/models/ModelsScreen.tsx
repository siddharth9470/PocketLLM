import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ModelCard from "../../components/ModelCard";
import ModelFilterSortSheet from "../../components/ModelFilterSortSheet";
import { colors, spacing, typography } from "../../constants/theme";
import { useModelFilterSort } from "../../hooks/useModelFilterSort";
import type { ModelsStackScreenProps } from "../../navigation/types";
import { useModelDownloader } from "../../services/useModelDownloader";
import type { HuggingFaceModel } from "../../types/models";

const ModelsScreenLabels = {
  LOADING: "Loading models...",
  NO_MATCHES: "No models match the current filters.",
} as const;

export default function ModelsScreen(props: ModelsStackScreenProps<"Models">) {
  const [huggingFaceModels, setHFModels] = useState<HuggingFaceModel[]>([]);

  const { startDownload, downloadProgress, activeDownloads } = useModelDownloader();
  const { navigation } = props;

  const {
    displayedModels,
    sortBy,
    selectedAuthor,
    selectedPipelineTag,
    uniqueAuthors,
    uniquePipelineTags,
    toggleSort,
    toggleAuthor,
    togglePipelineTag,
    hasActiveFilters,
  } = useModelFilterSort(huggingFaceModels);

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
    const modelApi =
      "https://huggingface.co/api/models?search=gguf+q4&limit=200&sort=downloads&direction=-1&expand=pipeline_tag&expand=siblings&expand=tags&expand=likes&expand=private&expand=downloads&expand=createdAt&expand=lastModified&expand=author";

    fetch(modelApi).then((res) => {
      res.json().then((data) => {
        setHFModels(data as HuggingFaceModel[]);
      });
    });
  }, []);

  const renderModelCard = useCallback(
    ({ item }: { item: HuggingFaceModel }) => {
      return (
        <ModelCard
          model={item}
          downloadProgress={downloadProgress[item.id]}
          activeDownload={activeDownloads[item.id]}
          onClickDownload={(item: HuggingFaceModel) => {
            startDownload(item);
          }}
        />
      );
    },
    [startDownload, downloadProgress, activeDownloads],
  );

  return (
    <View style={styles.container}>
      <ModelFilterSortSheet
        sortBy={sortBy}
        selectedAuthor={selectedAuthor}
        selectedPipelineTag={selectedPipelineTag}
        uniqueAuthors={uniqueAuthors}
        uniquePipelineTags={uniquePipelineTags}
        hasActiveFilters={hasActiveFilters}
        onToggleSort={toggleSort}
        onToggleAuthor={toggleAuthor}
        onTogglePipelineTag={togglePipelineTag}
      />

      <FlatList
        data={displayedModels}
        keyExtractor={(item) => item._id}
        renderItem={renderModelCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {huggingFaceModels.length === 0 ? ModelsScreenLabels.LOADING : ModelsScreenLabels.NO_MATCHES}
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
