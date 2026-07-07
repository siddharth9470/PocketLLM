import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "@/constants/theme";
import type { SettingsStackScreenProps } from "@/navigation/types";

export default function SettingsScreen(_props: SettingsStackScreenProps<"Settings">) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>PocketLLM</Text>
        <Text style={styles.subtitle}>Local on-device inference (coming soon)</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.rowLabel}>Storage</Text>
        <Text style={styles.rowValue}>Models save to the document directory</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.rowLabel}>Inference</Text>
        <Text style={styles.rowValue}>llama.rn integration is not wired yet</Text>
      </View>
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
    borderRadius: 12,
    padding: spacing.lg,
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
    marginBottom: spacing.xs,
  },
  rowValue: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
