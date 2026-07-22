import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { radii, spacing, THEME_OPTIONS, type ThemeColors, type ThemeOption, typography } from "@/constants/theme";
import type { SettingsStackScreenProps } from "@/navigation/types";
import { useTheme } from "@/theme/ThemeProvider";

export default function SettingsScreen({ navigation }: SettingsStackScreenProps<"Settings">) {
  const { colors, themeName, setTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>PocketLLM</Text>
        <Text style={styles.subtitle}>Local on-device inference (coming soon)</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Appearance</Text>
        {THEME_OPTIONS.map((option) => (
          <ThemeOptionCard
            key={option.name}
            option={option}
            isActive={option.name === themeName}
            onSelect={() => setTheme(option.name)}
            styles={styles}
            activeColor={colors.primary}
            inactiveColor={colors.textTertiary}
          />
        ))}
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
    </ScrollView>
  );
}

interface ThemeOptionCardProps {
  option: ThemeOption;
  isActive: boolean;
  onSelect: () => void;
  styles: SettingsStyles;
  activeColor: string;
  inactiveColor: string;
}

function ThemeOptionCard({ option, isActive, onSelect, styles, activeColor, inactiveColor }: ThemeOptionCardProps) {
  return (
    <Pressable
      style={[styles.themeCard, isActive && styles.themeCardActive]}
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={option.label}
    >
      <View style={[styles.swatch, { backgroundColor: option.swatch.background }]}>
        <View style={[styles.swatchSurface, { backgroundColor: option.swatch.surface }]} />
        <View style={[styles.swatchAccent, { backgroundColor: option.swatch.accent }]} />
      </View>

      <View style={styles.themeText}>
        <Text style={styles.themeLabel}>{option.label}</Text>
        <Text style={styles.themeDescription}>{option.description}</Text>
      </View>

      <Ionicons
        name={isActive ? "checkmark-circle" : "ellipse-outline"}
        size={22}
        color={isActive ? activeColor : inactiveColor}
      />
    </Pressable>
  );
}

type SettingsStyles = ReturnType<typeof createStyles>;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      padding: spacing.lg,
      gap: spacing.lg,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.lg,
    },
    section: {
      gap: spacing.sm,
    },
    sectionLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginLeft: spacing.xs,
    },
    themeCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    themeCardActive: {
      borderColor: colors.primary,
    },
    swatch: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      padding: spacing.xs,
      justifyContent: "space-between",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    swatchSurface: {
      height: 10,
      borderRadius: radii.sm / 2,
    },
    swatchAccent: {
      height: 10,
      width: "60%",
      borderRadius: radii.pill,
    },
    themeText: {
      flex: 1,
      flexShrink: 1,
      gap: spacing.xs,
    },
    themeLabel: {
      ...typography.headline,
      color: colors.text,
    },
    themeDescription: {
      ...typography.caption,
      color: colors.textSecondary,
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
      color: colors.text,
      marginBottom: spacing.xs,
    },
    subtitle: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    rowLabel: {
      ...typography.headline,
      color: colors.text,
    },
    rowValue: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    chevron: {
      ...typography.headline,
      color: colors.textTertiary,
    },
  });
