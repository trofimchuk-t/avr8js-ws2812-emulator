import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runGolden, type GoldenResult } from "./golden.ts";

const fixtures = new URL("./fixtures/", import.meta.url);
const golden: Record<string, GoldenResult> = JSON.parse(
  readFileSync(new URL("golden.json", fixtures), "utf8"),
);

// Regenerate with `yarn golden:update` after an intentional change to the toolchain or decoder.
describe("golden frames (HEX fixtures run headless in Node)", () => {
  for (const [name, expected] of Object.entries(golden)) {
    it(name, () => {
      const hex = readFileSync(new URL(`${name}.hex`, fixtures), "utf8");
      expect(runGolden(hex)).toEqual(expected);
    });
  }

  it("produces real frames, not only the no-frame placeholder", () => {
    const frames = Object.values(golden).flatMap((g) => Object.values(g.frames));
    expect(frames.some((f) => f !== "none")).toBe(true);
  });
});
