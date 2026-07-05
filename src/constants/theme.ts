export const colors = {
  background: "#F2F2F7",
  surface: "#FFFFFF",
  primary: "#5856D6",
  primaryPressed: "#4745B5",
  text: "#1C1C1E",
  textSecondary: "#8E8E93",
  textTertiary: "#AEAEB2",
  border: "#E5E5EA",
  chipBackground: "#EFEFF4",
  chipText: "#3C3C43",
  userBubble: "#5856D6",
  assistantBubble: "#E9E9EB",
  assistantText: "#1C1C1E",
  userBubbleText: "#FFFFFF",
  danger: "#FF3B30",
  tabInactive: "#8E8E93",
  tabActive: "#5856D6",
  progressTrack: "#E5E5EA",
  shadow: "rgba(0, 0, 0, 0.08)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 28, fontWeight: "700" as const },
  headline: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
  caption: { fontSize: 13, fontWeight: "400" as const },
  chip: { fontSize: 12, fontWeight: "500" as const },
} as const;
