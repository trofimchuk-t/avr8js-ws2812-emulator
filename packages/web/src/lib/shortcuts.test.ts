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

  it("ignores plain keys, Alt combinations and unknown keys", () => {
    expect(matchShortcut(key("Enter", { [mod]: false }))).toBeNull();
    expect(matchShortcut(key("s", { altKey: true }))).toBeNull();
    expect(matchShortcut(key("q"))).toBeNull();
  });
});
