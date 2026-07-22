import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { DEFAULT_THEME_NAME, type ThemeColors, type ThemeName, themes } from "@/constants/theme";

const THEME_STORAGE_KEY = "@pocketllm/theme-name";

interface ThemeContextValue {
  themeName: ThemeName;
  colors: ThemeColors;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeName: DEFAULT_THEME_NAME,
  colors: themes[DEFAULT_THEME_NAME],
  setTheme: () => undefined,
});

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && value in themes;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME_NAME);

  useEffect(() => {
    let isMounted = true;

    void AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (isMounted && isThemeName(stored)) {
          setThemeName(stored);
        }
      })
      .catch((error: unknown) => console.error("Failed to load persisted theme:", error));

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

  const value = useMemo<ThemeContextValue>(
    () => ({ themeName, colors: themes[themeName], setTheme }),
    [themeName, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
