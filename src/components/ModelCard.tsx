import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../constants/theme';
import type { HuggingFaceModel } from '../types/models';
import { formatCount, parseModelId } from '../utils/parseModelId';
import { useDownloadStore } from '../stores/downloadStore';
import PrimaryButton from './PrimaryButton';
import TagChip from './TagChip';

interface ModelCardProps {
  model: HuggingFaceModel;
}

export default function ModelCard({ model }: ModelCardProps) {
  const { author, name } = parseModelId(model.id);
  const download = useDownloadStore((state) => state.getDownload(model.id));
  const startDownload = useDownloadStore((state) => state.startDownload);

  const isDownloading = download.status === 'downloading';
  const isCompleted = download.status === 'completed';
  const isFailed = download.status === 'failed';

  const buttonLabel = isCompleted
    ? 'Downloaded'
    : isDownloading
      ? `Downloading ${download.progress}%`
      : isFailed
        ? 'Retry Download'
        : 'Download Model';

  return (
    <View style={styles.card}>
      <Text style={styles.author}>{author}</Text>
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

      {isDownloading && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${download.progress}%` }]} />
        </View>
      )}

      <PrimaryButton
        label={buttonLabel}
        onPress={() => startDownload(model.id)}
        loading={isDownloading}
        disabled={isCompleted || isDownloading}
        variant={isCompleted ? 'success' : 'primary'}
      />
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
    flexDirection: 'row',
    gap: spacing.xl,
    marginBottom: spacing.md,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
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
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
});
