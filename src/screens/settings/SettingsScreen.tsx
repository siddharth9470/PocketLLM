import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "@/constants/theme";
import type { SettingsStackScreenProps } from "@/navigation/types";

export default function SettingsScreen({ navigation }: SettingsStackScreenProps<"Settings">) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>PocketLLM</Text>
        <Text style={styles.subtitle}>Local on-device inference (coming soon)</Text>
      </View>

      <Pressable
        style={styles.linkCard}
        onPress={() => navigation.navigate("DeviceInfo")}
        accessibilityRole="button"
        accessibilityLabel="Device info"
      >
        <View style={styles.linkContent}>
          <Text style={styles.rowLabel}>Device info</Text>
          <Text style={styles.rowValue}>View hardware, memory, and storage</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  linkCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  linkContent: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.headline,
    fontSize: 20,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rowLabel: {
    ...typography.headline,
    fontSize: 15,
    color: colors.text,
  },
  rowValue: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chevron: {
    ...typography.headline,
    color: colors.textTertiary,
    fontSize: 22,
  },
});
