import { scaleFont, scaleSize } from "@/utils/scaling";

export type ThemeName = "slateIndigo" | "graphiteEmerald" | "monokaiAmber";

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

const monokaiAmber: ThemeColors = {
  background: "#2D2A2E",
  surface: "#403E41",
  primary: "#FFD866",
  primaryPressed: "#E0B84D",
  text: "#FCFCFA",
  textSecondary: "#A59FA0",
  textTertiary: "#727072",
  border: "#5B595C",
  chipBackground: "#5B595C",
  chipText: "#FCFCFA",
  userBubble: "#FFD866",
  assistantBubble: "#5B595C",
  assistantText: "#FCFCFA",
  userBubbleText: "#2D2A2E",
  danger: "#FF6188",
  tabInactive: "#727072",
  tabActive: "#FFD866",
  progressTrack: "#5B595C",
  shadow: "rgba(0, 0, 0, 0.5)",
};

export const themes: Record<ThemeName, ThemeColors> = {
  slateIndigo,
  graphiteEmerald,
  monokaiAmber,
};

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
  {
    name: "monokaiAmber",
    label: "Monokai Pro & Vibrant Amber",
    description: "Monokai charcoal surfaces with warm vibrant amber accents.",
    swatch: {
      background: monokaiAmber.background,
      surface: monokaiAmber.surface,
      accent: monokaiAmber.primary,
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

export type FontName = "timesNewRoman" | "comfortaa";

const fontFamilies: Record<FontName, string> = {
  timesNewRoman: "TimesNewRoman",
  comfortaa: "Comfortaa",
};

export interface FontOption {
  name: FontName;
  label: string;
  fontFamily: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { name: "timesNewRoman", label: "Times New Roman", fontFamily: fontFamilies.timesNewRoman },
  { name: "comfortaa", label: "Comfortaa", fontFamily: fontFamilies.comfortaa },
];

export const DEFAULT_FONT_NAME: FontName = "comfortaa";

export function fontFamilyForName(name: FontName): string {
  return fontFamilies[name];
}

/**
 * Module-level active font family, applied to every {@link typography} token.
 * The theme provider updates it synchronously on selection so style factories
 * rebuilt on the following render pick up the new family app-wide.
 */
let activeFontFamily: string = fontFamilyForName(DEFAULT_FONT_NAME);

export function setActiveFontFamily(fontFamily: string): void {
  activeFontFamily = fontFamily;
}

export interface TypographyToken {
  fontSize: number;
  fontWeight: "400" | "500" | "600" | "700";
  fontFamily?: string;
}

export const typography = {
  get title(): TypographyToken {
    return { fontSize: scaleFont(28), fontWeight: "700", fontFamily: activeFontFamily };
  },
  get headline(): TypographyToken {
    return { fontSize: scaleFont(17), fontWeight: "600", fontFamily: activeFontFamily };
  },
  get body(): TypographyToken {
    return { fontSize: scaleFont(16), fontWeight: "400", fontFamily: activeFontFamily };
  },
  get caption(): TypographyToken {
    return { fontSize: scaleFont(13), fontWeight: "400", fontFamily: activeFontFamily };
  },
  get chip(): TypographyToken {
    return { fontSize: scaleFont(12), fontWeight: "500", fontFamily: activeFontFamily };
  },
};
