import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  ModelFilterSortLabels,
  SORT_FIELD_CONFIG,
  SORT_OPTIONS,
  type SortField,
  type SortOption,
} from "../constants/modelFilters";
import { colors, radii, spacing, typography } from "../constants/theme";

interface ModelFilterSortSheetProps {
  sortBy: SortOption;
  selectedAuthor: string | null;
  selectedPipelineTag: string | null;
  uniqueAuthors: string[];
  uniquePipelineTags: string[];
  hasActiveFilters: boolean;
  onToggleSort: (option: SortField) => void;
  onToggleAuthor: (author: string) => void;
  onTogglePipelineTag: (pipelineTag: string) => void;
}

interface FilterChipItemProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

const FilterChipItem = memo(({ label, isActive, onPress }: FilterChipItemProps) => (
  <Pressable
    style={[styles.chip, isActive && styles.chipActive]}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: isActive }}
  >
    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{label}</Text>
  </Pressable>
));

interface SortOptionItemProps {
  isActive: boolean;
  label: string;
  onPress: () => void;
}

const SortOptionItem = memo(({ isActive, label, onPress }: SortOptionItemProps) => (
  <Pressable
    style={[styles.sortButton, isActive && styles.sortButtonActive]}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: isActive }}
  >
    <Text style={[styles.sortButtonText, isActive && styles.sortButtonTextActive]}>{label}</Text>
    {isActive && <Text style={styles.sortDirection}>{ModelFilterSortLabels.SORT_DIRECTION}</Text>}
  </Pressable>
));

export default function ModelFilterSortSheet({
  sortBy,
  selectedAuthor,
  selectedPipelineTag,
  uniqueAuthors,
  uniquePipelineTags,
  hasActiveFilters,
  onToggleSort,
  onToggleAuthor,
  onTogglePipelineTag,
}: ModelFilterSortSheetProps) {
  const [visible, setVisible] = useState(false);

  const closeSheet = useCallback(() => {
    setVisible(false);
  }, []);

  const renderSortOption = useCallback(
    ({ item }: { item: SortField }) => {
      const isActive = sortBy === item;
      const { label } = SORT_FIELD_CONFIG[item];

      return (
        <SortOptionItem isActive={isActive} label={label} onPress={() => onToggleSort(item)} />
      );
    },
    [sortBy, onToggleSort],
  );

  const renderAuthorItem = useCallback(
    ({ item }: { item: string }) => (
      <FilterChipItem
        label={item}
        isActive={selectedAuthor === item}
        onPress={() => onToggleAuthor(item)}
      />
    ),
    [selectedAuthor, onToggleAuthor],
  );

  const renderPipelineTagItem = useCallback(
    ({ item }: { item: string }) => (
      <FilterChipItem
        label={item}
        isActive={selectedPipelineTag === item}
        onPress={() => onTogglePipelineTag(item)}
      />
    ),
    [selectedPipelineTag, onTogglePipelineTag],
  );

  const keyExtractor = useCallback((item: string) => item, []);

  return (
    <>
      <Pressable
        style={[styles.trigger, hasActiveFilters && styles.triggerActive]}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
      >
        <Ionicons name="options-outline" size={18} color={hasActiveFilters ? colors.surface : colors.primary} />
        <Text style={[styles.triggerText, hasActiveFilters && styles.triggerTextActive]}>
          {ModelFilterSortLabels.TRIGGER_BUTTON}
        </Text>
        {hasActiveFilters && <View style={styles.activeDot} />}
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={closeSheet}>
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropPressable} onPress={closeSheet} accessibilityRole="button" />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{ModelFilterSortLabels.MODAL_TITLE}</Text>
              <Pressable onPress={closeSheet} hitSlop={8} accessibilityRole="button">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.sheetBody}
              contentContainerStyle={styles.sheetContent}
              showsVerticalScrollIndicator
              bounces
              nestedScrollEnabled
            >
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{ModelFilterSortLabels.SORT_SECTION}</Text>
                <FlatList
                  data={SORT_OPTIONS}
                  renderItem={renderSortOption}
                  keyExtractor={keyExtractor}
                  numColumns={2}
                  scrollEnabled={false}
                  columnWrapperStyle={styles.sortRow}
                />
              </View>

              {uniqueAuthors.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{ModelFilterSortLabels.AUTHOR_SECTION}</Text>
                  <FlatList
                    data={uniqueAuthors}
                    renderItem={renderAuthorItem}
                    keyExtractor={keyExtractor}
                    scrollEnabled={false}
                    contentContainerStyle={styles.chipList}
                  />
                </View>
              )}

              {uniquePipelineTags.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{ModelFilterSortLabels.PIPELINE_SECTION}</Text>
                  <FlatList
                    data={uniquePipelineTags}
                    renderItem={renderPipelineTagItem}
                    keyExtractor={keyExtractor}
                    scrollEnabled={false}
                    contentContainerStyle={styles.chipList}
                  />
                </View>
              )}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <Pressable style={styles.doneButton} onPress={closeSheet} accessibilityRole="button">
                <Text style={styles.doneButtonText}>{ModelFilterSortLabels.CLOSE}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  triggerActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  triggerText: {
    ...typography.chip,
    color: colors.primary,
    fontWeight: "600",
  },
  triggerTextActive: {
    color: colors.surface,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "flex-end",
  },
  backdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: "65%",
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    ...typography.headline,
    color: colors.text,
  },
  sheetBody: {
    flexShrink: 1,
  },
  sheetContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.lg,
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
  },
  sortRow: {
    gap: spacing.sm,
  },
  sortButton: {
    flex: 1,
    backgroundColor: colors.chipBackground,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortButtonText: {
    ...typography.chip,
    color: colors.chipText,
    fontWeight: "600",
  },
  sortButtonTextActive: {
    color: colors.surface,
  },
  sortDirection: {
    ...typography.caption,
    color: colors.surface,
    marginTop: spacing.xs,
    opacity: 0.9,
  },
  chipList: {
    gap: spacing.sm,
  },
  chip: {
    alignSelf: "flex-start",
    backgroundColor: colors.chipBackground,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.chip,
    color: colors.chipText,
  },
  chipTextActive: {
    color: colors.surface,
    fontWeight: "600",
  },
  sheetFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  doneButtonText: {
    ...typography.headline,
    fontSize: 15,
    color: colors.surface,
  },
});
