import { createContext, use, useMemo, type ReactNode } from "react";
import { usePref } from "./storage";

export interface EditorSettings {
  fontSize: number;
  wordWrap: boolean;
}

export const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20];
const DEFAULTS: EditorSettings = { fontSize: 13, wordWrap: false };

interface SettingsValue {
  settings: EditorSettings;
  update: (patch: Partial<EditorSettings>) => void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

/** Editor preferences, remembered in localStorage. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = usePref<Partial<EditorSettings>>("editor", {});
  const value = useMemo(() => {
    const settings = { ...DEFAULTS, ...stored };
    return {
      settings,
      update: (patch: Partial<EditorSettings>) => setStored({ ...settings, ...patch }),
    };
  }, [stored, setStored]);
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings() {
  const value = use(SettingsContext);
  if (!value) throw new Error("useSettings outside SettingsProvider");
  return value;
}
