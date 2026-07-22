import { scaleFont, scaleSize } from "@/utils/scaling";

export type ThemeName = "slateIndigo" | "graphiteEmerald";

/** Canonical color token contract shared by every theme palette. */
export interface ThemeColors {
  background: string;
  surface: string;
  primary: string;
  primaryPressed: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  chipBackground: string;
  chipText: string;
  userBubble: string;
  assistantBubble: string;
  assistantText: string;
  userBubbleText: string;
  danger: string;
  tabInactive: string;
  tabActive: string;
  progressTrack: string;
  shadow: string;
}

const slateIndigo: ThemeColors = {
  background: "#0F172A",
  surface: "#1E293B",
  primary: "#6366F1",
  primaryPressed: "#4F46E5",
  text: "#F1F5F9",
  textSecondary: "#94A3B8",
  textTertiary: "#64748B",
  border: "#334155",
  chipBackground: "#334155",
  chipText: "#E2E8F0",
  userBubble: "#6366F1",
  assistantBubble: "#334155",
  assistantText: "#F1F5F9",
  userBubbleText: "#FFFFFF",
  danger: "#F87171",
  tabInactive: "#64748B",
  tabActive: "#6366F1",
  progressTrack: "#334155",
  shadow: "rgba(0, 0, 0, 0.45)",
};

const graphiteEmerald: ThemeColors = {
  background: "#121212",
  surface: "#1E1E1E",
  primary: "#10B981",
  primaryPressed: "#059669",
  text: "#ECEDEE",
  textSecondary: "#A1A1AA",
  textTertiary: "#71717A",
  border: "#2A2A2A",
  chipBackground: "#2A2A2A",
  chipText: "#E4E4E7",
  userBubble: "#10B981",
  assistantBubble: "#2A2A2A",
  assistantText: "#ECEDEE",
  userBubbleText: "#052E23",
  danger: "#F87171",
  tabInactive: "#71717A",
  tabActive: "#10B981",
  progressTrack: "#2A2A2A",
  shadow: "rgba(0, 0, 0, 0.55)",
};

export const themes: Record<ThemeName, ThemeColors> = { slateIndigo, graphiteEmerald };

export const DEFAULT_THEME_NAME: ThemeName = "slateIndigo";

/** Fallback palette used before the persisted theme loads or outside a provider (e.g. tests). */
export const colors: ThemeColors = themes[DEFAULT_THEME_NAME];

export interface ThemeOption {
  name: ThemeName;
  label: string;
  description: string;
  swatch: { background: string; surface: string; accent: string };
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    name: "slateIndigo",
    label: "Slate & Electric Indigo",
    description: "Deep slate surfaces with vivid electric-indigo accents.",
    swatch: { background: slateIndigo.background, surface: slateIndigo.surface, accent: slateIndigo.primary },
  },
  {
    name: "graphiteEmerald",
    label: "Graphite & Emerald",
    description: "Material graphite surfaces with fresh emerald accents.",
    swatch: {
      background: graphiteEmerald.background,
      surface: graphiteEmerald.surface,
      accent: graphiteEmerald.primary,
    },
  },
];

export const spacing = {
  xs: scaleSize(4),
  sm: scaleSize(8),
  md: scaleSize(12),
  lg: scaleSize(16),
  xl: scaleSize(20),
  xxl: scaleSize(24),
} as const;

export const radii = {
  sm: scaleSize(8),
  md: scaleSize(12),
  lg: scaleSize(16),
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: scaleFont(28), fontWeight: "700" as const },
  headline: { fontSize: scaleFont(17), fontWeight: "600" as const },
  body: { fontSize: scaleFont(16), fontWeight: "400" as const },
  caption: { fontSize: scaleFont(13), fontWeight: "400" as const },
  chip: { fontSize: scaleFont(12), fontWeight: "500" as const },
} as const;
