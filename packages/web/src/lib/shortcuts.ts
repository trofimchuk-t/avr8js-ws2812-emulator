export type ShortcutId = "run" | "stop" | "save" | "sidebar" | "console" | "terminal" | "settings";

export interface Shortcut {
  id: ShortcutId;
  label: string;
  /** `KeyboardEvent.key`, compared case-insensitively. */
  key: string;
  /** `KeyboardEvent.code`; when set it is matched instead of `key` (layout-independent). */
  code?: string;
  shift?: boolean;
  /** Ctrl on every platform, as in VS Code (⌘` switches windows on macOS). */
  ctrl?: boolean;
}

/** Shortcuts use ⌘ on macOS and Ctrl elsewhere, unless marked `ctrl`. */
export const SHORTCUTS: Shortcut[] = [
  { id: "run", label: "Run / restart", key: "Enter" },
  { id: "stop", label: "Stop", key: "Enter", shift: true },
  { id: "save", label: "Save now", key: "s" },
  { id: "sidebar", label: "Show / hide sidebar", key: "b" },
  { id: "console", label: "Show / hide console", key: "j" },
  { id: "terminal", label: "Focus serial terminal", key: "`", code: "Backquote", ctrl: true },
  { id: "settings", label: "Settings", key: "," },
];

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function matchShortcut(e: KeyboardEvent): ShortcutId | null {
  if (e.altKey) return null;
  const cmd = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  const ctrl = e.ctrlKey && !e.metaKey;
  const found = SHORTCUTS.find(
    (s) =>
      (s.ctrl ? ctrl : cmd) &&
      !!s.shift === e.shiftKey &&
      (s.code ? s.code === e.code : s.key.toLowerCase() === e.key.toLowerCase()),
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
  const mod = s.ctrl ? (isMac ? "⌃" : "Ctrl") : isMac ? "⌘" : "Ctrl";
  return [mod, ...(s.shift ? [isMac ? "⇧" : "Shift"] : []), name];
}

export const shortcutText = (id: ShortcutId) => shortcutKeys(id).join(isMac ? "" : "+");
