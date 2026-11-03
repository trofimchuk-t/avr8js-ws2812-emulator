import { createHash } from "node:crypto";
import { createSimulation } from "../src/simulation.ts";

export const LED_COUNT = 50;
export const CHECKPOINTS_MS = [100, 500, 1000, 2000];
/** Chunk size for stepping. The frame check runs once per chunk, so this is part of the golden. */
const STEP_CYCLES = 16_000; // 1 ms

export interface GoldenResult {
  /** sha256 prefix of the latest frame at each checkpoint, keyed by simulated ms. */
  frames: Record<string, string>;
  serial: string;
}

function hashFrame(pixels: Uint32Array | null) {
  if (!pixels) return "none";
  return createHash("sha256").update(new Uint8Array(pixels.buffer)).digest("hex").slice(0, 16);
}

/** Runs the HEX headless and deterministically, without timers or a browser. */
export function runGolden(hex: string): GoldenResult {
  let latest: Uint32Array | null = null;
  let serial = "";
  const sim = createSimulation({
    hex,
    led: { count: LED_COUNT },
    onFrame: (pixels) => (latest = pixels),
    onSerial: (char) => (serial += char),
  });
  const frames: Record<string, string> = {};
  let ms = 0;
  for (const checkpoint of CHECKPOINTS_MS) {
    for (; ms < checkpoint; ms++) sim.step(STEP_CYCLES);
    frames[String(checkpoint)] = hashFrame(latest);
  }
  sim.stop();
  return { frames, serial };
}
