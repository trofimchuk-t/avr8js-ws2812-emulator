/** Pinned toolchain. Changing any of these changes timings, so the cache key includes them. */
export const FQBN = "arduino:avr:uno";
export const CORE = { id: "arduino:avr", version: "1.8.8" };
export const LIBRARIES = [{ name: "FastLED", version: "3.6.0" }];

export const TOOLCHAIN_ID = [
  FQBN,
  `${CORE.id}@${CORE.version}`,
  ...LIBRARIES.map((l) => `${l.name}@${l.version}`),
].join("+");

export interface ServerConfig {
  cliPath: string;
  maxSketchBytes: number;
  buildTimeoutMs: number;
  maxConcurrentBuilds: number;
  /** Builds waiting beyond the running ones; more than this gets HTTP 503. */
  maxQueuedBuilds: number;
  cacheEntries: number;
}

function int(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadConfig(): ServerConfig {
  return {
    cliPath: process.env.ARDUINO_CLI ?? "arduino-cli",
    maxSketchBytes: int("MAX_SKETCH_BYTES", 64 * 1024),
    buildTimeoutMs: int("BUILD_TIMEOUT_MS", 60_000),
    maxConcurrentBuilds: int("MAX_CONCURRENT_BUILDS", 2),
    maxQueuedBuilds: int("MAX_QUEUED_BUILDS", 8),
    cacheEntries: int("CACHE_ENTRIES", 200),
  };
}
