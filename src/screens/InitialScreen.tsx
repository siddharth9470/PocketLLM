import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing, type ThemeColors, typography } from "@/constants/theme";
import type { RootStackScreenProps } from "@/navigation/types";
import { useTheme } from "@/theme/ThemeProvider";

export default function InitialScreen({ navigation }: RootStackScreenProps<"Initial">) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      navigation.replace("Main");
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>PocketLLM</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    brand: {
      ...typography.title,
      color: colors.primary,
      marginBottom: spacing.xl,
    },
  });
