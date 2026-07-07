import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "@/constants/theme";

interface TagChipProps {
  label: string;
}

export default function TagChip({ label }: TagChipProps) {
  return (
    <View style={styles.chip}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
