import { describe, expect, it } from "vitest";
import {
  EMPTY_LOG,
  MAX_HISTORY,
  MAX_LINE_CHARS,
  appendInput,
  appendOutput,
  logToText,
  pushHistory,
} from "./serial";

const texts = (log: typeof EMPTY_LOG) => log.lines.map((l) => `${l.kind}:${l.text}@${l.nanos}`);

describe("serial log", () => {
  it("splits output into lines, joining chunks and dropping CR before LF", () => {
    let log = appendOutput(EMPTY_LOG, [{ text: "Hel", nanos: 1 }]);
    expect(log.open).toBe(true);
    log = appendOutput(log, [
      { text: "lo\r", nanos: 2 },
      { text: "\n", nanos: 3 },
      { text: "a\nb\n", nanos: 4 },
      { text: "\n", nanos: 5 },
    ]);
    expect(texts(log)).toEqual(["out:Hello@1", "out:a@4", "out:b@4", "out:@5"]);
    expect(log.open).toBe(false);
  });

  it("puts sent commands on their own line", () => {
    let log = appendOutput(EMPTY_LOG, [{ text: "> ", nanos: 1 }]);
    log = appendInput(log, "red", 2);
    log = appendOutput(log, [{ text: "OK red\r\n", nanos: 3 }]);
    expect(texts(log)).toEqual(["out:> @1", "in:red@2", "out:OK red@3"]);
    expect(new Set(log.lines.map((l) => l.id)).size).toBe(3);
    expect(logToText(log, false)).toBe("> \n> red\nOK red");
    expect(logToText(log, true)).toBe("[00:00.000] > \n[00:00.000] > red\n[00:00.000] OK red");
  });

  it("wraps endless lines", () => {
    const log = appendOutput(EMPTY_LOG, [{ text: "x".repeat(MAX_LINE_CHARS * 2 + 5), nanos: 0 }]);
    expect(log.lines.map((l) => l.text.length)).toEqual([MAX_LINE_CHARS, MAX_LINE_CHARS, 5]);
  });

  it("keeps a short command history without consecutive repeats", () => {
    let h: string[] = [];
    for (const c of ["a", "a", "", "b", "a"]) h = pushHistory(h, c);
    expect(h).toEqual(["a", "b", "a"]);
    for (let i = 0; i < 100; i++) h = pushHistory(h, String(i));
    expect(h).toHaveLength(MAX_HISTORY);
    expect(h[h.length - 1]).toBe("99");
  });
});
