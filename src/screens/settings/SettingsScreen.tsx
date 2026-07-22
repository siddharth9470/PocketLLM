import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  FONT_OPTIONS,
  type FontOption,
  radii,
  spacing,
  THEME_OPTIONS,
  type ThemeColors,
  type ThemeOption,
  typography,
} from "@/constants/theme";
import type { SettingsStackScreenProps } from "@/navigation/types";
import { useTheme } from "@/theme/ThemeProvider";

type ActiveSheet = "none" | "theme" | "font";

export default function SettingsScreen({ navigation }: SettingsStackScreenProps<"Settings">) {
  const { colors, themeName, setTheme, fontName, setFont } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>("none");

  const activeThemeLabel = THEME_OPTIONS.find((option) => option.name === themeName)?.label ?? "";
  const activeFontLabel = FONT_OPTIONS.find((option) => option.name === fontName)?.label ?? "";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>PocketLLM</Text>
        <Text style={styles.subtitle}>Local on-device inference (coming soon)</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Appearance</Text>

        <SettingRow
          icon="color-palette-outline"
          label="Change Theme"
          value={activeThemeLabel}
          onPress={() => setActiveSheet("theme")}
          styles={styles}
          accentColor={colors.primary}
        />
        <SettingRow
          icon="text-outline"
          label="Change Font"
          value={activeFontLabel}
          onPress={() => setActiveSheet("font")}
          styles={styles}
          accentColor={colors.primary}
        />
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

      <SelectionSheet
        visible={activeSheet === "theme"}
        title="Change Theme"
        onClose={() => setActiveSheet("none")}
        styles={styles}
      >
        {THEME_OPTIONS.map((option) => (
          <ThemeOptionRow
            key={option.name}
            option={option}
            isActive={option.name === themeName}
            onSelect={() => {
              setTheme(option.name);
              setActiveSheet("none");
            }}
            styles={styles}
            activeColor={colors.primary}
          />
        ))}
      </SelectionSheet>

      <SelectionSheet
        visible={activeSheet === "font"}
        title="Change Font"
        onClose={() => setActiveSheet("none")}
        styles={styles}
      >
        {FONT_OPTIONS.map((option) => (
          <FontOptionRow
            key={option.name}
            option={option}
            isActive={option.name === fontName}
            onSelect={() => {
              setFont(option.name);
              setActiveSheet("none");
            }}
            styles={styles}
            activeColor={colors.primary}
          />
        ))}
      </SelectionSheet>
    </ScrollView>
  );
}

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
  styles: SettingsStyles;
  accentColor: string;
}

function SettingRow({ icon, label, value, onPress, styles, accentColor }: SettingRowProps) {
  return (
    <Pressable style={styles.linkCard} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={accentColor} />
      <View style={styles.linkContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

interface SelectionSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  styles: SettingsStyles;
  children: ReactNode;
}

function SelectionSheet({ visible, title, onClose, styles, children }: SelectionSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface ThemeOptionRowProps {
  option: ThemeOption;
  isActive: boolean;
  onSelect: () => void;
  styles: SettingsStyles;
  activeColor: string;
}

function ThemeOptionRow({ option, isActive, onSelect, styles, activeColor }: ThemeOptionRowProps) {
  return (
    <Pressable
      style={styles.optionRow}
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={option.label}
    >
      <View style={[styles.swatch, { backgroundColor: option.swatch.background }]}>
        <View style={[styles.swatchSurface, { backgroundColor: option.swatch.surface }]} />
        <View style={[styles.swatchAccent, { backgroundColor: option.swatch.accent }]} />
      </View>
      <View style={styles.optionTextWrap}>
        <Text style={styles.optionLabel}>{option.label}</Text>
        <Text style={styles.optionDescription}>{option.description}</Text>
      </View>
      {isActive ? <Ionicons name="checkmark-circle" size={22} color={activeColor} /> : null}
    </Pressable>
  );
}

interface FontOptionRowProps {
  option: FontOption;
  isActive: boolean;
  onSelect: () => void;
  styles: SettingsStyles;
  activeColor: string;
}

function FontOptionRow({ option, isActive, onSelect, styles, activeColor }: FontOptionRowProps) {
  return (
    <Pressable
      style={styles.optionRow}
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={option.label}
    >
      <View style={styles.optionTextWrap}>
        <Text style={[styles.optionLabel, { fontFamily: option.fontFamily }]}>{option.label}</Text>
        <Text style={[styles.fontPreview, { fontFamily: option.fontFamily }]}>The quick brown fox jumps over 1234</Text>
      </View>
      {isActive ? <Ionicons name="checkmark-circle" size={22} color={activeColor} /> : null}
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
    sheetBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: spacing.lg,
      maxHeight: "70%",
    },
    sheetTitle: {
      ...typography.headline,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    optionTextWrap: {
      flex: 1,
      flexShrink: 1,
      gap: spacing.xs,
    },
    optionLabel: {
      ...typography.headline,
      color: colors.text,
    },
    optionDescription: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    fontPreview: {
      ...typography.body,
      color: colors.textSecondary,
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
  });
