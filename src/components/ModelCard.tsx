import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "../constants/theme";
import type { HuggingFaceModel } from "../types/models";
import { formatCount, parseModelId } from "../utils/parseModelId";
import PrimaryButton from "./PrimaryButton";
import TagChip from "./TagChip";

interface ModelCardProps {
  model: HuggingFaceModel;
  downloadProgress: number;
  activeDownload: boolean;
  onClickDownload: (item: HuggingFaceModel) => void;
  isDownloaded?: boolean;
  isDownloading?: boolean;
  progress?: number;
}

export default function ModelCard(props: ModelCardProps) {
  const {
    model,
    onClickDownload,
    downloadProgress,
    activeDownload,
    isDownloaded = false,
    isDownloading,
    progress = 0,
  } = props;
  const downloading = typeof isDownloading === "boolean" ? isDownloading : activeDownload;
  const currentProgress = typeof props.progress === "number" ? props.progress : downloadProgress;

  const { name } = parseModelId(model.id);

  return (
    <View style={styles.card}>
      <Text style={styles.author}>{model.author}</Text>
      <Text style={styles.name}>{name}</Text>

      <View style={styles.metricsRow}>
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

      {downloading ? (
        <>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${currentProgress}%` }]} />
          </View>
          <Text style={styles.progressText}>Downloading {Math.round(currentProgress)}%</Text>
        </>
      ) : (
        <PrimaryButton
          label={isDownloaded ? "Open" : "Download"}
          onPress={async () => onClickDownload(model)}
          variant={isDownloaded ? "secondary" : "primary"}
          style={[styles.downloadButton, isDownloaded && styles.completedButton]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  author: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  name: {
    ...typography.headline,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.md,
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.xl,
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
  progressTrack: {
    height: 4,
    backgroundColor: colors.progressTrack,
    borderRadius: radii.pill,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  progressText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    alignSelf: "center",
  },
  downloadButton: {
    backgroundColor: colors.primary,
  },
  completedButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
});
