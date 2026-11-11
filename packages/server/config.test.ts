import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAX_SKETCH_BYTES, DEFAULT_MAX_SKETCH_FILES, loadConfig } from "./config.ts";

describe("loadConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads the sketch limits from the environment", () => {
    vi.stubEnv("MAX_SKETCH_FILES", "200");
    vi.stubEnv("MAX_SKETCH_BYTES", "4194304");
    expect(loadConfig()).toMatchObject({ maxSketchFiles: 200, maxSketchBytes: 4194304 });
  });

  it("falls back to the defaults for missing or invalid values", () => {
    vi.stubEnv("MAX_SKETCH_FILES", "");
    vi.stubEnv("MAX_SKETCH_BYTES", "lots");
    expect(loadConfig()).toMatchObject({
      maxSketchFiles: DEFAULT_MAX_SKETCH_FILES,
      maxSketchBytes: DEFAULT_MAX_SKETCH_BYTES,
    });
  });
});
