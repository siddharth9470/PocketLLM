import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Alert, Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { radii, spacing, type ThemeColors, typography } from "@/constants/theme";
import { useTheme } from "@/theme/ThemeProvider";

export type DialogButtonStyle = "default" | "cancel" | "destructive";

export interface DialogButton {
  text: string;
  style?: DialogButtonStyle;
  onPress?: () => void;
}

export interface DialogConfig {
  title: string;
  message?: string;
  buttons?: DialogButton[];
}

type ShowDialog = (config: DialogConfig) => void;

/** Fallback surfaces dialogs via the native alert when used outside a {@link DialogProvider} (e.g. tests). */
const DialogContext = createContext<ShowDialog>((config) => {
  Alert.alert(
    config.title,
    config.message,
    config.buttons?.map((button) => ({ text: button.text, style: button.style, onPress: button.onPress })),
  );
});

const DEFAULT_BUTTONS: DialogButton[] = [{ text: "OK", style: "default" }];

export function DialogProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [config, setConfig] = useState<DialogConfig | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  const dismiss = useCallback(
    (onPress?: () => void) => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.9, duration: 140, useNativeDriver: true }),
      ]).start(() => {
        setConfig(null);
        onPress?.();
      });
    },
    [opacity, scale],
  );

  const showDialog = useCallback<ShowDialog>(
    (next) => {
      setConfig(next);
      opacity.setValue(0);
      scale.setValue(0.9);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
      ]).start();
    },
    [opacity, scale],
  );

  const styles = useMemo(() => createStyles(colors), [colors]);
  const buttons = config?.buttons?.length ? config.buttons : DEFAULT_BUTTONS;

  return (
    <DialogContext.Provider value={showDialog}>
      {children}
      <Modal visible={config !== null} transparent animationType="none" onRequestClose={() => dismiss()}>
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} accessibilityRole="button" />
          <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
            {config ? (
              <>
                <Text style={styles.title}>{config.title}</Text>
                {config.message ? <Text style={styles.message}>{config.message}</Text> : null}
                <View style={buttons.length > 1 ? styles.actionsRow : styles.actionsColumn}>
                  {buttons.map((button) => (
                    <Pressable
                      key={button.text}
                      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                      onPress={() => dismiss(button.onPress)}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.buttonText,
                          button.style === "cancel" && styles.cancelText,
                          button.style === "destructive" && styles.destructiveText,
                        ]}
                      >
                        {button.text}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </Animated.View>
        </Animated.View>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog(): ShowDialog {
  return useContext(DialogContext);
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
    },
    card: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 1,
      shadowRadius: 24,
      elevation: 8,
    },
    title: {
      ...typography.headline,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    message: {
      ...typography.body,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
    },
    actionsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: spacing.sm,
    },
    actionsColumn: {
      alignItems: "stretch",
      gap: spacing.sm,
    },
    button: {
      minHeight: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonPressed: {
      backgroundColor: colors.chipBackground,
    },
    buttonText: {
      ...typography.headline,
      color: colors.primary,
    },
    cancelText: {
      color: colors.textSecondary,
    },
    destructiveText: {
      color: colors.danger,
    },
  });
