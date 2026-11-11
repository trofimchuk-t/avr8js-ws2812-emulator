import { describe, expect, it } from "vitest";
import { isMac, matchShortcut } from "./shortcuts";

// The modifier is ⌘ on macOS (Node reports the host platform too) and Ctrl elsewhere.
const mod = isMac ? "metaKey" : "ctrlKey";
const key = (k: string, mods: Record<string, boolean> = {}) =>
  ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    [mod]: true,
    ...mods,
  }) as unknown as KeyboardEvent;

describe("matchShortcut", () => {
  it("matches modifier combinations, with and without Shift", () => {
    expect(matchShortcut(key("Enter"))).toBe("run");
    expect(matchShortcut(key("Enter", { shiftKey: true }))).toBe("stop");
    expect(matchShortcut(key("S"))).toBe("save");
    expect(matchShortcut(key(","))).toBe("settings");
  });

  it("matches Ctrl+` by key code on every platform and layout", () => {
    const ctrl = { [mod]: false, ctrlKey: true };
    expect(matchShortcut({ ...key("ё", ctrl), code: "Backquote" })).toBe("terminal");
    expect(matchShortcut({ ...key("`", ctrl), code: "Backquote", shiftKey: true })).toBeNull();
    if (isMac) expect(matchShortcut({ ...key("`"), code: "Backquote" })).toBeNull();
  });

  it("ignores plain keys, Alt combinations and unknown keys", () => {
    expect(matchShortcut(key("Enter", { [mod]: false }))).toBeNull();
    expect(matchShortcut(key("s", { altKey: true }))).toBeNull();
    expect(matchShortcut(key("q"))).toBeNull();
  });
});
