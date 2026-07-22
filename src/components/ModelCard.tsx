import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import TagChip from "@/components/TagChip";
import { radii, spacing, type ThemeColors, typography } from "@/constants/theme";
import { useTheme } from "@/theme/ThemeProvider";
import type { HuggingFaceModel } from "@/types/models";
import { formatCount, formatParameterBillions, parseModelId } from "@/utils/parseModelId";

interface ModelCardProps {
  model: HuggingFaceModel;
  onPress: (model: HuggingFaceModel) => void;
}

export default function ModelCard({ model, onPress }: ModelCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { author, name: repoName } = parseModelId(model.id);
  const displayName = model.name && model.name !== model.id ? model.name : repoName;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress(model)}
      accessibilityRole="button"
    >
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.author}>{author || model.author}</Text>
          <Text style={styles.name} numberOfLines={2}>
            {displayName}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </View>

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
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    cardPressed: {
      opacity: 0.92,
    },
    headerRow: {
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
    name: {
      ...typography.headline,
      color: colors.text,
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
      marginBottom: spacing.xs,
    },
    tagsContent: {
      paddingRight: spacing.lg,
    },
  });
