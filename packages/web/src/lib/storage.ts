import { useCallback, useState } from "react";

/** UI preferences in localStorage. Storage can be missing or throw (private mode, blocked site data). */
const PREFIX = "ledsim.";

export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Not persisted; the value still applies for this page.
  }
}

/** `useState` that is remembered in localStorage. */
export function usePref<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readPref(key, fallback));
  const set = useCallback(
    (next: T) => {
      setValue(next);
      writePref(key, next);
    },
    [key],
  );
  return [value, set] as const;
}

/** `Storage`-shaped adapter for `react-resizable-panels` layouts. */
export const layoutStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {
      // ignore
    }
  },
};
