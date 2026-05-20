import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radii, spacing, typography } from '../constants/theme';
import { parseModelId } from '../utils/parseModelId';

interface ModelPickerProps {
  selectedModelId: string;
  availableModelIds: string[];
  onSelect: (modelId: string) => void;
}

export default function ModelPicker({
  selectedModelId,
  availableModelIds,
  onSelect,
}: ModelPickerProps) {
  const [visible, setVisible] = useState(false);
  const { name: selectedName } = parseModelId(selectedModelId);

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setVisible(true)}>
        <Ionicons name="hardware-chip-outline" size={16} color={colors.primary} />
        <Text style={styles.triggerText} numberOfLines={1}>
          {selectedName}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Active Model</Text>
            {availableModelIds.length === 0 ? (
              <Text style={styles.emptyText}>
                Download a model from the Models tab to use it in chat.
              </Text>
            ) : (
              <ScrollView>
                {availableModelIds.map((modelId) => {
                  const { author, name } = parseModelId(modelId);
                  const isSelected = modelId === selectedModelId;

                  return (
                    <Pressable
                      key={modelId}
                      style={[styles.option, isSelected && styles.optionSelected]}
                      onPress={() => {
                        onSelect(modelId);
                        setVisible(false);
                      }}
                    >
                      <View style={styles.optionTextWrap}>
                        <Text style={styles.optionName}>{name}</Text>
                        <Text style={styles.optionAuthor}>{author}</Text>
                      </View>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 180,
    backgroundColor: colors.chipBackground,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  triggerText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    maxHeight: '55%',
  },
  sheetTitle: {
    ...typography.headline,
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingVertical: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionSelected: {
    backgroundColor: colors.chipBackground,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionName: {
    ...typography.headline,
    fontSize: 15,
    color: colors.text,
  },
  optionAuthor: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
