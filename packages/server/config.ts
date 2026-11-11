import { resolve } from "node:path";

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
  /** Total size of all files of one sketch, in UTF-8 bytes (`MAX_SKETCH_BYTES`). */
  maxSketchBytes: number;
  /** Number of files in one sketch (`MAX_SKETCH_FILES`). */
  maxSketchFiles: number;
  buildTimeoutMs: number;
  maxConcurrentBuilds: number;
  /** Builds waiting beyond the running ones; more than this gets HTTP 503. */
  maxQueuedBuilds: number;
  cacheEntries: number;
  /** Holds the SQLite file and the sketch files. */
  dataDir: string;
  ownerId: string;
}

export const DEFAULT_MAX_SKETCH_BYTES = 1024 * 1024;
export const DEFAULT_MAX_SKETCH_FILES = 64;

function int(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadConfig(): ServerConfig {
  return {
    cliPath: process.env.ARDUINO_CLI ?? "arduino-cli",
    maxSketchBytes: int("MAX_SKETCH_BYTES", DEFAULT_MAX_SKETCH_BYTES),
    maxSketchFiles: int("MAX_SKETCH_FILES", DEFAULT_MAX_SKETCH_FILES),
    buildTimeoutMs: int("BUILD_TIMEOUT_MS", 60_000),
    maxConcurrentBuilds: int("MAX_CONCURRENT_BUILDS", 2),
    maxQueuedBuilds: int("MAX_QUEUED_BUILDS", 8),
    cacheEntries: int("CACHE_ENTRIES", 200),
    dataDir: resolve(process.env.DATA_DIR ?? "data"),
    // Authentication is deferred: every project belongs to this one user.
    ownerId: "local",
  };
}
