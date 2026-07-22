import { Ionicons } from "@expo/vector-icons";
import type { NativeStackHeaderProps } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing, type ThemeColors, typography } from "@/constants/theme";
import { useTheme } from "@/theme/ThemeProvider";
import { scaleSize } from "@/utils/scaling";

const HEADER_BAR_HEIGHT = scaleSize(44);
const SIDE_SLOT_MIN_WIDTH = scaleSize(56);

export default function AppHeader(props: NativeStackHeaderProps) {
  const { options, navigation, back, route } = props;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const canGoBack = navigation.canGoBack();
  const tintColor = colors.text;
  const headerItemProps = { tintColor, canGoBack };
  const headerBackProps = { ...headerItemProps, label: back?.title, href: back?.href };

  const titleContent = (() => {
    const { headerTitle, title } = options;

    if (typeof headerTitle === "function") {
      return headerTitle({ children: title ?? route.name, tintColor });
    }

    const label = typeof headerTitle === "string" ? headerTitle : (title ?? route.name);

    return (
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {label}
      </Text>
    );
  })();

  const leftContent = (() => {
    if (options.headerLeft) {
      return options.headerLeft(headerBackProps);
    }

    if (!canGoBack || options.headerBackVisible === false) {
      return <View style={styles.sideSlot} />;
    }

    return (
      <Pressable
        onPress={() => navigation.goBack()}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
      >
        <Ionicons name={Platform.OS === "ios" ? "chevron-back" : "arrow-back"} size={scaleSize(24)} color={tintColor} />
      </Pressable>
    );
  })();

  const rightContent = options.headerRight ? (
    <View style={styles.sideSlot}>{options.headerRight(headerItemProps)}</View>
  ) : (
    <View style={styles.sideSlot} />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <View style={styles.leftSlot}>{leftContent}</View>
        <View style={styles.titleSlot} pointerEvents="none">
          {titleContent}
        </View>
        <View style={styles.rightSlot}>{rightContent}</View>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
    },
    bar: {
      height: HEADER_BAR_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
    },
    leftSlot: {
      minWidth: SIDE_SLOT_MIN_WIDTH,
      alignItems: "flex-start",
      justifyContent: "center",
      paddingLeft: spacing.sm,
      zIndex: 1,
    },
    rightSlot: {
      minWidth: SIDE_SLOT_MIN_WIDTH,
      alignItems: "flex-end",
      justifyContent: "center",
      paddingRight: spacing.sm,
      zIndex: 1,
    },
    sideSlot: {
      minWidth: SIDE_SLOT_MIN_WIDTH,
      alignItems: "center",
      justifyContent: "center",
    },
    backButton: {
      minWidth: SIDE_SLOT_MIN_WIDTH,
      height: HEADER_BAR_HEIGHT,
      alignItems: "flex-start",
      justifyContent: "center",
      paddingLeft: spacing.xs,
    },
    titleSlot: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: SIDE_SLOT_MIN_WIDTH + spacing.sm,
    },
    title: {
      ...typography.headline,
      color: colors.text,
      textAlign: "center",
    },
  });
