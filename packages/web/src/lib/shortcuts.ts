export type ShortcutId = "run" | "stop" | "save" | "sidebar" | "console" | "settings";

export interface Shortcut {
  id: ShortcutId;
  label: string;
  /** `KeyboardEvent.key`, compared case-insensitively. */
  key: string;
  shift?: boolean;
}

/** All shortcuts use ⌘ on macOS and Ctrl elsewhere. */
export const SHORTCUTS: Shortcut[] = [
  { id: "run", label: "Run / restart", key: "Enter" },
  { id: "stop", label: "Stop", key: "Enter", shift: true },
  { id: "save", label: "Save now", key: "s" },
  { id: "sidebar", label: "Show / hide sidebar", key: "b" },
  { id: "console", label: "Show / hide console", key: "j" },
  { id: "settings", label: "Settings", key: "," },
];

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function matchShortcut(e: KeyboardEvent): ShortcutId | null {
  const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!mod || e.altKey) return null;
  const found = SHORTCUTS.find(
    (s) => s.key.toLowerCase() === e.key.toLowerCase() && !!s.shift === e.shiftKey,
  );
  return found?.id ?? null;
}

const KEY_NAMES: Record<string, [mac: string, other: string]> = {
  Enter: ["↵", "Enter"],
};

/** Keys of a shortcut for display, e.g. ["⌘", "⇧", "↵"] or ["Ctrl", "Shift", "Enter"]. */
export function shortcutKeys(id: ShortcutId): string[] {
  const s = SHORTCUTS.find((x) => x.id === id)!;
  const name = KEY_NAMES[s.key]?.[isMac ? 0 : 1] ?? s.key.toUpperCase();
  return [isMac ? "⌘" : "Ctrl", ...(s.shift ? [isMac ? "⇧" : "Shift"] : []), name];
}

export const shortcutText = (id: ShortcutId) => shortcutKeys(id).join(isMac ? "" : "+");
