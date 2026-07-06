import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "../constants/theme";
import type { RootStackScreenProps } from "../navigation/types";

export default function InitialScreen({ navigation }: RootStackScreenProps<"Initial">) {
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      navigation.replace("Main");
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>PocketLLM</Text>
      <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
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
  spinner: {
    marginTop: spacing.md,
  },
});
