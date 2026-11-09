import { describe, expect, it } from "vitest";
import { parseDiagnostics } from "./diagnostics";

const OUTPUT = `a.ino: In function 'void setup()':
a.ino:2:15: error: 'foo' was not declared in this scope
 void setup(){ foo(); }
               ^~~
a.ino:2:15: note: suggested alternative: 'feof'
b.h:7: warning: "X" redefined
/home/u/Arduino/libraries/FastLED/FastLED.h:14:21: warning: library note
In file included from a.ino:1:0:
b.h:3:1: fatal error: c.h: No such file or directory
Error during build: exit status 1`;

describe("parseDiagnostics", () => {
  const result = parseDiagnostics(OUTPUT, ["a.ino", "b.h"]);

  it("reads errors and warnings of sketch files with their position", () => {
    expect(result).toEqual([
      {
        file: "a.ino",
        line: 2,
        column: 15,
        severity: "error",
        message: "'foo' was not declared in this scope",
        outputLine: 1,
      },
      {
        file: "b.h",
        line: 7,
        column: undefined,
        severity: "warning",
        message: '"X" redefined',
        outputLine: 5,
      },
      {
        file: "b.h",
        line: 3,
        column: 1,
        severity: "error",
        message: "c.h: No such file or directory",
        outputLine: 8,
      },
    ]);
  });

  it("ignores notes, library paths and 'In file included from' lines", () => {
    expect(result.map((d) => d.outputLine)).not.toContain(4);
    expect(result.map((d) => d.outputLine)).not.toContain(6);
    expect(result.map((d) => d.outputLine)).not.toContain(7);
  });

  it("returns nothing for a clean build", () => {
    expect(parseDiagnostics("Sketch uses 4242 bytes", ["a.ino"])).toEqual([]);
  });
});
