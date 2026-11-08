import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePref } from "./storage";

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const query = "(prefers-color-scheme: dark)";

function systemTheme(): Theme {
  return typeof matchMedia === "function" && matchMedia(query).matches ? "dark" : "light";
}

interface ThemeValue {
  pref: ThemePref;
  theme: Theme;
  setPref: (pref: ThemePref) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/** Follows the system by default; an explicit choice is remembered. Sets `data-theme` on `<html>`. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = usePref<ThemePref>("theme", "system");
  const [system, setSystem] = useState(systemTheme);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const media = matchMedia(query);
    const onChange = () => setSystem(media.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const theme = pref === "system" ? system : pref;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo(() => ({ pref, theme, setPref }), [pref, theme, setPref]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const value = use(ThemeContext);
  if (!value) throw new Error("useTheme outside ThemeProvider");
  return value;
}
