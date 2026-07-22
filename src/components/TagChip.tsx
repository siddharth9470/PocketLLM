import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { radii, spacing, type ThemeColors, typography } from "@/constants/theme";
import { useTheme } from "@/theme/ThemeProvider";

interface TagChipProps {
  label: string;
}

export default function TagChip({ label }: TagChipProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.chip}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    chip: {
      backgroundColor: colors.chipBackground,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginRight: spacing.sm,
    },
    label: {
      ...typography.chip,
      color: colors.chipText,
    },
  });
