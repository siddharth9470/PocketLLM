import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_FONT_NAME,
  DEFAULT_THEME_NAME,
  type FontName,
  fontFamilyForName,
  setActiveFontFamily,
  type ThemeColors,
  type ThemeName,
  themes,
} from "@/constants/theme";

const THEME_STORAGE_KEY = "@pocketllm/theme-name";
const FONT_STORAGE_KEY = "@pocketllm/font-name";

interface ThemeContextValue {
  themeName: ThemeName;
  colors: ThemeColors;
  fontName: FontName;
  fontFamily: string;
  setTheme: (name: ThemeName) => void;
  setFont: (name: FontName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeName: DEFAULT_THEME_NAME,
  colors: themes[DEFAULT_THEME_NAME],
  fontName: DEFAULT_FONT_NAME,
  fontFamily: fontFamilyForName(DEFAULT_FONT_NAME),
  setTheme: () => undefined,
  setFont: () => undefined,
});

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && value in themes;
}

function isFontName(value: string | null): value is FontName {
  return value === "timesNewRoman" || value === "comfortaa";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME_NAME);
  const [fontName, setFontName] = useState<FontName>(DEFAULT_FONT_NAME);

  useEffect(() => {
    let isMounted = true;

    void AsyncStorage.multiGet([THEME_STORAGE_KEY, FONT_STORAGE_KEY])
      .then((entries) => {
        if (!isMounted) {
          return;
        }

        const storedTheme = entries.find(([key]) => key === THEME_STORAGE_KEY)?.[1] ?? null;
        const storedFont = entries.find(([key]) => key === FONT_STORAGE_KEY)?.[1] ?? null;

        if (isThemeName(storedTheme)) {
          setThemeName(storedTheme);
        }
        if (isFontName(storedFont)) {
          setActiveFontFamily(fontFamilyForName(storedFont));
          setFontName(storedFont);
        }
      })
      .catch((error: unknown) => console.error("Failed to load persisted appearance settings:", error));

    return () => {
      isMounted = false;
    };
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, name).catch((error: unknown) =>
      console.error("Failed to persist theme:", error),
    );
  }, []);

  const setFont = useCallback((name: FontName) => {
    setActiveFontFamily(fontFamilyForName(name));
    setFontName(name);
    void AsyncStorage.setItem(FONT_STORAGE_KEY, name).catch((error: unknown) =>
      console.error("Failed to persist font:", error),
    );
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeName,
      // Fresh reference on theme or font change so memoized style factories rebuild app-wide.
      colors: { ...themes[themeName] },
      fontName,
      fontFamily: fontFamilyForName(fontName),
      setTheme,
      setFont,
    }),
    [themeName, fontName, setTheme, setFont],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
